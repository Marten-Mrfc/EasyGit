import { useEffect, useCallback, useState, Suspense, lazy, memo } from "react";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileChecklist } from "@/components/commit/FileChecklist";
import { useRepoStore } from "@/store/repoStore";
import { git, type FileStatus } from "@/lib/git";
import { clearDiffCache } from "@/lib/gitCache";

// Lazy load heavy components
const ConventionalCommitBuilder = lazy(() =>
  import("@/components/commit/ConventionalCommitBuilder").then((mod) => ({
    default: mod.ConventionalCommitBuilder,
  }))
);

const DiffPanel = lazy(() =>
  import("@/components/diff/DiffPanel").then((mod) => ({
    default: mod.DiffPanel,
  }))
);

const PublishToGitHubDialog = lazy(() =>
  import("@/components/remote/PublishToGitHubDialog").then((mod) => ({
    default: mod.PublishToGitHubDialog,
  }))
);

// Fallback skeleton components
function FileChecklistSkeleton() {
  return (
    <div className="h-full p-4 space-y-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function DiffPanelSkeleton() {
  return (
    <div className="h-full p-4 space-y-3">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function CommitBuilderSkeleton() {
  return (
    <div className="h-full p-4 space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

// Memoized header to prevent unnecessary re-renders
const Header = memo(function Header({
  currentBranch,
  stagedCount,
  isLoadingStatus,
  onPull,
  onPush,
  onRefresh,
  isPushing,
}: {
  currentBranch: string | null;
  stagedCount: number;
  isLoadingStatus: boolean;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  isPushing: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1">
        <GitBranch size={14} />
        <span className="font-mono font-medium text-foreground truncate max-w-48">
          {currentBranch || "—"}
        </span>
        {stagedCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
            {stagedCount} staged
          </Badge>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPull}
        title="Pull"
      >
        <ArrowDown size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPush}
        disabled={isPushing}
        title="Push"
      >
        {isPushing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ArrowUp size={14} />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onRefresh}
        disabled={isLoadingStatus}
        title="Refresh"
      >
        {isLoadingStatus ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
      </Button>
    </div>
  );
});

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

  // State declarations must come before useEffect calls (React hook rules)
  const [diffFile, setDiffFile] = useState<FileStatus | null>(null);
  const [diffStaged, setDiffStaged] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  // Memoize the refresh callback
  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    setLoadingStatus(true);
    try {
      const [files, branch] = await Promise.all([
        git.getStatus(repoPath),
        git.getCurrentBranch(repoPath),
      ]);
      setStatus(files);
      setCurrentBranch(branch);
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
        setDiffFile(null);
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
        setPublishOpen(true);
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
    setDiffFile(file);
    setDiffStaged(staged);
  }, []);

  // Memoize filtered staged files
  const staged = useCallback(() => {
    return status.filter((f) => f.is_staged);
  }, [status]);

  const stagedCount = staged().length;

  return (
    <div className="flex flex-col h-full">
      {/* Memoized header to prevent unnecessary re-renders */}
      <Header
        currentBranch={currentBranch}
        stagedCount={stagedCount}
        isLoadingStatus={isLoadingStatus}
        onPull={handlePull}
        onPush={handlePush}
        onRefresh={refreshStatus}
        isPushing={isPushing}
      />

      {/* Main resizable panels */}
      <ResizablePanelGroup className="flex-1 overflow-hidden" style={{ flexDirection: "row" }}>
        {/* Left: File list */}
        <ResizablePanel defaultSize={38} minSize={24}>
          <div className="h-full overflow-hidden">
            <Suspense fallback={<FileChecklistSkeleton />}>
              <FileChecklist
                files={status}
                repoPath={repoPath!}
                onRefresh={refreshStatus}
                onViewDiff={handleViewDiff}
              />
            </Suspense>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Diff panel (when file selected) or Commit builder (when no file) */}
        <ResizablePanel defaultSize={62} minSize={30}>
          <div className="h-full overflow-hidden border-l border-border">
            {diffFile ? (
              <Suspense fallback={<DiffPanelSkeleton />}>
                <DiffPanel
                  repoPath={repoPath!}
                  filePath={diffFile.path}
                  staged={diffStaged}
                />
              </Suspense>
            ) : (
              <Suspense fallback={<CommitBuilderSkeleton />}>
                <ConventionalCommitBuilder
                  repoPath={repoPath!}
                  hasStaged={stagedCount > 0}
                  onCommitSuccess={refreshStatus}
                />
              </Suspense>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Lazy load dialog only when needed */}
      {publishOpen && (
        <Suspense fallback={null}>
          <PublishToGitHubDialog
            open={publishOpen}
            onOpenChange={(open) => {
              setPublishOpen(open);
              if (!open) setIsPushing(false);
            }}
            repoPath={repoPath!}
            onSuccess={handlePublishSuccess}
          />
        </Suspense>
      )}
    </div>
  );
}

