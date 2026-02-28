# Plan: EasyGit — Windows Git Client App

## Summary

Build **EasyGit**, an open-source, shareable Windows desktop Git client using **Tauri v2.10.2** (Rust backend + React/TypeScript frontend). The user is a full-time web dev with some Rust knowledge; Tauri gives a small native binary installable on Windows with a fully familiar web-stack UI layer. Git operations are handled by shelling out to the system's installed Git (user has Git Bash). Bun 1.3.5 is used as the package manager and runtime throughout (faster installs, built-in bundler, replaces npm entirely).

---

## Decisions

- **Framework:** Tauri v2.10.2 (not Electron — smaller binary ~5–10 MB vs ~200 MB, better perf, native .msi installer)
- **Package manager / runtime:** Bun 1.3.5 — replaces npm everywhere (`bunx`, `bun run`, `bun install`)
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui (new-york style, unified `radix-ui` package as of Feb 2026)
- **State:** Zustand (UI/local state) + TanStack Query v5 (async/server state for GitHub API calls)
- **Git engine:** Shell out to system git via Rust `std::process::Command`; parse stdout/stderr
- **OAuth:** `tauri-plugin-oauth` v2 (FabianLars) — spawns a temporary localhost server to capture GitHub/GitLab OAuth redirects, TypeScript bindings included
- **UI vibe:** Dark minimal (VS Code / Arc aesthetic)
- **App name:** EasyGit
- **v1 scope:** branches, worktree, conventional commits builder, diff viewer, file history/blame, stash manager, push/pull/fetch, GitHub/GitLab OAuth login, Windows .msi installer
- **v2 scope (excluded):** PR/issue sidebar, interactive rebase, plugin system, multi-repo tabs

---

## Project Structure

```
easygit/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/    # Tauri invoke commands
│   │       ├── repo.rs
│   │       ├── branch.rs
│   │       ├── commit.rs
│   │       ├── worktree.rs
│   │       ├── diff.rs
│   │       ├── stash.rs
│   │       ├── remote.rs
│   │       └── oauth.rs
│   └── Cargo.toml
├── src/                 # React frontend
│   ├── components/
│   │   ├── layout/      # AppShell, Sidebar, Titlebar
│   │   ├── commit/      # ConventionalCommitBuilder, FileChecklist
│   │   ├── branches/    # BranchList, BranchActions
│   │   ├── diff/        # SideBySideDiff, InlineDiff
│   │   ├── worktree/    # WorktreePanel
│   │   └── stash/       # StashList, StashActions
│   ├── hooks/           # useRepo, useBranches, useCommit etc.
│   ├── store/           # Zustand slices
│   └── lib/             # tauri invoke wrappers, types
├── package.json
├── bun.lockb
└── src-tauri/tauri.conf.json
```

---

## Implementation Phases

### Phase 1: Scaffold & Shell (independent, do first)

1. Bootstrap Tauri v2 project with Bun: `bunx create-tauri-app` → choose TypeScript / JavaScript → bun → React → TypeScript
2. Configure TailwindCSS v4 and shadcn/ui (`bunx shadcn@latest init`); select `new-york` style — uses unified `radix-ui` package automatically (Feb 2026 default)
3. Set up basic app shell: custom titlebar (frameless window), sidebar nav, main content area
4. Rust: implement `git_run(repo_path, args)` helper that shells out to git and returns stdout/stderr as structured Result

### Phase 2: Core Git Operations (depends on Phase 1)

5. Rust commands: `get_status`, `stage_files`, `unstage_files`, `get_branches`, `switch_branch`, `create_branch`, `delete_branch`, `push`, `pull`, `fetch`
6. Frontend: Repository opener (drag-drop or folder picker), recent repos list persisted in app config
7. Frontend: Sidebar with staged/unstaged file checklist — each file checkable to stage/unstage
8. Frontend: **Conventional Commit Builder** panel:
   - Chip row for type (feat/fix/chore/docs/refactor/test/ci/perf/style/revert)
   - Scope text input
   - Breaking change toggle (appends `!` before colon)
   - Short description input + optional body textarea
   - Live preview pane showing final `type(scope)!: description\n\nbody` format
9. Commit button → calls `commit` Rust command → shows success/error toast

### Phase 3: Worktree + Advanced Views (depends on Phase 2)

