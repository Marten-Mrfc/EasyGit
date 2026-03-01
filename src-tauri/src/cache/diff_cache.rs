use crate::cache::models::{CacheConfig, CacheEntry, ParsedDiff};
use dashmap::DashMap;
use indexmap::IndexMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct CacheCounters {
    memory_hits: AtomicU64,
    disk_hits: AtomicU64,
    misses: AtomicU64,
    memory_evictions: AtomicU64,
    disk_evictions: AtomicU64,
    disk_reads: AtomicU64,
    disk_writes: AtomicU64,
    warm_loaded: AtomicU64,
}

/// Thread-safe LRU cache for diff data
pub struct DiffCache {
    /// Key: "{repo_path}:{file_path}:{staged}" → Value: CacheEntry
    memory: Arc<DashMap<String, CacheEntry>>,
    /// Track access order for LRU (separately since DashMap doesn't preserve order)
    access_order: Arc<std::sync::Mutex<IndexMap<String, u64>>>,
    /// Optional persistent disk cache for Phase 3
    disk: Option<sled::Db>,
    counters: CacheCounters,
    config: CacheConfig,
}

impl DiffCache {
    pub fn new(config: CacheConfig) -> Self {
        let disk = if config.disk_cache_enabled {
            let path = Self::resolve_disk_cache_path();
            if let Err(e) = std::fs::create_dir_all(&path) {
                eprintln!("Failed to create disk cache dir {}: {}", path.display(), e);
                None
            } else {
                match sled::open(&path) {
                    Ok(db) => Some(db),
                    Err(e) => {
                        eprintln!("Failed to open disk cache {}: {}", path.display(), e);
                        None
                    }
                }
            }
        } else {
            None
        };

        Self {
            memory: Arc::new(DashMap::new()),
            access_order: Arc::new(std::sync::Mutex::new(IndexMap::new())),
            disk,
            counters: CacheCounters::default(),
            config,
        }
    }

    #[cfg(test)]
    pub fn default_instance() -> Self {
        let config = CacheConfig {
            disk_cache_enabled: false,
            ..CacheConfig::default()
        };
        Self::new(config)
    }

