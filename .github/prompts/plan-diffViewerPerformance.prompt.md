# Plan: Diff Viewer Performance Optimization (Tauri Desktop App)

## TL;DR

Eliminate diff viewer delays by **leveraging Rust backend** for heavy lifting, **persistent hybrid caching** (memory + disk), **multi-threaded diff parsing**, and **efficient IPC**. Target: cached diffs in <1ms, computed diffs in <100ms, full disk persistence across sessions.

**Recommended approach**: Move git operations + diff parsing to Rust backend using `git2-rs` + `rayon`, implement LRU + disk cache with `sled`, minimize IPC overhead with efficient serialization.

---

## Bottlenecks Identified

1. **IPC Round-trips** — Each `getDiff` call goes JS → Rust → JS; no local cache = cold starts
2. **Sequential Git Ops** — Git commands run serially in Rust; could parallelize with `.par_iter()`
3. **No Persistent Cache** — Cache clears on app restart; recompute diffs every session
4. **Single-threaded Parsing** — `parseDiff()` in JS main thread (avoidable in Tauri Rust backend)
5. **No Intelligent Preload** — Visible files in FileChecklist not background-fetched

---

## Platform Context: Tauri Desktop App

- **Desktop resources available**: Multi-threaded Rust backend, disk I/O, 500MB+ memory budget
- **Platform**: Windows/macOS/Linux (native webview, not browser)
- **Answers from user**:
  - Open to Rust backend suggestions
  - Mixed repo sizes (100-1000+ files)
  - Hybrid cache preferred (memory + optional disk)
  - Multi-threading OK
  - Whatever works (no tight constraints) are slow

---

## Architecture: Rust-Centric Approach

### Phase 1: Build Rust Backend Cache + IPC Layer (FOUNDATION)

1. **Create Rust cache store** (`src-tauri/src/cache/diff_cache.rs`)
   - **Memory cache**: LRU with `ordered-map` crate, 50 entries max (~20MB)
     - Key: `${repoPath}:${filePath}:${staged}`
     - Value: `CacheEntry { diff: String, parsed: ParsedDiff, timestamp: u64, access_count: u32 }`
   - **Disk cache**: `sled` embedded DB for persistence across sessions
     - Stores serialized diffs (bincode) with LRU eviction by access time
     - Auto-cleanup: evict oldest 10 entries when >100MB
   - **Methods**: `get(key)`, `set(key, value)`, `invalidate(key)`, `clear()`
   - **Thread-safe**: Use `Arc<DashMap>` for concurrent access from multiple Tauri commands

2. **Implement Tauri IPC commands** (`src-tauri/src/commands/diff.rs`)
   - `get_diff(repo_path, file_path, staged) -> DiffResult`
     - Check memory cache first → disk cache → compute (git + parse)
     - Return early if cache hit (zero IPC latency)
   - `get_diff_batch(repo_path, files[]) -> BatchResult`
     - Fetch multiple files in parallel with `rayon`
     - Single IPC round-trip for 10+ files w/ dedup
   - `preload_diffs(repo_path, visible_files[]) -> BackgroundTask`
     - Queue background batch diff load (non-blocking)

### Phase 2: Multi-threaded Diff Computation (HEAVY LIFTING)

3. **Implement parallel diff parsing in Rust** (`src-tauri/src/cache/diff_parser.rs`)
   - Use `git2-rs` library directly in Rust (faster than JS git shell escaping)
   - **Diff generation**: `Repository::diff_tree_to_index()` + `DiffStats`
   - **Parsing**: Split diff by hunks, use `rayon::par_iter()` for parallel hunk analysis
   - **Return format**: Serialize to `ParsedDiff` struct (bincode for speed)
   - **Multi-threaded**: Each file diff computed on thread pool, max 4 concurrent

4. **Create batch diff command** for FileChecklist preload
   - `get_diffs_batch(repo_path, files[], staged) -> Vec<DiffResult>`
   - Iterate files, check cache, compute missing in parallel
   - Return all in one IPC call (minimize round-trips)
   - Cache results immediately in background (async write to disk)

5. **Add preload background task** (`src-tauri/src/commands/preload.rs`)
   - `preload_visible_diffs(repo_path, visible_files[], staged) -> TaskId`
   - Spawns tokio task, non-blocking
   - Returns task ID for progress polling (optional: emit events on completion)

### Phase 3: Persistent Hybrid Cache (SESSION + DISK)

6. **Implement disk cache writes** (sled backend)
   - On cache hit/miss detection, spawn async write to sled
   - Use `bincode` serialization (fast, compact)
   - Key: `{repoPath}:{filePath}:{staged}` (reuse from memory cache)
   - Value: `ParsedDiff` + metadata (timestamp, size, access_count)
   - TTL: Store indefinitely, manual eviction by access time

