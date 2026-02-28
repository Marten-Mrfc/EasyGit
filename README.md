# EasyGit

A modern, open-source Git client for Windows built with [Tauri v2](https://tauri.app/) + React + TypeScript.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-informational)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange)

## Features

- **Conventional Commit Builder** — type chips, scope, breaking-change toggle, live preview
- **Staged / unstaged file checklist** — stage or unstage individual files with one click
- **Inline diff viewer** — side-by-side diff with syntax highlighting for any file
- **Branch manager** — create, switch, and delete branches; detached HEAD aware
- **Worktree support** — list, add, and remove Git worktrees; sidebar shows active worktree
- **Stash manager** — push with a message, apply, pop, and drop stashes
- **Commit history** — scrollable log with author, date, and message; per-file history and blame
- **Push / Pull / Fetch** — with automatic upstream tracking setup on first push
- **Publish to GitHub** — create a new GitHub repository and push in one step if no remote is configured
- **GitHub & GitLab auth** — Device Flow OAuth (GitHub) or Personal Access Token; tokens stored locally
- **Auto-updater** — built-in update check against GitHub Releases; one-click install
- **Repo switcher** — quick-access popover for recently opened repositories

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | TailwindCSS v4 + shadcn/ui (new-york) |
| State | Zustand v5 (persist) + TanStack Query v5 |
| Installer | NSIS (per-user) via Tauri bundler |
| HTTP client | reqwest v0.12 (Rust-side, avoids CORS) |

## Getting started

### Prerequisites

- Windows 10/11 with [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (pre-installed on Win11)
- [Rust](https://rustup.rs/) stable
- [Bun](https://bun.sh/) 1.3+

### Development

```bash
git clone https://github.com/Marten-Mrfc/EasyGit.git
cd easygit
bun install
bun run tauri dev
```

### Build installer

```bash
bun run tauri build
# Output: src-tauri/target/release/bundle/nsis/EasyGit_0.1.0_x64-setup.exe
```

## Environment variables

Copy `.env.example` to `.env` and fill in the optional values:

```env
# Optional: enables "Sign in with GitHub" (Device Flow).
# Create an OAuth App at https://github.com/settings/applications/new
# with callback URL: http://localhost
VITE_GITHUB_CLIENT_ID=
```

Without a `GITHUB_CLIENT_ID`, users can still connect via a Personal Access Token.

## Auto-updater setup

The updater checks `https://github.com/Marten-Mrfc/EasyGit/releases/latest/download/latest.json` for new versions.

To enable signed updates:

1. Generate a key pair:

   ```bash
   bun run tauri signer generate -w ~/.tauri/easygit.key
   ```

2. Set `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` to the generated public key.
3. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to your GitHub repository secrets.

The release workflow (`.github/workflows/release.yml`) automatically signs bundles and uploads `latest.json`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, commit conventions, and PR guidelines.

## License

[MIT](LICENSE) © 2026 EasyGit Contributors
