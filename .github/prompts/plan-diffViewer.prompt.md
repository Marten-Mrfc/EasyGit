# Plan: Better Diff Viewer

## TL;DR

Rebuild DiffViewer into a production-quality diff UI with: **syntax highlighting** (Shiki, theme-aware), word-level diff highlighting that composes with syntax colors, collapsible context, unified/split toggle, file stats bar, a "Full file" tab, and improved blame grouping. Word diff done client-side in JS. One new npm dep (`shiki`). One new Rust command (`get_file_content`) for the full-file tab.

---

## Phase 1 — Parser & data model upgrade

**Files:** `DiffViewer.tsx`

1. Extend `DiffLine` type: add `pairKey?: number` (links a removed line to its matching added line for word diff), and add a new `type: "collapsed-context"` variant with `count: number`.
2. After parsing hunks, do a second pass to: (a) pair adjacent `-`/`+` lines (simple LCS heuristic: if a run of removals is followed by same-count additions, pair them 1:1), (b) replace runs of ≥5 consecutive context lines in the middle of a hunk with a single `collapsed-context` line.
3. Track `expandedContexts: Set<string>` in component state (keyed by `${fileIndex}-${hunkIndex}-${lineIndex}`); clicking "expand" removes that run from the collapsed set.

**Depends on:** nothing (standalone)

## Phase 2 — Word-level diff utility _(parallel with Phase 1)_

**Files:** `DiffViewer.tsx` — private helper

1. Implement `computeInlineDiff(a: string, b: string): Segment[]` where `Segment = { text: string; changed: boolean }`. LCS on **word tokens** (split on whitespace + punctuation boundaries), with character-level fallback for short strings. No library.
2. Render paired lines by splitting **Shiki token spans** at word-diff boundaries: each output span carries both a `color` (from Shiki) and optionally a `background` (from word diff — `bg-red-500/40` removed, `bg-green-500/40` added). This is done by merging the two sorted interval sets.

**Depends on:** nothing (standalone); consumed by Phase 3 after Phase 3a adds Shiki

## Phase 3a — Syntax highlighting setup (NEW)

**Files:** `DiffViewer.tsx`

1. **Install `shiki`** as a new dependency.
2. Create a module-level singleton `getHighlighter()` promise that lazily initialises Shiki with `bundledLanguages` limited to ~25 common languages (ts, js, tsx, jsx, rs, py, go, java, c, cpp, cs, rb, php, sh, json, yaml, toml, md, html, css, sql, swift, kt, dart, lua). Reduces bundle impact — unused grammars are never loaded.
3. Map file extension → `BundledLanguage` via a lookup table; fall back to `"plain"` for unknowns.
4. Add a `useSyntaxTokens(filePatches, theme)` hook: calls the singleton highlighter, feeds each file's reconstructed source (context + added lines stitched together in order) through `codeToTokens`, and returns a `Map<fileIndex, Map<lineIndex, ShikiToken[]>>`. Results are stored in a `useRef`-backed async state so the component re-renders once tokens arrive without blocking the initial paint — the diff shows immediately in un-highlighted form and then gains colors.
5. The active **Shiki theme** is selected from the resolved next-themes value: `github-dark` for dark mode, `github-light` for light mode (both are bundled in Shiki).

**Depends on:** Phase 1 (needs the parsed `FilePatch` structure)

## Phase 3 — Unified view overhaul

**Files:** `DiffViewer.tsx`
**Depends on:** Phases 1, 2, 3a

1. **File stats bar** — per-file `+N -M` badges + proportional green/red mini-bar in the sticky header.
2. **Collapsible context rows** — "↕ N unchanged lines" clickable button between hunks.
3. **Syntax-highlighted lines** — use resolved `ShikiToken[]` from Phase 3a. Each diff line renders its tokens as `<span style={{ color }}>` elements. Context and added lines use the "new" file tokens; removed lines use the "old" file tokens (reconstructed separately in the hook).
4. **Composed word + syntax highlighting** — for paired `-`/`+` lines, merge `computeInlineDiff` segments with Shiki token intervals; each output span gets both `color` (syntax) and `backgroundColor` (word diff).
5. **Hunk header cleanup** — show only the trailing function/class context hint after `@@` in a styled pill.
6. **Binary file detection** badge row.

## Phase 4 — Split (side-by-side) view

**Files:** `DiffViewer.tsx`

