import { invoke } from "@tauri-apps/api/core";

export interface FileStatus {
  path: string;
  staged_status: string;   // "M" | "A" | "D" | "R" | "C" | "U" | ""
  unstaged_status: string; // "M" | "D" | "?" | "U" | ""
  is_staged: boolean;
  is_unstaged: boolean;
  original_path?: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  upstream?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  is_main: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

export interface BlameLine {
  line_number: number;
  hash: string;
  author: string;
  date: string;
  content: string;
}

export interface StashInfo {
  index: number;
  reference: string;
  message: string;
  hash: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export const git = {
  version: () =>
    invoke<string>("git_version"),

  getStatus: (repoPath: string) =>
    invoke<FileStatus[]>("get_status", { repoPath }),

  stageFiles: (repoPath: string, paths: string[]) =>
    invoke<void>("stage_files", { repoPath, paths }),

  unstageFiles: (repoPath: string, paths: string[]) =>
    invoke<void>("unstage_files", { repoPath, paths }),

  commit: (repoPath: string, message: string) =>
    invoke<string>("commit", { repoPath, message }),

  getCurrentBranch: (repoPath: string) =>
    invoke<string>("get_current_branch", { repoPath }),

  getBranches: (repoPath: string) =>
    invoke<BranchInfo[]>("get_branches", { repoPath }),

  switchBranch: (repoPath: string, name: string) =>
    invoke<void>("switch_branch", { repoPath, name }),

  createBranch: (repoPath: string, name: string, checkout: boolean) =>
    invoke<void>("create_branch", { repoPath, name, checkout }),

  deleteBranch: (repoPath: string, name: string, force: boolean) =>
    invoke<void>("delete_branch", { repoPath, name, force }),

  push: (repoPath: string, setUpstream = false) =>
    invoke<string>("push", { repoPath, setUpstream }),

  pull: (repoPath: string) =>
    invoke<string>("pull", { repoPath }),

  fetch: (repoPath: string) =>
    invoke<string>("fetch", { repoPath }),

  getRemotes: (repoPath: string) =>
    invoke<RemoteInfo[]>("get_remotes", { repoPath }),

  createGithubRepo: (
    repoPath: string,
    token: string,
    name: string,
    isPrivate: boolean,
    description?: string
  ) =>
    invoke<string>("create_github_repo", {
      repoPath,
      token,
      name,
      private: isPrivate,
      description: description ?? null,
    }),

  // Worktree
  listWorktrees: (repoPath: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),

  addWorktree: (repoPath: string, path: string, branch: string, newBranch: boolean) =>
    invoke<string>("add_worktree", { repoPath, path, branch, newBranch }),

  removeWorktree: (repoPath: string, path: string, force: boolean) =>
    invoke<string>("remove_worktree", { repoPath, path, force }),

  // Diff
  getDiff: (repoPath: string, filePath: string, staged: boolean) =>
    invoke<string>("get_diff", { repoPath, filePath, staged }),

  getLog: (repoPath: string, limit = 100) =>
    invoke<CommitInfo[]>("get_log", { repoPath, limit }),

  getFileLog: (repoPath: string, filePath: string) =>
    invoke<CommitInfo[]>("get_file_log", { repoPath, filePath }),

  getBlame: (repoPath: string, filePath: string) =>
    invoke<BlameLine[]>("get_blame", { repoPath, filePath }),

  // Stash
  listStashes: (repoPath: string) =>
    invoke<StashInfo[]>("list_stashes", { repoPath }),

  stashPush: (repoPath: string, message?: string, includeUntracked = false) =>
    invoke<string>("stash_push", { repoPath, message: message ?? null, includeUntracked }),

  stashPop: (repoPath: string, index: number) =>
    invoke<string>("stash_pop", { repoPath, index }),

  stashApply: (repoPath: string, index: number) =>
    invoke<string>("stash_apply", { repoPath, index }),

  stashDrop: (repoPath: string, index: number) =>
    invoke<string>("stash_drop", { repoPath, index }),
};
