import { load, type Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

// Auth token storage backed by tauri-plugin-store (persisted to app data dir)
let _authStore: Store | null = null;
async function getAuthStore(): Promise<Store> {
  if (!_authStore) _authStore = await load(".easygit-auth.dat", { autoSave: true, defaults: {} });
  return _authStore;
}

/** Client ID for GitHub OAuth Device Flow. Set VITE_GITHUB_CLIENT_ID in .env */
export const GITHUB_CLIENT_ID =
  (import.meta.env.VITE_GITHUB_CLIENT_ID as string) || "";

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

export async function saveToken(
  platform: "github" | "gitlab",
  token: string
): Promise<void> {
  const store = await getAuthStore();
  await store.set(`${platform}_token`, token);
  await store.save();
}

export async function getToken(
  platform: "github" | "gitlab"
): Promise<string | null> {
  const store = await getAuthStore();
  return (await store.get<string>(`${platform}_token`)) ?? null;
}

export async function deleteToken(
  platform: "github" | "gitlab"
): Promise<void> {
  const store = await getAuthStore();
  await store.delete(`${platform}_token`);
  await store.save();
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

export interface GitHubUserData {
  login: string;
  name: string | null;
  avatar_url: string;
}

export async function validateGitHubToken(
  token: string
): Promise<GitHubUserData> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error("Invalid GitHub token");
  return res.json();
}

// ---------------------------------------------------------------------------
// GitHub Device Flow (requires VITE_GITHUB_CLIENT_ID to be set in .env)
// ---------------------------------------------------------------------------

export interface DeviceCodeData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startGitHubDeviceFlow(): Promise<DeviceCodeData> {
  return invoke<DeviceCodeData>("github_start_device_flow", {
    clientId: GITHUB_CLIENT_ID,
  });
}

/**
 * Polls GitHub for the access token after the device flow is started.
 * Returns the token if authorized, or null if still pending.
 * Throws on error (expired, access denied, etc.).
 */
export async function pollGitHubDeviceToken(
  deviceCode: string
): Promise<string | null> {
  return invoke<string | null>("github_poll_device_token", {
    clientId: GITHUB_CLIENT_ID,
    deviceCode,
  });
}

// ---------------------------------------------------------------------------
// GitLab helpers
// ---------------------------------------------------------------------------

export interface GitLabUserData {
  username: string;
  name: string;
  avatar_url: string;
}

export async function validateGitLabToken(
  token: string,
  baseUrl = "https://gitlab.com"
): Promise<GitLabUserData> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v4/user`, {
    headers: { "PRIVATE-TOKEN": token },
  });
  if (!res.ok) throw new Error("Invalid GitLab token");
  return res.json();
}
