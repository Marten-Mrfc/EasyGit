import { useEffect, useCallback, useState, useMemo, useTransition } from "react";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useRepoStore } from "@/store/repoStore";
import { git, type FileStatus } from "@/lib/git";
import { clearDiffCache } from "@/lib/gitCache";
import { ChangesViewHeader } from "./ChangesViewHeader";
import { FileListPanel } from "./FileListPanel";
import { DiffOrCommitPanel } from "./DiffOrCommitPanel";
import { PublishDialog } from "./PublishDialog";

export function ChangesView() {
  const {
    repoPath,
    status,
    currentBranch,
    isLoadingStatus,
    setStatus,
    setLoadingStatus,
    setCurrentBranch,
  } = useRepoStore();

  // useTransition for non-blocking state updates (Step 8: React 18 concurrent features)
  const [ , startTransition] = useTransition();

  // State declarations
  const [diffFile, setDiffFile] = useState<FileStatus | null>(null);
  const [diffStaged, setDiffStaged] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  // Memoize the refresh callback with useTransition for non-blocking updates
  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    setLoadingStatus(true);
    try {
      const [files, branch] = await Promise.all([
        git.getStatus(repoPath),
        git.getCurrentBranch(repoPath),
      ]);
      // Wrap state updates in transition to keep UI responsive
      startTransition(() => {
        setStatus(files);
        setCurrentBranch(branch);
      });
    } catch (e) {
      toast.error(`Failed to load status: ${String(e)}`);
    } finally {
      setLoadingStatus(false);
    }
  }, [repoPath, setStatus, setCurrentBranch, setLoadingStatus]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Phase 1 cache lifecycle: clear cache when leaving the current repo context.
  useEffect(() => {
    if (!repoPath) return;
    return () => {
      clearDiffCache(repoPath).catch(() => {});
    };
  }, [repoPath]);

  // Close diff panel on Escape key
  useEffect(() => {
    if (!diffFile) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        startTransition(() => {
          setDiffFile(null);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [diffFile]);

  // Memoize handler callbacks
  const handlePull = useCallback(async () => {
    if (!repoPath) return;
    try {
      const msg = await git.pull(repoPath);
      toast.success(msg || "Pulled successfully");
      await refreshStatus();
    } catch (e) {
      toast.error(`Pull failed: ${String(e)}`);
    }
  }, [repoPath, refreshStatus]);

  const handlePush = useCallback(async () => {
    if (!repoPath) return;
    setIsPushing(true);
    try {
      // Check if any remote is configured
      const remotes = await git.getRemotes(repoPath);
      if (remotes.length === 0) {
        // No remote — offer to publish to GitHub
        startTransition(() => {
          setPublishOpen(true);
        });
        return;
      }
      try {
        const msg = await git.push(repoPath);
        toast.success(msg || "Pushed successfully");
      } catch {
        // No upstream set yet — push with --set-upstream
        try {
          const msg = await git.push(repoPath, true);
          toast.success(msg || "Pushed with upstream set");
        } catch (e2) {
          toast.error(`Push failed: ${String(e2)}`);
        }
      }
    } catch (e) {
      toast.error(`Push failed: ${String(e)}`);
    } finally {
      setIsPushing(false);
    }
  }, [repoPath]);

  const handlePublishSuccess = useCallback(
    async (cloneUrl: string) => {
      // Remote was just added; now do the first push with --set-upstream
      setIsPushing(true);
      try {
        const msg = await git.push(repoPath!, true);
        toast.success(msg || `Pushed to ${cloneUrl}`);
      } catch (e) {
        // Might fail if no commits — that's fine
        const errMsg = String(e);
        if (
          !errMsg.includes("nothing to commit") &&
          !errMsg.includes("does not have any commits")
        ) {
          toast.error(`Push failed: ${errMsg}`);
        }
      } finally {
        setIsPushing(false);
      }
    },
    [repoPath]
  );

  const handleViewDiff = useCallback((file: FileStatus, staged: boolean) => {
    startTransition(() => {
      setDiffFile(file);
      setDiffStaged(staged);
    });
  }, []);

  const handleCloseDiff = useCallback(() => {
    startTransition(() => {
      setDiffFile(null);
    });
  }, []);

  // Memoize filtered staged files
  const stagedCount = useMemo(() => {
    return status.filter((f) => f.is_staged).length;
  }, [status]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header - loaded separately */}
      <ChangesViewHeader
        currentBranch={currentBranch}
        stagedCount={stagedCount}
        isLoadingStatus={isLoadingStatus}
        onPull={handlePull}
        onPush={handlePush}
        onRefresh={refreshStatus}
        isPushing={isPushing}
      />

      {/* Main resizable panels - each loads independently */}
      <ResizablePanelGroup
        className="flex-1 min-h-0 overflow-hidden"
        style={{ flexDirection: "row" }}
      >
        {/* Left: File list panel - loads independently */}
        <FileListPanel
          repoPath={repoPath!}
          status={status}
          onViewDiff={handleViewDiff}
          onRefresh={refreshStatus}
          onCloseDiff={handleCloseDiff}
        />

        <ResizableHandle withHandle />

        {/* Right: Diff or Commit panel - loads independently */}
        <DiffOrCommitPanel
          repoPath={repoPath!}
          diffFile={diffFile}
          diffStaged={diffStaged}
          hasStaged={stagedCount > 0}
          onCommitSuccess={refreshStatus}
        />
      </ResizablePanelGroup>

      {/* Publish dialog - lazy loads only when needed */}
      <PublishDialog
        open={publishOpen}
        onOpenChange={(open) => {
          startTransition(() => {
            setPublishOpen(open);
          });
          if (!open) setIsPushing(false);
        }}
        repoPath={repoPath!}
        onSuccess={handlePublishSuccess}
      />
    </div>
  );
}