7. **Load disk cache on app startup** (`src-tauri/src/lib.rs` setup)
   - On `tauri::Builder::setup()`: load top 10 recent diffs from sled into memory
   - Lazy-load remaining on first access
   - **Result**: Previously viewed diffs available instantly next session

8. **Implement cache invalidation**
   - On repo change: clear memory, keep disk (for switching back)
   - On file stage/unstage: invalidate specific entry
   - Manual clear: `clear_cache(repo_path)` command

### Phase 4: Optimize Frontend Integration (MINIMAL IPC)

9. **Refactor DiffPanel to leverage Tauri backend**
   - On file select: invoke `get_diff(repo, file, staged)`
   - **If memory cache hit**: Rust returns instantly (<1ms network, data already in memory)
   - **If disk cache hit**: Rust loads from sled (<50ms disk I/O)
   - **If miss**: Rust computes (multi-threaded, <200ms for 100KB+ diffs)
   - Single IPC call, no client-side parsing

10. **Implement batch preload in FileChecklist**
    - On Mount: Call `get_diffs_batch(visible_files)` once
    - Returns all visible file diffs in ONE IPC round-trip
    - Store in React state (cached in-memory for fast switching)
    - Invoke `preload_visible_diffs()` async for off-screen files

11. **Add request dedup at Rust layer** (automatic)
    - DashMap in `diff_cache.rs` handles concurrent requests
    - Two simultaneous requests for same file = one compute, both served from result
    - No app-level dedup needed

### Phase 5: Memory Management & Monitoring (STABILITY)

12. **LRU eviction in Rust** (automatic in both caches)
    - **Memory cache**: Evict oldest entry when 51st added
    - **Disk cache**: Evict oldest 10 entries when >100MB (configurable)
    - Track `access_count` and `timestamp` on every `get()`
    - Monitor: Log cache hit/miss ratio to console (dev mode)

13. **Cache invalidation strategy**
    - Explicit invalidation: `invalidate_diff(repo, file)` command
    - Staged change: `invalidate_diff()` triggered by git event listener
    - Repo switch: `clear_cache(old_repo)` in JS (memory cleared, disk preserved)
    - Manual: UI button → `clear_all_cache(repo)` command

---

## Rust Backend Structure

```
src-tauri/src/
├── commands/
│   ├── diff.rs           [NEW] `get_diff()`, `get_diff_batch()`, `preload_diffs()`
│   ├── git.rs            [MODIFY] Adjust if calling diff commands instead
│   └── mod.rs            [MODIFY] Register new diff commands
├── cache/
│   ├── mod.rs            [NEW] Export DiffCache struct
│   ├── diff_cache.rs     [NEW] Memory + disk cache implementation (Arc<DashMap> + sled)
│   ├── diff_parser.rs    [NEW] Parallel diff parsing with rayon + git2
│   └── models.rs         [NEW] CacheEntry, ParsedDiff, DiffResult structs
└── lib.rs               [MODIFY] Add cache initialization on startup
```

## Frontend Integration Points

- `src/components/diff/DiffPanel.tsx` — invoke Tauri `get_diff()` command, handle cache hits
- `src/components/commit/FileChecklist.tsx` — invoke `get_diff_batch()` on mount/scroll
- `src/lib/git.ts` — optional: add dedup wrapper or rely on Rust DashMap
- No Web Worker needed — all heavy lifting in Rust

---

## Verification & Benchmarks

### Performance Targets

- **Cached diff load**: <1ms (served from memory)
- **Disk-cached diff load**: <50ms (sled read + IPC)
- **Cold diff compute**: <200ms (rayon parallel parsing for 100KB diffs)
- **Batch preload**: 100ms total for 10 visible files
- **Memory ceiling**: 20MB (50 entries max, LRU enforced)

### Testing Steps

1. **Cache hit test**: Select same file twice → check Rust logs for "cache_hit=true"
2. **Preload test**: Open repo → check 5-10 visible files already in memory after FileChecklist mounts
3. **Memory test**: DevTools → Performance → memory graph should be flat during file switching
4. **Disk cache test**: Close app, reopen same repo → verify previously viewed diffs load instantly
5. **Dedup test**: Rapidly click same file 5x → Rust logs should show only 1 compute operation

### Rust Performance Profiling

```rust
// Add timing in diff cache
let start = std::time::Instant::now();
let cached = self.memory_cache.get(key);
debug!("Cache lookup: {}ms", start.elapsed().as_millis());
```

### Browser DevTools Verification

- Open DevTools → Network tab
- Select a file → verify single `invoke('get_diff', ...)` call
- Select same file again → verify no new invoke (served from React state/memory)
- Check Rust console output in VS Code terminal for cache hit/miss ratio
- **Web Worker non-blocking**: Parsing off-main-thread is safer than try-catches for massive diffs
- **Dedup in git layer**: Simpler than per-component dedup, prevents cascading calls
- **No IndexedDB**: Session-only cache; user closes app = cache clears (simpler, no persistence overhead)
- **Exclude blame/history**: Only cache diff + fileContent; blame/history load on-demand (rarely used)

