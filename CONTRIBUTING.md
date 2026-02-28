# Contributing to EasyGit

Thank you for your interest in contributing! EasyGit is built with Tauri v2 (Rust) + React/TypeScript and targets Windows as its primary platform.

## Prerequisites

| Tool | Version |
|------|---------|
| [Rust](https://rustup.rs/) | stable (1.78+) |
| [Bun](https://bun.sh/) | 1.3+ |
| [Git](https://git-scm.com/) | any recent |
| Windows 10/11 with [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) | — |

## Getting started

```bash
# Clone the repo
git clone https://github.com/Marten-Mrfc/EasyGit.git
cd easygit

# Install JS dependencies
bun install

# Run in dev mode (hot-reload on both ends)
bun run tauri dev
```

## Project layout

```
src/                  # React + TypeScript frontend
  components/
    layout/           # AppShell, Titlebar, Sidebar
    views/            # ChangesView, BranchesView, HistoryView, …
    commit/           # ConventionalCommitBuilder, FileChecklist
    diff/             # DiffViewer, DiffSheet
    remote/           # PublishToGitHubDialog
  hooks/              # useGitHub, useUpdater
  lib/                # git.ts (invoke wrappers), auth.ts, utils.ts
  store/              # Zustand stores (repoStore, authStore)
src-tauri/
  src/
    commands/         # Tauri commands (Rust)
      branch.rs, diff.rs, git.rs, oauth.rs, remote.rs,
      repo.rs, stash.rs, worktree.rs
    lib.rs            # Plugin registration + handler
  tauri.conf.json     # App config, bundle settings, updater config
  Cargo.toml
```

## How to contribute

1. **Fork** this repository and create a branch from `main`.
2. Keep changes focused — one feature or fix per PR.
3. Follow the existing code style (Prettier for TS, `cargo fmt` for Rust).
4. Run checks before opening a PR:

   ```bash
   bun run build          # frontend
   cd src-tauri && cargo check && cargo clippy
   ```

5. Open a Pull Request with a clear description of the change and why.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(branch): add rename branch command
fix(push): handle missing remote gracefully
docs: update contributing guide
```

Supported types: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`, `style`, `revert`.

## Generating a release signing key

The auto-updater requires a signing key pair. To generate one:

```bash
bun run tauri signer generate -w ~/.tauri/easygit.key
```

Add the resulting keys to your GitHub repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY` — the private key file content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password (if set)
- `TAURI_SIGNING_PUBLIC_KEY` — the public key string

Then set `plugins.updater.pubkey` in `tauri.conf.json` to the generated public key.

## Regenerating app icons

Edit `src-tauri/icons/source.svg`, export it as a 512×512px PNG, then run:

```bash
bun run tauri icon src-tauri/icons/source.png
```

This regenerates all sizes used by the Windows installer and taskbar.

## Code of Conduct

Be respectful and constructive. Harassment or discrimination of any kind will not be tolerated.
