import { useEffect, useMemo, useRef } from "react";
import { getDiffBatch } from "@/lib/gitCache";

interface UsePreloadVisibleDiffsOptions {
  repoPath: string;
  files: string[];
  staged: boolean;
  maxPreload?: number;
  debounceMs?: number;
}

/**
 * Phase 4 preload orchestration.
 *
 * Preloads only the first N files (viewport approximation), dedupes by
 * stable key, and debounces rapid list updates to avoid redundant batch calls.
 */
export function usePreloadVisibleDiffs({
  repoPath,
  files,
  staged,
  maxPreload = 18,
  debounceMs = 120,
}: UsePreloadVisibleDiffsOptions) {
  const lastKeyRef = useRef<string>("");

  const visiblePaths = useMemo(() => files.slice(0, maxPreload), [files, maxPreload]);

  useEffect(() => {
    if (!repoPath || visiblePaths.length === 0) return;

    const key = `${repoPath}|${staged ? "staged" : "unstaged"}|${visiblePaths.join("\u0000")}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const timer = window.setTimeout(() => {
      getDiffBatch(repoPath, visiblePaths, staged).catch(() => {});
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [repoPath, staged, visiblePaths, debounceMs]);
}
