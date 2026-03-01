import { invoke } from "@tauri-apps/api/core";

/**
 * Phase 1: Cache-aware diff operations
 * 
 * These functions wrap the Rust backend diff commands that include
 * memory caching, LRU eviction, and batch operations.
 * 
 * Usage:
 *   - getDiffCached() → similar to getDiff() but with cache hits (<1ms)
 *   - getDiffBatch() → fetch 10+ files in one IPC call
 *   - preloadVisibleDiffs() → background preload for visible files
 */

export interface DiffResult {
  file_path: string;
  diff_text: string;
  parsed?: ParsedDiff;
  parse_time_ms: number;
  from_cache: boolean;
}

export interface ParsedHunk {
  header: string;
  added_lines: number;
  removed_lines: number;
  context_lines: number;
}

export interface ParsedFileDiff {
  file_path: string;
  hunks: ParsedHunk[];
  added_lines: number;
  removed_lines: number;
}

export interface ParsedDiff {
  files: ParsedFileDiff[];
  total_files: number;
  total_hunks: number;
  total_added_lines: number;
  total_removed_lines: number;
}

export interface DiffBatchResult {
  diffs: DiffResult[];
  total_cache_hits: number;
  total_from_compute: number;
}

export interface CacheStats {
  total_entries: number;
  memory_used_kb: number;
  disk_entries: number;
  disk_used_kb: number;
  requests: number;
  memory_hits: number;
  disk_hits: number;
  misses: number;
  hit_rate_pct: number;
  memory_evictions: number;
  disk_evictions: number;
  disk_reads: number;
  disk_writes: number;
  warm_loaded: number;
}

/**
 * Get a diff with memory caching enabled
 * 
 * Returns cached result instantly if available (<1ms).
 * Cold computes run in Rust backend in parallel and cache the result.
 */
export async function getDiffCached(
  repoPath: string,
  filePath: string,
  staged: boolean
): Promise<DiffResult> {
  return invoke<DiffResult>("get_diff_cached", {
    repoPath,
    filePath,
    staged,
  });
}

/**
 * Batch fetch diffs for multiple files
 * 
 * Single IPC call for 10+ files. Returns immediately with mix of
 * cached and computed diffs. Much faster than multiple getDiffCached calls.
 * 
 * Example:
 *   const results = await getDiffBatch(
 *     repoPath,
 *     ["file1.ts", "file2.tsx", "styles.css"],
 *     false
 *   );
 *   // Returns: { diffs: [DiffResult, ...], total_cache_hits: 2, total_from_compute: 1 }
 */
export async function getDiffBatch(
  repoPath: string,
  files: string[],
  staged: boolean
): Promise<DiffBatchResult> {
  return invoke<DiffBatchResult>("get_diff_batch", {
    repoPath,
    files,
    staged,
  });
}

/**
 * Preload diffs for visible files in background
 * 
 * Non-blocking call. Returns immediately. Loading happens in Rust backend.
 * Useful for FileChecklist component - call on mount to preload visible files.
 * 
 * Example:
 *   useEffect(() => {
 *     preloadVisibleDiffs(repoPath, visibleFiles, false);
 *   }, [repoPath, visibleFiles]);
 */
export async function preloadVisibleDiffs(
  repoPath: string,
  files: string[],
  staged: boolean
): Promise<string> {
  return invoke<string>("preload_visible_diffs", {
    repoPath,
    files,
    staged,
  });
}

/**
 * Clear cache for a repository
 * 
 * Triggered when:
 * - User switches repository
 * - User refreshes manually
 * - File is staged/unstaged (triggers invalidation of specific entry)
 */
export async function clearDiffCache(repoPath: string): Promise<string> {
  return invoke<string>("clear_diff_cache", { repoPath });
}

export async function invalidateDiff(
  repoPath: string,
  filePath: string,
  staged: boolean
): Promise<string> {
  return invoke<string>("invalidate_diff", {
    repoPath,
    filePath,
    staged,
  });
}

/**
 * Get current cache statistics for monitoring
 * 
 * Returns number of cached entries and memory usage.
 * Useful for debugging performance.
 */
export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>("get_cache_stats", {});
}

/**
 * Hook for React to log cache stats in dev mode
 */
export function useLogCacheStats(enabled = false) {
  if (!enabled) return;
  
  getCacheStats()
    .then((stats) => {
      console.log(
        `📊 Diff Cache | HitRate: ${stats.hit_rate_pct.toFixed(1)}% | Hits: ${stats.memory_hits + stats.disk_hits}/${stats.requests} | Misses: ${stats.misses} | Memory: ${stats.memory_used_kb}KB (${stats.total_entries} entries) | Disk: ${stats.disk_used_kb}KB (${stats.disk_entries} entries) | Evictions M/D: ${stats.memory_evictions}/${stats.disk_evictions}`
      );
    })
    .catch((err) => console.error("Failed to get cache stats:", err));
}