10. Rust commands: `list_worktrees`, `add_worktree`, `remove_worktree`
11. Frontend: Auto-detect if switched branch has a corresponding worktree → prompt to switch working directory context automatically (matches GitHub Desktop feel + smart detection); sidebar shows active worktree label
12. Rust command: `get_diff(file_path, staged?)` → returns unified diff string
13. Frontend: Side-by-side diff viewer using `diff2html` or custom renderer for each selected file
14. Rust command: `get_file_log(file_path)` for per-file history; `get_blame(file_path)` for inline blame
15. Frontend: File history panel + blame gutter in diff view
16. Rust commands: `list_stashes`, `stash_push(message?)`, `stash_apply(index)`, `stash_drop(index)`
17. Frontend: Stash manager panel — list stashes, apply/drop actions

### Phase 4: GitHub / GitLab OAuth (depends on Phase 2)

18. Add `tauri-plugin-oauth` v2 to `Cargo.toml`; register plugin in `lib.rs`
19. Rust: `start_oauth_server()` command — spawns localhost redirect catcher; `exchange_code(code, client_id, client_secret)` — POST to GitHub/GitLab token endpoint; `save_token()` — stores token in Tauri's secure store plugin
20. Frontend: Settings page with "Connect GitHub" / "Connect GitLab" buttons; OAuth flow: open browser → localhost redirect → token saved → UI reflects logged-in state
21. TanStack Query v5: `useGitHubUser()`, `useGitHubRepos()` hooks that call GitHub REST API with stored token (server-state caching, background refresh)

### Phase 5: Polish & Distribution (depends on Phase 4)

22. Custom app icon (EasyGit branding) + window decorations
23. Configure Tauri bundler for Windows `.msi` installer in `tauri.conf.json`
24. Auto-updater via Tauri's built-in updater plugin (GitHub Releases as update source)
25. Open source setup: MIT license, README, contributing guide, GitHub Actions CI using Bun (`bun install && bun run tauri build`)

---

## Key Libraries

| Layer    | Library                | Version                | Purpose                                                   |
| -------- | ---------------------- | ---------------------- | --------------------------------------------------------- |
| Runtime  | Bun                    | 1.3.5                  | Package manager, script runner, replaces npm              |
| Frontend | React + TypeScript     | 19                     | UI                                                        |
| Frontend | Vite                   | latest                 | Dev server + bundler                                      |
| Frontend | TailwindCSS            | v4                     | Styling                                                   |
| Frontend | shadcn/ui + `radix-ui` | Feb 2026 (unified pkg) | Accessible component primitives, new-york style           |
| Frontend | Zustand                | v5                     | UI / local global state                                   |
| Frontend | TanStack Query         | v5                     | Server/async state (GitHub API, background refresh)       |
| Frontend | diff2html              | latest                 | Diff rendering                                            |
| Frontend | Lucide React           | latest                 | Icons                                                     |
| Rust     | tauri                  | 2.10.2                 | App framework + IPC                                       |
| Rust     | tauri-plugin-oauth     | v2                     | GitHub/GitLab OAuth redirect capture via localhost server |
| Rust     | tauri-plugin-store     | v2                     | Persist tokens + app config                               |
| Rust     | reqwest                | latest                 | HTTP client for token exchange with OAuth providers       |
| Rust     | serde / serde_json     | latest                 | Serialization                                             |
| Rust     | tokio                  | 1.x                    | Async runtime                                             |

---

## Verification

1. `bun run tauri dev` — app opens without errors
2. Open a local Git repo → file status loads in sidebar
3. Stage a file → git status confirms it's staged
4. Build a conventional commit → preview pane shows correct format → commit appears in `git log`
5. Switch branch that has a worktree → app auto-prompts to switch worktree context
6. Open a changed file → diff viewer renders side-by-side correctly
7. Click "Connect GitHub" → browser opens GitHub OAuth page → redirect captured → profile name appears in sidebar
8. `bun run tauri build` → generates `.msi` installer → installs and runs on a clean Windows machine

---

## Out of Scope for v1 → v2

- PR/issue sidebar viewer (v2)
- Interactive rebase UI (v2)
- Plugin/extension system (v2)
- Multi-repo tabs open simultaneously (v2)
- SSH key management (rely on system git credential helper)

## Version Notes (researched Feb 2026)

- **Tauri** `2.10.2` — latest stable; `tauri-cli` `2.10.0`, `tauri-bundler` `2.8.0`
- **Bun** `1.3.5` — stable (Dec 2025); scaffold command: `bunx create-tauri-app`
- **shadcn/ui** Feb 2026 — `new-york` style now imports from unified `radix-ui` package instead of individual `@radix-ui/react-*` packages; `bunx shadcn@latest add [component]`
- **tauri-plugin-oauth** v2 — FabianLars; TypeScript bindings; spawns localhost server for redirect capture; works with GitHub and GitLab OAuth apps
- **TanStack Query** v5 — works with React 19; use for all GitHub/GitLab REST API calls in v1 OAuth features
