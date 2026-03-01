# EasyGit: Tauri Desktop Application

## Critical Context for AI Agents

**This is a Windows/desktop application, NOT a web app or mobile hybrid.**

### Architecture Summary

- **Framework**: Tauri 2.x (v2.10.2) - native desktop framework
- **Frontend**: React 18 + TypeScript (runs in native webview)
- **Backend**: Rust with git2-rs bindings (libgit2)
- **Platform**: Windows, macOS, Linux (primary: Windows)
- **IPC Pattern**: Tauri invoke/listen (synchronous JS → Rust commands)
- **Resources**: Full access to filesystem, multi-threading, 500MB+ RAM available

### Key Implications for Development

#### ❌ Do NOT Assume Web Constraints

- No CORS restrictions
- No Web Workers needed (use Rust backend threading instead)
- No service worker limitations
- Full filesystem I/O available
- Native system APIs accessible via Tauri

#### ✅ Leverage Desktop Resources

- **Rust backend** for heavy lifting (git operations, diff parsing, etc.)
- **Tokio async runtime** for non-blocking operations
- **Multi-threading** with rayon for parallel processing
- **Tauri invoke commands** (#[command] macro) for reliable IPC
- **sled embedded database** for persistent local storage (no external DB needed)

### Project Structure

```yml
EasyGit/
├── src/                          # React 18 frontend TypeScript
│   ├── components/
│   │   ├── diff/                 # Diff viewer components
│   │   ├── commit/               # Commit builder
│   │   ├── layout/               # Main layout shells
│   │   ├── views/                # App views (changes, history, branches, etc.)
│   │   └── ui/                   # shadcn/ui components
│   ├── hooks/                    # React hooks
│   ├── lib/                       # Utilities (git.ts wraps Tauri invoke)
│   ├── store/                     # Zustand stores (authStore, repoStore)
│   └── App.tsx                    # Main app component
├── src-tauri/                     # Rust backend (Tauri commands)
│   ├── src/
│   │   ├── commands/              # Tauri #[command] handlers
│   │   │   ├── git.rs            # Git operations
│   │   │   ├── diff.rs           # Diff operations [PLANNED]
│   │   │   ├── oauth.rs          # GitHub OAuth
│   │   │   ├── branch.rs         # Branch operations
│   │   │   ├── remote.rs         # Remote operations
│   │   │   ├── stash.rs          # Stash operations
│   │   │   ├── tags.rs           # Tag operations
│   │   │   ├── worktree.rs       # Worktree operations
│   │   │   └── mod.rs            # Command registry
│   │   ├── cache/                 # Cache layer [PLANNED]
│   │   │   ├── diff_cache.rs     # LRU cache with disk persistence
│   │   │   ├── diff_parser.rs    # Parallel diff parsing
│   │   │   └── mod.rs
│   │   ├── lib.rs                 # Tauri app setup
│   │   └── main.rs                # Entry point
│   ├── tauri.conf.json            # Tauri config (windows, security, bundle)
│   ├── Cargo.toml                 # Rust dependencies
│   └── capabilities/              # Tauri security capabilities
├── .github/prompts/               # AI agent prompts and plans
│   └── plan-diffViewerPerformance.prompt.md  # Current perf optimization plan
└── AGENTS.md [THIS FILE]          # Context for future agent sessions
```

### Active Work: Diff Viewer Performance Optimization

**Status**: Planning phase complete, implementation starting (Phase 1)

**Plan**: `.github/prompts/plan-diffViewerPerformance.prompt.md`

**Strategy**:

- Move diff caching to Rust backend (DashMap + sled)
- Implement Tauri `get_diff()` command with LRU eviction
- Multi-threaded diff parsing with tokio + rayon
- Batch preload commands for file lists
- Expected result: <1ms cached reads, <200ms cold computes

**Phases**:

1. **Memory cache + basic command** (5h) → 50x speedup
2. **Rust diff parsing** (4h) → 100x speedup
3. **Disk cache** (2h) → persistence
4. **Frontend integration** (2h) → complete pipeline

### Previous Work

**ChangesView.tsx Optimization (Completed)**:

- ✅ React.lazy() for ConventionalCommitBuilder, DiffPanel, PublishToGitHubDialog
- ✅ Suspense boundaries with custom fallback skeletons
- ✅ Component memoization (Header extracted)
- ✅ useCallback for handlers (handlePull, handlePush, handlePublishSuccess, handleViewDiff)
- Impact: Non-blocking UI, renders lightweight header while subcomponents load

### Important Files for Understanding

1. **Frontend Git Integration**: `src/lib/git.ts`
   - All Tauri invoke calls go through here
   - Will be extended with new diff commands

2. **Repository Store**: `src/store/repoStore.ts`
   - Zustand pattern (copy this for cache stores)
   - Manages current repo state

3. **Diff Viewer**: `src/components/diff/`
   - DiffPanel.tsx (orchestrates diff display)
   - DiffViewer.tsx (renders diff with virtualization)
   - parser.ts (diff text → parsed structure)
   - Will be refactored to consume Rust-computed diffs

4. **File List**: `src/components/commit/FileChecklist.tsx`
   - Preload trigger point
   - Will call get_diffs_batch on mount

### Technology Stack Deep Dive

#### Tauri 2.x Features Used

- **Invoke Pattern**: `invoke<T>('command_name', args)` → Rust #[command] handler
- **Event Emitter**: `emit()` / `listen()` for background task updates
- **Window Management**: WebviewWindow class for multi-window support
- **Security**: Capabilities system, Content-Security-Policy, sealed asset protocol
- **Builder Pattern**: Fluent app configuration in main.rs

#### Rust Backend Stack

- **git2**: Thread-safe Repository operations, Diff, Blame, Tree walking
- **tokio**: Async runtime (already in Tauri)
- **rayon**: Data parallelism for CPU-bound tasks (diff hunk processing)
- **sled**: Embedded key-value store (persistent session cache)
- **bincode**: Fast binary serialization
- **dashmap**: Concurrent HashMap (no manual locking)

#### Frontend Stack

- **React 18**: Modern hooks, Suspense, startTransition
- **TypeScript**: Type-safe Tauri invoke parameters
- **Zustand**: Lightweight state management with persistence
- **shadcn/ui**: Headless UI components (accessible, customizable)
- **Resizable**: Drag-able panel splits (React Resizable)
- **TanStack Virtual**: Windowed/virtualized lists for large diffs

### Debugging & Development

#### Running the App

```bash
# Start dev server (UI + Tauri backend)
npm run dev          # or: bun dev

# Runs two parallel tasks:
# - ui:dev (Vite hot reload on http://localhost:5173)
# - build:debug (Tauri Rust compilation)
# Combined in 'dev' task dependency
```

#### Rust Debugging

- **LLDB Debugger**: VS Code CodeLLDB extension configured
- **Rust Console**: Output visible in "Tauri Development Debug" terminal
- **Build Command**: `cargo build --manifest-path src-tauri/Cargo.toml`
- **Logging**: Use `println!()` / `debug!()` macros (debug level visible in console)

#### Browser DevTools

- **DevTools**: Right-click → "Inspect" or F12 (native webview debugging)
- **Network Tab**: Monitor `invoke()` calls (shows IPC timing)
- **Console**: React warnings, application logs
- **Performance**: Profile React renders, JS execution

### Common Pitfalls to Avoid

1. **Assuming Web Constraints**
   - Wrong: Creating Web Workers for CPU-bound tasks
   - Right: Offload to Rust backend with tokio threads

2. **Serialization Overhead**
   - Wrong: Large JSON objects over IPC
   - Right: Use bincode, batch requests, lazy-load results

3. **Blocking Main Thread**
   - Wrong: Large parsing/computation in React useMemo
   - Right: Move to Rust backend, invoke async, store result

4. **Memory Leaks**
   - Wrong: Unbounded caches without eviction
   - Right: Implement LRU, monitor with DevTools

5. **Missing Error Handling**
   - Wrong: Unwrap errors in Rust, crash app
   - Right: `Return Result<T>`, handle in frontend gracefully

### Quick Reference: Adding a New Tauri Command

**Rust side** (`src-tauri/src/commands/`):

```rust
#[tauri::command]
pub async fn my_command(arg: String) -> Result<String, String> {
    match operation(&arg) {
        Ok(result) => Ok(result),
        Err(e) => Err(e.to_string()),
    }
}

// Register in mod.rs:
pub fn all_commands() -> Vec<Box<dyn Fn(Invoke) + Send + Sync + 'static>> {
    vec![
        tauri::command! { my_command },
        // ... other commands
    ]
}
```

**Frontend side** (`src/lib/git.ts`):

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function myCommand(arg: string): Promise<string> {
  return invoke<string>("my_command", { arg });
}
```

**React component**:

```typescript
const result = await myCommand("value");
```

### Future Optimizations Already Identified

- [ ] Blame/History caching (similar to diff cache)
- [ ] Binary diff detection (skip large binary files)
- [ ] Staged/unstaged diff merging (combined view)
- [ ] Reference caching (branch HEADs, tags)
- [ ] Background diff auto-refresh (polling for external changes)

### Questions for Future Work Sessions

When starting new features, ask:

1. **Where does computation happen?** (Frontend or backend?)
2. **Is it on the hot path?** (User waiting for result?)
3. **Can it be parallelized?** (rayon in Rust?)
4. **Should it be cached?** (LRU with TTL?)
5. **How much data transferred?** (Batch IPC calls?)

---

**Last Updated**: March 1, 2026  
**Current Phase**: Phase 1 (Rust diff cache + basic command)  
**Next Milestone**: Memory cache operational, single file diffs <1ms

For detailed implementation plan, see: `.github/prompts/plan-diffViewerPerformance.prompt.md`
