import { useEffect, useCallback, useState } from "react";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileChecklist } from "@/components/commit/FileChecklist";
import { ConventionalCommitBuilder } from "@/components/commit/ConventionalCommitBuilder";
import { DiffSheet } from "@/components/diff/DiffSheet";
import { PublishToGitHubDialog } from "@/components/remote/PublishToGitHubDialog";
import { useRepoStore } from "@/store/repoStore";
import { git, type FileStatus } from "@/lib/git";

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

  async function handlePush() {
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
  }

  async function handlePublishSuccess(cloneUrl: string) {
    // Remote was just added; now do the first push with --set-upstream
    setIsPushing(true);
    try {
      const msg = await git.push(repoPath!, true);
      toast.success(msg || `Pushed to ${cloneUrl}`);
    } catch (e) {
      // Might fail if no commits — that's fine
      const errMsg = String(e);
      if (!errMsg.includes("nothing to commit") && !errMsg.includes("does not have any commits")) {
        toast.error(`Push failed: ${errMsg}`);
      }
    } finally {
      setIsPushing(false);
    }
  }

  async function handlePull() {
    if (!repoPath) return;
    try {
      const msg = await git.pull(repoPath);
      toast.success(msg || "Pulled successfully");
      await refreshStatus();
    } catch (e) {
      toast.error(`Pull failed: ${String(e)}`);
    }
  }

  const staged = status.filter((f) => f.is_staged);

  const [diffFile, setDiffFile] = useState<FileStatus | null>(null);
  const [diffStaged, setDiffStaged] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  function handleViewDiff(file: FileStatus, staged: boolean) {
    setDiffFile(file);
    setDiffStaged(staged);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1">
          <GitBranch size={14} />
          <span className="font-mono font-medium text-foreground truncate max-w-48">
            {currentBranch || "—"}
          </span>
          {staged.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
              {staged.length} staged
            </Badge>
          )}
        </div>

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePull} title="Pull">
          <ArrowDown size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handlePush}
          disabled={isPushing}
          title="Push"
        >
          {isPushing ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refreshStatus}
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

      {/* Main resizable panels */}
      <ResizablePanelGroup className="flex-1 overflow-hidden" style={{ flexDirection: "row" }}>
        {/* Left: File list */}
        <ResizablePanel defaultSize={38} minSize={24}>
          <div className="h-full overflow-hidden">
            <FileChecklist
              files={status}
              repoPath={repoPath!}
              onRefresh={refreshStatus}
              onViewDiff={handleViewDiff}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Commit builder */}
        <ResizablePanel defaultSize={62} minSize={30}>
          <div className="h-full overflow-hidden border-l border-border">
            <ConventionalCommitBuilder
              repoPath={repoPath!}
              hasStaged={staged.length > 0}
              onCommitSuccess={refreshStatus}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {diffFile && (
        <DiffSheet
          open={!!diffFile}
          onOpenChange={(open) => { if (!open) setDiffFile(null); }}
          repoPath={repoPath!}
          filePath={diffFile.path}
          staged={diffStaged}
        />
      )}

      <PublishToGitHubDialog
        open={publishOpen}
        onOpenChange={(open) => {
          setPublishOpen(open);
          if (!open) setIsPushing(false);
        }}
        repoPath={repoPath!}
        onSuccess={handlePublishSuccess}
      />
    </div>
  );
}
