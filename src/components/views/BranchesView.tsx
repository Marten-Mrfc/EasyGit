import { useEffect, useState, useCallback } from "react";
import {
  GitBranch,
  Plus,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Trash2,
  Loader2,
  Check,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { git, type BranchInfo } from "@/lib/git";

export function BranchesView() {
  const {
    repoPath,
    branches,
    currentBranch,
    isLoadingBranches,
    worktrees,
    setBranches,
    setCurrentBranch,
    setLoadingBranches,
    setRepoPath,
  } = useRepoStore();

  const [query, setQuery] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [checkoutNew, setCheckoutNew] = useState(true);
  const [newBranchOpen, setNewBranchOpen] = useState(false);

  const refreshBranches = useCallback(async () => {
    if (!repoPath) return;
    setLoadingBranches(true);
    try {
      const [branchList, current] = await Promise.all([
        git.getBranches(repoPath),
        git.getCurrentBranch(repoPath),
      ]);
      setBranches(branchList);
      setCurrentBranch(current);
    } catch (e) {
      toast.error(`Failed to load branches: ${String(e)}`);
    } finally {
      setLoadingBranches(false);
    }
  }, [repoPath, setBranches, setCurrentBranch, setLoadingBranches]);

  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  async function switchTo(branch: BranchInfo) {
    if (!repoPath || branch.current) return;
    try {
      await git.switchBranch(repoPath, branch.name);
      toast.success(`Switched to ${branch.name}`);
      await refreshBranches();
      const matching = worktrees.find((w) => !w.is_main && w.branch === branch.name);
      if (matching) {
        toast("Branch exists in a worktree", {
          description: matching.path,
          action: {
            label: "Switch Context",
            onClick: () => setRepoPath(matching.path),
          },
        });
      }
    } catch (e) {
      toast.error(`Switch failed: ${String(e)}`);
    }
  }

  async function deleteBranch(branch: BranchInfo) {
    if (!repoPath) return;
    try {
      await git.deleteBranch(repoPath, branch.name, false);
      toast.success(`Deleted branch ${branch.name}`);
      await refreshBranches();
    } catch {
      // retry with force
      try {
        await git.deleteBranch(repoPath, branch.name, true);
        toast.success(`Force-deleted ${branch.name}`);
        await refreshBranches();
      } catch (e2) {
        toast.error(`Delete failed: ${String(e2)}`);
      }
    }
  }

  async function createBranch() {
    if (!repoPath || !newBranchName.trim()) return;
    try {
      await git.createBranch(repoPath, newBranchName.trim(), checkoutNew);
      toast.success(`Created branch ${newBranchName.trim()}`);
      setNewBranchName("");
      setNewBranchOpen(false);
      await refreshBranches();
    } catch (e) {
      toast.error(`Create failed: ${String(e)}`);
    }
  }

  async function handleFetch() {
    if (!repoPath) return;
    try {
      await git.fetch(repoPath);
      toast.success("Fetched all remotes");
      await refreshBranches();
    } catch (e) {
      toast.error(`Fetch failed: ${String(e)}`);
    }
  }

  async function handlePull() {
    if (!repoPath) return;
    try {
      const msg = await git.pull(repoPath);
      toast.success(msg || "Pulled successfully");
      await refreshBranches();
    } catch (e) {
      toast.error(`Pull failed: ${String(e)}`);
    }
  }

  async function handlePush() {
    if (!repoPath) return;
    try {
      const msg = await git.push(repoPath);
      toast.success(msg || "Pushed successfully");
    } catch {
      try {
        const msg = await git.push(repoPath, true);
        toast.success(msg || "Pushed with upstream set");
      } catch (e2) {
        toast.error(`Push failed: ${String(e2)}`);
      }
    }
  }

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0 flex-wrap">
        <GitBranch size={14} className="text-muted-foreground shrink-0" />
        <Badge variant="outline" className="font-mono text-xs h-5 max-w-32 truncate">
          {currentBranch || "—"}
        </Badge>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Pull" onClick={handlePull}>
            <ArrowDown size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Push" onClick={handlePush}>
            <ArrowUp size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Fetch" onClick={handleFetch}>
            <RotateCcw size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={refreshBranches}
            disabled={isLoadingBranches}
            title="Refresh"
          >
            {isLoadingBranches ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>

          {/* New branch dialog */}
          <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 gap-1.5 px-2.5 ml-1">
                <Plus size={13} />
                New Branch
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Create Branch</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-branch-name">Branch name</Label>
                  <Input
                    id="new-branch-name"
                    placeholder="feature/my-feature"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createBranch(); }}
                    className="font-mono"
                    autoFocus
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkoutNew}
                    onChange={(e) => setCheckoutNew(e.target.checked)}
                    className="rounded"
                  />
                  Switch to new branch
                </label>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button onClick={createBranch} disabled={!newBranchName.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <Input
          placeholder="Filter branches…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 text-sm"
        />
      </div>

      {/* Branch list */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            {branches.length === 0 ? "No branches found" : "No matches"}
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((branch) => (
              <li
                key={branch.name}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 group hover:bg-muted/40 transition-colors",
                  branch.current && "bg-primary/5"
                )}
              >
                {/* Current indicator */}
                <div className="w-3 shrink-0 flex justify-center">
                  {branch.current && (
                    <Check size={12} className="text-primary" />
                  )}
                </div>

                {/* Branch info */}
                <div
                  className={cn(
                    "flex-1 min-w-0 cursor-pointer",
                    !branch.current && "hover:text-foreground"
                  )}
                  onDoubleClick={() => switchTo(branch)}
                >
                  <p
                    className={cn(
                      "text-sm font-mono truncate",
                      branch.current ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {branch.name}
                  </p>
                  {branch.upstream && (
                    <p className="text-[10px] text-muted-foreground/60 truncate">
                      ↑ {branch.upstream}
                    </p>
                  )}
                </div>

                {/* Actions — shown on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Copy branch name"
                    onClick={() => {
                      navigator.clipboard.writeText(branch.name);
                      toast.success("Branch name copied");
                    }}
                  >
                    <Copy size={12} />
                  </Button>
                  {!branch.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => switchTo(branch)}
                      title="Switch to this branch"
                    >
                      Switch
                    </Button>
                  )}

                  {!branch.current && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Delete branch"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete branch?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete <span className="font-mono font-medium">{branch.name}</span>?{" "}
                            This cannot be undone if not already merged.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteBranch(branch)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
