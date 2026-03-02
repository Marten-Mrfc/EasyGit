import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FileStatus, BranchInfo, WorktreeInfo, StashInfo } from "@/lib/git";

const MAX_RECENT = 10;

interface BranchCacheEntry {
  branches: BranchInfo[];
  worktrees: WorktreeInfo[];
  currentBranch: string;
  mainRepoPath: string | null;
  updatedAt: number;
}

interface RepoState {
  // Persistent
  repoPath: string | null;
  recentRepos: string[];
  // Runtime
  status: FileStatus[];
  branches: BranchInfo[];
  currentBranch: string;
  worktrees: WorktreeInfo[];
  mainRepoPath: string | null; // Cached main worktree path for faster lookups
  branchCache: Record<string, BranchCacheEntry>;
  stashes: StashInfo[];
  isLoadingStatus: boolean;
  isLoadingBranches: boolean;
  isLoadingWorktrees: boolean;
  isLoadingStashes: boolean;
}

interface RepoActions {
  setRepoPath: (path: string) => void;
  clearRepo: () => void;
  removeRecentRepo: (path: string) => void;
  setStatus: (files: FileStatus[]) => void;
  setLoadingStatus: (v: boolean) => void;
  setBranches: (branches: BranchInfo[]) => void;
  setCurrentBranch: (name: string) => void;
  setLoadingBranches: (v: boolean) => void;
  setWorktrees: (worktrees: WorktreeInfo[]) => void;
  setMainRepoPath: (path: string | null) => void;
  setBranchCache: (repoPath: string, entry: BranchCacheEntry) => void;
  clearBranchCache: (repoPath?: string) => void;
  getBranchCache: (repoPath: string) => BranchCacheEntry | null;
  setLoadingWorktrees: (v: boolean) => void;
  setStashes: (stashes: StashInfo[]) => void;
  setLoadingStashes: (v: boolean) => void;
}

export const useRepoStore = create<RepoState & RepoActions>()(
  persist(
    (set, get) => ({
      repoPath: null,
      recentRepos: [],
      status: [],
      branches: [],
      currentBranch: "",
      worktrees: [],
      mainRepoPath: null,
      branchCache: {},
      stashes: [],
      isLoadingStatus: false,
      isLoadingBranches: false,
      isLoadingWorktrees: false,
      isLoadingStashes: false,

      setRepoPath: (path) => {
        const filtered = get().recentRepos.filter((r) => r !== path);
        set({
          repoPath: path,
          recentRepos: [path, ...filtered].slice(0, MAX_RECENT),
        });
      },

      clearRepo: () =>
        set({
          repoPath: null,
          status: [],
          branches: [],
          currentBranch: "",
          worktrees: [],
          mainRepoPath: null,
          branchCache: {},
          stashes: [],
        }),

      removeRecentRepo: (path) =>
        set((s) => ({ recentRepos: s.recentRepos.filter((r) => r !== path) })),

      setStatus: (files) => set({ status: files }),
      setLoadingStatus: (v) => set({ isLoadingStatus: v }),
      setBranches: (branches) => set({ branches }),
      setCurrentBranch: (name) => set({ currentBranch: name }),
      setLoadingBranches: (v) => set({ isLoadingBranches: v }),
      setWorktrees: (worktrees) => set({ worktrees }),
      setMainRepoPath: (path) => set({ mainRepoPath: path }),
      setBranchCache: (repoPath, entry) =>
        set((s) => ({
          branchCache: {
            ...s.branchCache,
            [repoPath]: entry,
          },
        })),
      clearBranchCache: (repoPath) =>
        set((s) => {
          if (!repoPath) {
            return { branchCache: {} };
          }
          const next = { ...s.branchCache };
          delete next[repoPath];
          return { branchCache: next };
        }),
      getBranchCache: (repoPath) => get().branchCache[repoPath] ?? null,
      setLoadingWorktrees: (v) => set({ isLoadingWorktrees: v }),
      setStashes: (stashes) => set({ stashes }),
      setLoadingStashes: (v) => set({ isLoadingStashes: v }),
    }),
    {
      name: "easygit-repo",
      partialize: (state) => ({
        repoPath: state.repoPath,
        recentRepos: state.recentRepos,
        branchCache: state.branchCache,
      }),
    }
  )
);
