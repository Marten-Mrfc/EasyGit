# Plan: EasyGit V2

6 features, 4 implementation phases. GitHub integration stays at current depth (OAuth + publish + releases — no PRs/Issues).

---

## Phase A — Polish _(parallel, quick wins)_

### A1: Dark / light theme toggle

- Wire up `next-themes` `ThemeProvider` (already installed, not connected) wrapping `App` in `App.tsx`
- Add `darkMode: 'class'` strategy to Tailwind config (v4 uses CSS vars; shadcn already defines `[.dark]` tokens)
- Add Sun/Moon toggle button to `Titlebar.tsx`
- Persists across restarts via next-themes localStorage key
- **Files:** `App.tsx`, `Titlebar.tsx`, Tailwind config

### A2: Command palette (Ctrl+K)

- `cmdk` is already installed — needs a component and a global listener
- Global `Ctrl+K` keydown listener mounted in `App.tsx`
- Full-screen overlay using shadcn `Dialog` + `cmdk` `CommandDialog`
- Command groups:
  - **Navigation** — Changes, Branches, Worktree, History, Stash, Releases, Settings, Insights
  - **Git Actions** — Stage All, Commit, Push, Pull, Fetch
  - **Recent Repos** — switch repo on select
- **New file:** `src/components/layout/CommandPalette.tsx`
- **Modified:** `App.tsx`

---

## Phase B — Clone Repository

### Rust

- New command `clone_repo(url: String, dest_path: String) -> Result<String, String>` → runs `git clone <url> <dest_path>`, returns cloned path
- Add to `commands/repo.rs` (or new `clone.rs`)
- V2 uses blocking clone + spinner; real-time progress streaming deferred to V2.1

### Frontend

- `OpenRepoView`: add "Clone a repository" card alongside "Open existing"
- **CloneDialog** component:
  - URL input (any git URL)
  - Destination folder picker (`tauri-plugin-dialog`)
  - If GitHub token is connected: "Browse GitHub repos" tab — uses existing `useGitHubRepos()` TanStack Query hook, searchable list
  - Clone button → calls `git.cloneRepo()` → `setRepoPath()` on success → repo auto-opens
- **New file:** `src/components/views/CloneDialog.tsx`
- **Modified:** `OpenRepoView.tsx`, `git.ts`

---

## Phase C — Merge Conflict Resolution _(most safety-critical)_

### Rust (additions to `commands/repo.rs`)

- `get_conflict_files(repo_path)` — filters `git status --porcelain` for `UU` / `AA` / `DD` entries
- `get_conflict_diff(repo_path, file_path)` — reads raw file content (with conflict markers)
- `resolve_with_ours(repo_path, file_path)` — `git checkout --ours <file> && git add <file>`
- `resolve_with_theirs(repo_path, file_path)` — `git checkout --theirs <file> && git add <file>`
- `mark_resolved(repo_path, file_path, content)` — writes resolved content to disk + `git add <file>`

### Frontend

- `ChangesView`: detect conflicted files (`staged_status == "U"` or `unstaged_status == "U"`) → show conflict badge
- **ConflictEditor** sheet/panel:
  - Parses `<<<<<<<` / `=======` / `>>>>>>>` markers into conflict hunks
  - Each hunk rendered as side-by-side block (Ours | Theirs)
  - Per-hunk buttons: **Accept Ours** / **Accept Theirs** / **Accept Both**
  - "Save & Mark Resolved" writes the assembled content back via `mark_resolved`
- **New file:** `src/components/conflict/ConflictEditor.tsx`
- **Modified:** `ChangesView.tsx`, `git.ts`

---

## Phase D — Rebase / Cherry-pick + Insights _(parallel)_

### D1: Rebase & Cherry-pick

**Rust (additions to `commands/branch.rs`)**

- `cherry_pick(repo_path, commit_hash)` — `git cherry-pick <hash>`
- `rebase_onto(repo_path, target_branch)` — `git rebase <target_branch>`
- `abort_rebase(repo_path)` — `git rebase --abort`
- `continue_rebase(repo_path)` — `git rebase --continue`