1. Add `mode: "unified" | "split"` prop (default `"unified"`).
2. For split mode render a two-column table per hunk: left column = old lines + line nums, right column = new lines + line nums. Context lines appear on both sides. Added lines appear only on the right (left cell is empty/dimmed). Removed lines appear only on the left (right cell is empty/dimmed).
3. Word highlighting (Phase 2) feeds into the same `computeInlineDiff` call; removed segments render in the left cell, added segments in the right.
4. Collapsible context works identically in split mode.
5. The `mode` prop is threaded down from `DiffSheet` (not local state inside `DiffViewer`).

**Depends on:** Phase 3

## Phase 5 — DiffSheet UI upgrades

**Files:** `DiffSheet.tsx`, `diff.rs`, `lib.rs`, `git.ts`

1. **View toggle** — Add `Unified | Split` segmented control (two icon buttons) to the right side of the sheet header. State lives in `DiffSheet`.
2. **Stats summary in header** — Aggregate total `+additions / -deletions` from the parsed diff and show inline next to the filename.
3. **Copy diff button** — `Copy` icon button in header that copies the raw diff string to clipboard.
4. **Full file tab** — New `TabsTrigger value="file"`. Backend: add `get_file_content(repo_path, file_path) → String` Rust command in `diff.rs`, register in `lib.rs`, add `git.getFileContent(…)` in `git.ts`. Frontend: render as a read-only code block with line numbers (a simple monospace scroll area, no syntax highlighting needed).
5. **Improved blame** — Group consecutive rows with the same `hash` into a visual block. Show hash + author only on the first row of each block; the rest show a vertical continuation bar. Add a left-border colour per group (cycle through a palette).

**Depends on:** Phase 4 (for mode prop); Phases 1–3 for stats

## Phase 6 — Polish & keyboard nav

**Files:** `DiffViewer.tsx`, `DiffSheet.tsx`

1. **Keyboard nav** — `]` / `[` keys jump to next/previous hunk; `f` toggles unified/split.
2. **Empty diff state** — If there's no diff but the file exists (e.g., a new empty file), show a "File has no changes" styled empty state with the file icon.
3. **Scrollable hunk anchors** — Each hunk header gets an `id` so keyboard nav can `scrollIntoView`.

**Depends on:** Phases 3–5

---

## Relevant files

- `src/components/diff/DiffViewer.tsx` — Full rewrite; all phases land here
- `src/components/diff/DiffSheet.tsx` — Phase 5 changes (mode toggle, stats, copy, full file tab, blame upgrade)
- `src-tauri/src/commands/diff.rs` — Add `get_file_content` command
- `src-tauri/src/lib.rs` — Register `get_file_content`
- `src/lib/git.ts` — Add `getFileContent` method

---

## Verification

1. Open a staged file diff from ChangesView — verify word highlighting appears on closely-edited lines, collapsible context shows for large diffs.
2. Toggle Unified ↔ Split — verify both renders are correct for added-only, removed-only, and modified files.
3. Open a commit diff from HistoryView — verify multi-file diff with per-file stats bars and collapsible hunks.
4. Open DiffSheet → "Full file" tab — verify the entire file renders with line numbers.
5. Open DiffSheet → "Blame" tab — verify grouped blame (same commit rows merge visually).
6. `cargo check` — no errors.
7. TypeScript: no new errors in changed files.

---

## Decisions

- Word diff: **client-side JS** (LCS on word tokens, no Rust changes)
- Syntax highlighting: **Shiki** — theme-aware (`github-dark` / `github-light`), uses same TextMate grammars as VS Code, `codeToTokens` API returns structured objects that compose naturally with word-diff spans
- Shiki grammar scope: ~25 bundled languages eagerly listed, all others fall back to `plain`; unused language grammars are never downloaded
- Syntax tokens load **asynchronously after first paint** — diff is readable immediately and gains colors once Shiki resolves
- No use of diff2html's renderer (its HTML string output doesn't compose with React or Shiki tokens)
- Split view: **table-based layout**, not ResizablePanels
- Context collapse threshold: **5 lines**
- Full file tab only in `DiffSheet`

## Further Considerations

1. The `DiffFileInfo` export in `DiffViewer.tsx` is currently unused — remove it during the rewrite.
2. Full file tab uses `get_file_content` (reads the working-tree file). A future improvement: show the file at a specific commit (would need `git show <hash>:<path>`) — left for later.