---

## Further Considerations

1. **Web Worker overhead** — For very small diffs (<5KB), message passing cost > parse cost. Threshold: skip worker if diff < 10KB?
2. **Preload throttling** — Aggressive preload might hammer backend. Start with 3 concurrent, monitor git server load?
3. **Split mode rendering** — Current split-view computation is expensive. Consider lazy split-view tab (only parse if selected)?
4. **Blame/History tabs** — Currently prefetch fileContent on first load. Consider deferring blame entirely until tab selected?

---

## Implementation Effort Estimates

| Phase     | Component                    | Effort        | Dependencies                 | Notes                                    |
| --------- | ---------------------------- | ------------- | ---------------------------- | ---------------------------------------- |
| 1         | `diff_cache.rs` (memory LRU) | 2h            | None                         | Straightforward DashMap + ordered-map    |
| 1         | `diff_cache.rs` (disk sled)  | 1.5h          | sled crate                   | Basic key-value persistence              |
| 1         | `commands/diff.rs` basic     | 1.5h          | Phase 1.1 + 1.2              | Implement get_diff, get_diff_batch stubs |
| 2         | `diff_parser.rs`             | 3h            | git2-rs (already in project) | Parallel hunk parsing with rayon         |
| 2         | Batch integration            | 1h            | Phase 2.1                    | Wire batch into get_diff_batch command   |
| 2         | Preload task                 | 1h            | tokio (Tauri has it)         | Background preload orchestration         |
| 3         | Disk persistence             | 1.5h          | Phase 1.2, 2.1               | Async sled writes, TTL logic             |
| 3         | App startup load             | 1h            | Phase 3.1                    | Load top 10 from disk in setup()         |
| 3         | Invalidation                 | 0.5h          | Phase 3.1                    | Hook into file stage events              |
| 4         | DiffPanel refactor           | 1.5h          | Phase 1.1                    | Change lifecycle, leverage cache         |
| 4         | FileChecklist batch          | 1h            | Phase 1.2                    | Call get_diff_batch on mount             |
| 5         | Monitoring/logging           | 1h            | All phases                   | Add cache stats, hit ratio tracking      |
| **Total** |                              | **~17 hours** |                              | Can parallelize phases 1-2               |

**Critical Path**: Phase 1 → Phase 2 → Phase 4 (minimal dependency on Phase 3)  
**Quick Win**: Complete Phase 1 + 4 (5.5 hours) for 10-100x perf improvement on cache hits

---

## Crate Dependencies to Add

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
ordered-map = "0.5"          # LRU eviction for memory cache
sled = "0.34"                # Embedded DB for disk cache
bincode = "1.3"              # Fast serialization
rayon = "1.7"                # Parallel iterator support
dashmap = "5.5"              # Concurrent HashMap

# Likely already present:
git2 = "0.28"                # libgit2-rs
tauri = "2.0"                # Tauri framework
tokio = { version = "1", features = ["full"] }  # Async runtime
serde = { version = "1.0", features = ["derive"] }  # Serialization
```

---

## Design Decisions & Rationale

- **Rust backend for parsing**: Leverages Tauri's strength; 10-100x faster than JS parsing
- **DashMap for thread safety**: Multiple Tauri commands can access cache concurrently without locks
- **sled for disk cache**: Embedded DB perfect for desktop apps; no external dependencies
- **LRU over TTL**: Session cache persists until repo switch (user preference)
- **50-entry limit**: Balances memory vs. hit rate (typical workflow: 10-20 files active)
- **bincode serialization**: Compact binary format reduces disk I/O vs. JSON

---

## Next Steps

1. **Decide implementation scope**:
   - Option A: **Phase 1 only** (memory cache) — 5 hours, 50x speedup on cache hits
   - Option B: **Phases 1-2** (memory + Rust parsing) — 9 hours, 100x speedup + background preload
   - Option C: **Full stack 1-5** — 17 hours, persistent cache + disk + monitoring

2. **Start with Phase 1: Memory Cache**
   - Create `src-tauri/src/cache/diff_cache.rs` with DashMap-based LRU
   - Register `get_diff()` Tauri command that checks cache before git ops
   - Refactor DiffPanel to invoke Tauri instead of git.ts

3. **Test with real repo**
   - Time cache hit vs. cold compute
   - Monitor memory usage during typical workflow
   - Verify Rust logs show cache operations

4. **Iterate based on profiling**
   - If parsing is bottleneck → add Phase 2 (rayon parallelism)
   - If memory pressure high → implement Phase 5 (LRU eviction)
   - If accuracy needed → add Phase 3 (disk persistence)
