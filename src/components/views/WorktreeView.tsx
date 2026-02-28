import { useEffect, useCallback, useState } from "react";
import {
  LayoutDashboard,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  FolderOpen,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRepoStore } from "@/store/repoStore";
import { git, type WorktreeInfo } from "@/lib/git";

export function WorktreeView() {
  const {
    repoPath,
    worktrees,
    setWorktrees,
    setLoadingWorktrees,
    isLoadingWorktrees,
    setRepoPath,
  } = useRepoStore();

  const [addOpen, setAddOpen] = useState(false);
  const [wtPath, setWtPath] = useState("");
  const [wtBranch, setWtBranch] = useState("");
  const [wtNewBranch, setWtNewBranch] = useState(false);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoadingWorktrees(true);
    try {
      const list = await git.listWorktrees(repoPath);
      setWorktrees(list);
    } catch (e) {
      toast.error(`Failed to load worktrees: ${String(e)}`);
    } finally {
      setLoadingWorktrees(false);
    }
  }, [repoPath, setWorktrees, setLoadingWorktrees]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addWorktree() {
    if (!repoPath || !wtPath.trim()) return;
    try {
      await git.addWorktree(repoPath, wtPath.trim(), wtBranch.trim(), wtNewBranch);
      toast.success("Worktree added");
      setAddOpen(false);
      setWtPath("");
      setWtBranch("");
      setWtNewBranch(false);
      await refresh();
    } catch (e) {
      toast.error(`Add failed: ${String(e)}`);
    }
  }

  async function removeWorktree(wt: WorktreeInfo) {
    if (!repoPath) return;
    try {
      await git.removeWorktree(repoPath, wt.path, false);
      toast.success("Worktree removed");
      await refresh();
    } catch {
      try {
        await git.removeWorktree(repoPath, wt.path, true);
        toast.success("Worktree force-removed");
        await refresh();
      } catch (e2) {
        toast.error(`Remove failed: ${String(e2)}`);
      }
    }
  }

  function switchContext(wt: WorktreeInfo) {
    setRepoPath(wt.path);
    toast.success(`Switched context to ${wt.path}`);
  }

  function pathBasename(p: string) {
    return p.replace(/\\/g, "/").split("/").filter(Boolean).slice(-1)[0] ?? p;
  }

  const activeWorktree = worktrees.find((w) => w.path === repoPath);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
        <LayoutDashboard size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Worktrees</span>

        {activeWorktree && !activeWorktree.is_main && (
          <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 text-blue-400 border-blue-500/40">
            linked
          </Badge>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refresh}
          disabled={isLoadingWorktrees}
          title="Refresh"
        >
          {isLoadingWorktrees ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 gap-1.5 px-2.5">
              <Plus size={13} />
              Add Worktree
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Worktree</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="wt-path">Path</Label>
                <Input
                  id="wt-path"
                  placeholder="C:\dev\feature-branch"
                  value={wtPath}
                  onChange={(e) => setWtPath(e.target.value)}
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wt-branch">Branch</Label>
                <Input
                  id="wt-branch"
                  placeholder="feature/my-feature"
                  value={wtBranch}
                  onChange={(e) => setWtBranch(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={wtNewBranch}
                  onChange={(e) => setWtNewBranch(e.target.checked)}
                  className="rounded"
                />
                Create new branch (-b)
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={addWorktree} disabled={!wtPath.trim()}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Worktree list */}
      <ScrollArea className="flex-1">
        {worktrees.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
            <LayoutDashboard size={24} className="opacity-30" />
            No worktrees found
          </div>
        ) : (
          <ul className="py-1">
            {worktrees.map((wt) => {
              const isActive = wt.path === repoPath;
              return (
                <li
                  key={wt.path}
                  className={cn(
                    "flex items-start gap-3 px-3 py-3 group hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0",
                    isActive && "bg-primary/5"
                  )}
                >
                  {/* Active indicator */}
                  <div className="w-4 shrink-0 flex justify-center pt-0.5">
                    {isActive ? (
                      <CheckCircle2 size={14} className="text-primary" />
                    ) : (
                      <FolderOpen size={14} className="text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>
                        {pathBasename(wt.path)}
                      </span>
                      {wt.is_main && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">main</Badge>
                      )}
                      {wt.locked && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-400 border-amber-500/40">
                          <Lock size={9} className="mr-0.5" /> locked
                        </Badge>
                      )}
                    </div>
                    {wt.branch && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{wt.branch}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5 font-mono">{wt.path}</p>
                    {wt.commit && (
                      <p className="text-[10px] text-muted-foreground/40 font-mono">{wt.commit}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => switchContext(wt)}
                        title="Switch to this worktree"
                      >
                        Switch
                      </Button>
                    )}
                    {!wt.is_main && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="Remove worktree"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove worktree?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove worktree at <span className="font-mono font-medium">{wt.path}</span>?{" "}
                              The directory and any uncommitted changes will be lost.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeWorktree(wt)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