    fn resolve_disk_cache_path() -> PathBuf {
        let mut base = if cfg!(target_os = "windows") {
            std::env::var("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        } else {
            std::env::var("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        };

        base.push("EasyGit");
        base.push("diff-cache");
        base
    }

    /// Generate cache key
    fn make_key(repo_path: &str, file_path: &str, staged: bool) -> String {
        format!(
            "{}:{}:{}",
            repo_path,
            file_path,
            if staged { "staged" } else { "unstaged" }
        )
    }

    /// Get current timestamp in seconds since epoch
    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn write_disk_entry(&self, key: &str, entry: &CacheEntry) {
        let Some(db) = &self.disk else {
            return;
        };

        match bincode::serialize(entry) {
            Ok(bytes) => {
                if let Err(e) = db.insert(key.as_bytes(), bytes) {
                    eprintln!("Failed to write disk cache entry: {}", e);
                    return;
                }
                self.counters.disk_writes.fetch_add(1, Ordering::Relaxed);
                let _ = db.flush_async();
                self.evict_disk_if_needed();
            }
            Err(e) => eprintln!("Failed to serialize cache entry: {}", e),
        }
    }

    fn read_disk_entry(&self, key: &str) -> Option<CacheEntry> {
        let Some(db) = &self.disk else {
            return None;
        };

        let raw = db.get(key.as_bytes()).ok()??;
        self.counters.disk_reads.fetch_add(1, Ordering::Relaxed);
        bincode::deserialize::<CacheEntry>(&raw).ok()
    }

    fn memory_bytes(&self) -> usize {
        self.memory
            .iter()
            .map(|entry| entry.value().size_bytes)
            .sum::<usize>()
    }

    fn record_access_order(&self, key: &str) {
        if let Ok(mut order) = self.access_order.lock() {
            order.shift_remove(key);
            order.shift_insert(0, key.to_string(), Self::current_timestamp());
        }
    }

    fn evict_memory_if_needed(&self) {
        let max_memory_bytes = self.config.max_memory_mb.saturating_mul(1024 * 1024);
        if let Ok(mut order) = self.access_order.lock() {
            while self.memory.len() > self.config.max_entries
                || self.memory_bytes() > max_memory_bytes
            {
                if let Some((lru_key, _)) = order.pop() {
                    self.memory.remove(&lru_key);
                    self.counters
                        .memory_evictions
                        .fetch_add(1, Ordering::Relaxed);
                } else {
                    break;
                }
            }
        }
    }

    fn disk_usage_bytes(&self) -> usize {
        let Some(db) = &self.disk else {
            return 0;
        };

        db.iter().filter_map(Result::ok).map(|(_, v)| v.len()).sum()
    }

    fn evict_disk_if_needed(&self) {
        let Some(db) = &self.disk else {
            return;
        };

        let max_disk_bytes = self.config.disk_max_mb.saturating_mul(1024 * 1024);
        if self.disk_usage_bytes() <= max_disk_bytes {
            return;
        }

        let mut entries: Vec<(String, u64)> = db
            .iter()
            .filter_map(Result::ok)
            .filter_map(|(k, v)| {
                let key = String::from_utf8(k.to_vec()).ok()?;
                let entry: CacheEntry = bincode::deserialize(&v).ok()?;
                Some((key, entry.timestamp))
            })
            .collect();

        // Oldest first
        entries.sort_by_key(|(_, ts)| *ts);

        let mut evicted = 0u64;
        for (key, _) in entries.into_iter().take(10) {
            let _ = db.remove(key.as_bytes());
            evicted += 1;
        }
        if evicted > 0 {
            self.counters
                .disk_evictions
                .fetch_add(evicted, Ordering::Relaxed);
        }
        let _ = db.flush_async();
    }

    fn insert_memory_entry_by_key(&self, key: String, entry: CacheEntry) {
        self.memory.insert(key.clone(), entry);
        self.record_access_order(&key);
        self.evict_memory_if_needed();
    }

    /// Get a cached diff, updating access metadata
    pub fn get(&self, repo_path: &str, file_path: &str, staged: bool) -> Option<CacheEntry> {
        let key = Self::make_key(repo_path, file_path, staged);

        if let Some(mut entry) = self.memory.get_mut(&key) {
            self.counters.memory_hits.fetch_add(1, Ordering::Relaxed);
            // Update access metadata
            entry.access_count = entry.access_count.saturating_add(1);
            entry.timestamp = Self::current_timestamp();
            self.record_access_order(&key);
            self.write_disk_entry(&key, &entry.clone());

            Some(entry.clone())
        } else {
            let Some(mut disk_entry) = self.read_disk_entry(&key) else {
                self.counters.misses.fetch_add(1, Ordering::Relaxed);
                return None;
            };
            self.counters.disk_hits.fetch_add(1, Ordering::Relaxed);
            disk_entry.access_count = disk_entry.access_count.saturating_add(1);
            disk_entry.timestamp = Self::current_timestamp();

            self.insert_memory_entry_by_key(key.clone(), disk_entry.clone());
            self.write_disk_entry(&key, &disk_entry);

            Some(disk_entry)
        }
    }

    /// Store a diff in cache without parsed payload.
    pub fn set(&self, repo_path: &str, file_path: &str, staged: bool, diff_text: String) {
        self.set_with_parsed(repo_path, file_path, staged, diff_text, None);
    }

    /// Store a diff in cache with optional parsed payload.
    pub fn set_with_parsed(
        &self,
        repo_path: &str,
        file_path: &str,
        staged: bool,
        diff_text: String,
        parsed: Option<ParsedDiff>,
    ) {
        let key = Self::make_key(repo_path, file_path, staged);
        let size_bytes = diff_text.len();

        let entry = CacheEntry {
            file_path: file_path.to_string(),
            diff_text,
            parsed,
            timestamp: Self::current_timestamp(),
            access_count: 0,
            size_bytes,
        };

        self.insert_memory_entry_by_key(key.clone(), entry.clone());
        self.write_disk_entry(&key, &entry);
    }

    /// Remove a specific cache entry
    pub fn invalidate(&self, repo_path: &str, file_path: &str, staged: bool) {
        let key = Self::make_key(repo_path, file_path, staged);
        self.memory.remove(&key);

        if let Ok(mut order) = self.access_order.lock() {
            order.shift_remove(&key);
        }
    }

    /// Clear all cache entries for a repository
    pub fn clear_repo(&self, repo_path: &str) {
        let prefix = format!("{}:", repo_path);

        self.memory.retain(|k, _| !k.starts_with(&prefix));

        if let Ok(mut order) = self.access_order.lock() {
            order.retain(|k, _| !k.starts_with(&prefix));
        }
    }

    /// Phase 3 startup warm-load: hydrate the top recent disk entries into memory.
    pub fn load_recent_from_disk(&self, limit: usize) {
        let Some(db) = &self.disk else {
            return;
        };

        let mut entries: Vec<(String, CacheEntry)> = db
            .iter()
            .filter_map(Result::ok)
            .filter_map(|(k, v)| {
                let key = String::from_utf8(k.to_vec()).ok()?;
                let entry: CacheEntry = bincode::deserialize(&v).ok()?;
                Some((key, entry))
            })
            .collect();

        entries.sort_by_key(|(_, entry)| std::cmp::Reverse(entry.timestamp));

        for (key, entry) in entries.into_iter().take(limit) {
            self.insert_memory_entry_by_key(key, entry);
            self.counters.warm_loaded.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let disk_usage_kb = self.disk_usage_bytes() / 1024;
        let disk_entries = self.disk.as_ref().map(|db| db.len()).unwrap_or(0);

        let memory_hits = self.counters.memory_hits.load(Ordering::Relaxed);
        let disk_hits = self.counters.disk_hits.load(Ordering::Relaxed);
        let misses = self.counters.misses.load(Ordering::Relaxed);
        let requests = memory_hits + disk_hits + misses;
        let hit_rate_pct = if requests == 0 {
            0.0
        } else {
            ((memory_hits + disk_hits) as f64 * 100.0) / requests as f64
        };

        CacheStats {
            total_entries: self.memory.len(),
            memory_used_kb: self
                .memory
                .iter()
                .map(|entry| entry.value().size_bytes)
                .sum::<usize>()
                / 1024,
            disk_entries,
            disk_used_kb: disk_usage_kb,
            requests,
            memory_hits,
            disk_hits,
            misses,
            hit_rate_pct,
            memory_evictions: self.counters.memory_evictions.load(Ordering::Relaxed),
            disk_evictions: self.counters.disk_evictions.load(Ordering::Relaxed),
            disk_reads: self.counters.disk_reads.load(Ordering::Relaxed),
            disk_writes: self.counters.disk_writes.load(Ordering::Relaxed),
            warm_loaded: self.counters.warm_loaded.load(Ordering::Relaxed),
        }
    }

    /// Log cache hit/miss for debugging
    pub fn log_access(&self, hit: bool) {
        let stats = self.stats();
        if hit {
            println!(
                "🟢 Cache HIT | Rate: {:.1}% ({}/{}) | Memory: {}KB | Disk: {} entries/{}KB",
                stats.hit_rate_pct,
                stats.memory_hits + stats.disk_hits,
                stats.requests,
                stats.memory_used_kb,
                stats.disk_entries,
                stats.disk_used_kb
            );
        } else {
            println!(
                "🔴 Cache MISS | Rate: {:.1}% ({}/{}) | Memory: {}KB | Disk: {} entries/{}KB",
                stats.hit_rate_pct,
                stats.memory_hits + stats.disk_hits,
                stats.requests,
                stats.memory_used_kb,
                stats.disk_entries,
                stats.disk_used_kb
            );
        }
    }
}

#[derive(Debug)]
pub struct CacheStats {
    pub total_entries: usize,
    pub memory_used_kb: usize,
    pub disk_entries: usize,
    pub disk_used_kb: usize,
    pub requests: u64,
    pub memory_hits: u64,
    pub disk_hits: u64,
    pub misses: u64,
    pub hit_rate_pct: f64,
    pub memory_evictions: u64,
    pub disk_evictions: u64,
    pub disk_reads: u64,
    pub disk_writes: u64,
    pub warm_loaded: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_set_get() {
        let cache = DiffCache::default_instance();
        cache.set("/repo", "file.txt", false, "diff content".to_string());

        let result = cache.get("/repo", "file.txt", false);
        assert!(result.is_some());
        assert_eq!(result.unwrap().diff_text, "diff content");
    }

    #[test]
    fn test_cache_miss() {
        let cache = DiffCache::default_instance();
        let result = cache.get("/repo", "nonexistent.txt", false);
        assert!(result.is_none());
    }

    #[test]
    fn test_lru_eviction() {
        let config = CacheConfig {
            max_entries: 3,
            ..Default::default()
        };
        let cache = DiffCache::new(config);

        // Fill cache to capacity
        cache.set("/repo", "f1.txt", false, "content1".to_string());
        cache.set("/repo", "f2.txt", false, "content2".to_string());
        cache.set("/repo", "f3.txt", false, "content3".to_string());
        assert_eq!(cache.memory.len(), 3);

        // Adding one more should evict oldest
        cache.set("/repo", "f4.txt", false, "content4".to_string());
        assert_eq!(cache.memory.len(), 3);
        assert!(cache.get("/repo", "f1.txt", false).is_none()); // f1 was oldest
    }
}
