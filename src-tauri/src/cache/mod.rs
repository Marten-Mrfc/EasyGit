pub mod diff_cache;
pub mod diff_parser;
pub mod models;

pub use diff_cache::DiffCache;
pub use diff_parser::parse_diff_parallel;
pub use models::{CacheConfig, DiffBatchResult, DiffResult, ParsedDiff};

/// Global cache instance (initialized on app startup)
pub static DIFF_CACHE: std::sync::OnceLock<DiffCache> = std::sync::OnceLock::new();

/// Initialize the global diff cache
pub fn init_cache(config: CacheConfig) {
    let cache = DiffCache::new(config);
    let _ = DIFF_CACHE.set(cache);
    // Phase 3: warm top recent entries from disk into memory.
    get_cache().load_recent_from_disk(10);
}

/// Get the global diff cache instance
pub fn get_cache() -> &'static DiffCache {
    DIFF_CACHE.get_or_init(|| DiffCache::new(CacheConfig::default()))
}
