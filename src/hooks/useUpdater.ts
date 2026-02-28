import { useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "up-to-date"
  | "error";

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkForUpdates() {
    setStatus("checking");
    setError(null);
    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
        setStatus("available");
      } else {
        setUpdate(null);
        setStatus("up-to-date");
      }
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  async function installUpdate() {
    if (!update) return;
    setStatus("downloading");
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  return { status, update, error, checkForUpdates, installUpdate };
}
