import { useState, useRef } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "up-to-date"
  | "no-releases"
  | "error";

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const totalRef = useRef<number | null>(null);
  const downloadedRef = useRef<number>(0);

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
      const msg = String(e);
      // Updater throws this when the endpoint returns 404 / no release published yet
      if (
        msg.includes("valid release JSON") ||
        msg.includes("No releases") ||
        msg.includes("404")
      ) {
        setStatus("no-releases");
      } else {
        setStatus("error");
        setError(msg);
      }
    }
  }

  async function installUpdate() {
    if (!update) return;
    setStatus("downloading");
    setDownloadProgress(0);
    totalRef.current = null;
    downloadedRef.current = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalRef.current = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          downloadedRef.current += event.data.chunkLength ?? 0;
          if (totalRef.current) {
            setDownloadProgress(
              Math.min(
                99,
                Math.round((downloadedRef.current / totalRef.current) * 100),
              ),
            );
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });
      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(String(e));
      setDownloadProgress(null);
    }
  }

  return {
    status,
    update,
    error,
    downloadProgress,
    checkForUpdates,
    installUpdate,
  };
}