**Frontend**

- `HistoryView`: row action button (or right-click) → "Cherry-pick to current branch"
- `BranchesView`: "Rebase onto…" action per branch → branch picker dialog → calls `rebase_onto`
- If rebase causes conflicts → show conflict badge in ChangesView + open ConflictEditor (depends on Phase C)
- **Modified:** `HistoryView.tsx`, `BranchesView.tsx`, `git.ts`

### D2: Repository Insights _(new sidebar nav item)_

**New dependency:** `recharts` (~50KB gzip, React 19 compatible)

**Rust (new `commands/stats.rs`)**

- `get_contributor_stats(repo_path)` — `git shortlog -sne --all` → `Vec<{ name, email, commits }>`
- `get_commit_activity(repo_path)` — `git log --pretty="%ad" --date=short -n 500` → `Vec<String>` of dates

**Frontend**

- **InsightsView**: new sidebar nav item (BarChart2 icon)
  - Contributor leaderboard: top contributors with commit count + avatar initial badge
  - Commit activity: bar chart of commits per week (last 52 weeks) via recharts `BarChart`
- **New files:** `src/components/views/InsightsView.tsx`, `src-tauri/src/commands/stats.rs`
- **Modified:** `Sidebar.tsx` (new nav item + View type), `App.tsx` (new route), `git.ts`, `commands/mod.rs`, `lib.rs`

---

## Files summary

| File                                         | Change                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| `src/components/layout/CommandPalette.tsx`   | **New**                                               |
| `src/components/views/CloneDialog.tsx`       | **New**                                               |
| `src/components/conflict/ConflictEditor.tsx` | **New**                                               |
| `src/components/views/InsightsView.tsx`      | **New**                                               |
| `src-tauri/src/commands/stats.rs`            | **New**                                               |
| `App.tsx`                                    | ThemeProvider + CommandPalette mount + Insights route |
| `Titlebar.tsx`                               | Theme toggle button                                   |
| `OpenRepoView.tsx`                           | Clone card + CloneDialog                              |
| `ChangesView.tsx`                            | Conflict detection + ConflictEditor trigger           |
| `HistoryView.tsx`                            | Cherry-pick row action                                |
| `BranchesView.tsx`                           | Rebase onto action                                    |
| `Sidebar.tsx`                                | Insights nav item + View type                         |
| `git.ts`                                     | cloneRepo, conflict cmds, cherry-pick, rebase, stats  |
| `src-tauri/src/commands/repo.rs`             | Conflict commands                                     |
| `src-tauri/src/commands/branch.rs`           | Cherry-pick + rebase                                  |
| `src-tauri/src/commands/mod.rs`              | `pub mod stats`                                       |
| `src-tauri/src/lib.rs`                       | Register all new commands                             |
| `package.json`                               | `recharts`                                            |

---

## Explicit exclusions

- **Interactive rebase** (reorder/squash/fixup) — too complex, deferred to V3
- **Clone progress streaming** — V2 uses blocking + spinner; real-time events in V2.1
- **GitHub PRs / Issues** — excluded by user preference

---

## Verification checklist

- [ ] Theme persists across app restart; toggle updates all shadcn components instantly
- [ ] Ctrl+K opens palette; navigate to any view; git actions call correct store methods
- [ ] Clone a public GitHub repo via URL; clone own private repo via GitHub browser picker; repo auto-opens
- [ ] Induce a merge conflict in a test repo; conflict badge appears in ChangesView; ConflictEditor renders hunks; Accept Ours/Theirs stages correctly; commit succeeds
- [ ] Cherry-pick a commit from HistoryView; it appears as a new commit on current branch
- [ ] Rebase a branch onto main via BranchesView; abort works; conflict mid-rebase routes to ConflictEditor
- [ ] InsightsView loads contributor list + 52-week chart for any repo with history
