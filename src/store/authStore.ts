import { create } from "zustand";
import {
  getToken,
  saveToken,
  deleteToken,
  type GitHubUserData,
  type GitLabUserData,
} from "@/lib/auth";

export type { GitHubUserData, GitLabUserData };

interface AuthState {
  githubToken: string | null;
  githubUser: GitHubUserData | null;
  gitlabToken: string | null;
  gitlabUser: GitLabUserData | null;
  isInitialized: boolean;
}

interface AuthActions {
  /** Load persisted tokens from disk – call once at app startup */
  initAuth: () => Promise<void>;
  connectGitHub: (token: string) => Promise<void>;
  setGitHubUser: (user: GitHubUserData) => void;
  disconnectGitHub: () => Promise<void>;
  connectGitLab: (token: string) => Promise<void>;
  setGitLabUser: (user: GitLabUserData) => void;
  disconnectGitLab: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  githubToken: null,
  githubUser: null,
  gitlabToken: null,
  gitlabUser: null,
  isInitialized: false,

  initAuth: async () => {
    const [ghToken, glToken] = await Promise.all([
      getToken("github").catch(() => null),
      getToken("gitlab").catch(() => null),
    ]);
    set({ githubToken: ghToken, gitlabToken: glToken, isInitialized: true });
  },

  connectGitHub: async (token) => {
    await saveToken("github", token);
    set({ githubToken: token });
  },

  setGitHubUser: (user) => set({ githubUser: user }),

  disconnectGitHub: async () => {
    await deleteToken("github");
    set({ githubToken: null, githubUser: null });
  },

  connectGitLab: async (token) => {
    await saveToken("gitlab", token);
    set({ gitlabToken: token });
  },

  setGitLabUser: (user) => set({ gitlabUser: user }),

  disconnectGitLab: async () => {
    await deleteToken("gitlab");
    set({ gitlabToken: null, gitlabUser: null });
  },
}));
