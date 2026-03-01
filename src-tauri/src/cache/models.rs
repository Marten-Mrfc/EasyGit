use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedHunk {
    pub header: String,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub context_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedFileDiff {
    pub file_path: String,
    pub hunks: Vec<ParsedHunk>,
    pub added_lines: usize,
    pub removed_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDiff {
    pub files: Vec<ParsedFileDiff>,
    pub total_files: usize,
    pub total_hunks: usize,
    pub total_added_lines: usize,
    pub total_removed_lines: usize,
}

/// Represents a parsed diff with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub file_path: String,
    pub diff_text: String,
    pub parsed: Option<ParsedDiff>,
    pub timestamp: u64,
    pub access_count: u32,
    pub size_bytes: usize,
}

/// Result of a diff operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub file_path: String,
    pub diff_text: String,
    pub parsed: Option<ParsedDiff>,
    pub parse_time_ms: u64,
    pub from_cache: bool,
}

/// Batch result for multiple diffs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffBatchResult {
    pub diffs: Vec<DiffResult>,
    pub total_cache_hits: usize,
    pub total_from_compute: usize,
}

/// Cache configuration
pub struct CacheConfig {
    pub max_entries: usize,
    pub max_memory_mb: usize,
    pub disk_cache_enabled: bool,
    pub disk_max_mb: usize,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_entries: 50,
            max_memory_mb: 20,
            disk_cache_enabled: true,
            disk_max_mb: 100,
        }
    }
}
