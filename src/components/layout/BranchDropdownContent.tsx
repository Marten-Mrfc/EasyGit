import { useEffect, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Settings2, Loader2, AlertCircle, FolderGit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRepoStore } from "@/store/repoStore";
import { git } from "@/lib/git";
import { cn } from "@/lib/utils";

export interface BranchDropdownContentProps {
  onSelectBranch?: (branch: string) => void;
  onManageBranches?: () => void;
  onManageWorktrees?: () => void;
  onError?: () => void; // Callback to close popover on error
}

export function BranchDropdownContent({
  onSelectBranch,
  onManageBranches,
  onManageWorktrees,
  onError,
}: BranchDropdownContentProps) {
  const {
    repoPath,
    branches,
    currentBranch,
    setBranches,
    setCurrentBranch,
    setLoadingBranches,
    isLoadingBranches,
    worktrees,
    setWorktrees,
      mainRepoPath,
      setMainRepoPath,
    setBranchCache,
    clearBranchCache,
    getBranchCache,
    setLoadingWorktrees,
    isLoadingWorktrees,
    setRepoPath,
  } = useRepoStore();

  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Reset hasLoaded when repoPath changes so we refetch for new location
  useEffect(() => {
    setHasLoaded(false);
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath || hasLoaded) return;

    const loadData = async () => {
      try {
        setError(null);
        setLoadingBranches(true);
        setLoadingWorktrees(true);

        console.log("[BranchDropdown] Loading from path:", repoPath);

        // Hydrate from persisted cache immediately (fast path)
        const cached = getBranchCache(repoPath);
        if (cached) {
          setBranches(cached.branches);
          setWorktrees(cached.worktrees);
          setCurrentBranch(cached.currentBranch);
          setMainRepoPath(cached.mainRepoPath);
          console.log("[BranchDropdown] Hydrated from cache:", repoPath);
        }
       
        // Try to use cached main repo path first
        let effectiveMainRepoPath = mainRepoPath;
        let worktreeList: Awaited<ReturnType<typeof git.listWorktrees>> = [];
       
        if (effectiveMainRepoPath) {
          // Use cached path to load all worktrees
          console.log("[BranchDropdown] Using cached main repo path:", effectiveMainRepoPath);
          try {
            worktreeList = await git.listWorktrees(effectiveMainRepoPath);

            // Verify it's still valid (should have multiple worktrees or be main)
            if (worktreeList.length === 1 && !worktreeList[0].is_main) {
              console.warn("[BranchDropdown] Cached path invalid, reloading");
              effectiveMainRepoPath = null;
            }
          } catch {
            console.warn("[BranchDropdown] Cached path failed, reloading");
            effectiveMainRepoPath = null;
          }
        }
       
        // If no cached path or cache invalid, discover it
        if (!effectiveMainRepoPath) {
          worktreeList = await git.listWorktrees(repoPath);
          console.log("[BranchDropdown] Loaded worktrees:", worktreeList.length);

          // If we got multiple worktrees, we're at the main repo
          if (worktreeList.length > 1) {
            const mainWorktree = worktreeList.find((w) => w.is_main);
            effectiveMainRepoPath = mainWorktree?.path || repoPath;
            setMainRepoPath(effectiveMainRepoPath);
            console.log("[BranchDropdown] Found and cached main repo:", effectiveMainRepoPath);
          }
          // If only 1 worktree, check if we have stored worktrees with a main one
          else if (worktrees.length > 1) {
            const storedMain = worktrees.find((w) => w.is_main);
            if (storedMain) {
              effectiveMainRepoPath = storedMain.path;
              // Reload from the stored main path
              worktreeList = await git.listWorktrees(effectiveMainRepoPath);
              setMainRepoPath(effectiveMainRepoPath);
              console.log("[BranchDropdown] Using stored main repo:", effectiveMainRepoPath);
            } else {
              // Fallback: use current path
              effectiveMainRepoPath = repoPath;
              console.warn("[BranchDropdown] Could not find main repo, using current path");
            }
          } else {
            // No worktrees stored either, use current path
            effectiveMainRepoPath = repoPath;
            console.warn("[BranchDropdown] Single worktree setup, using current path");
          }
        }
       
        // Load branches from main repository and current branch from current location
        const [branchList, currentBranchName] = await Promise.all([
          git.getBranches(effectiveMainRepoPath),
          git.getCurrentBranch(repoPath),
        ]);

        console.log("[BranchDropdown] Loaded branches:", branchList.length);
        console.log("[BranchDropdown] Current branch:", currentBranchName);

        setWorktrees(worktreeList);
        setBranches(branchList);
        setCurrentBranch(currentBranchName);

        // Persist cache both for current worktree path and resolved main repo path
        const cacheEntry = {
          branches: branchList,
          worktrees: worktreeList,
          currentBranch: currentBranchName,
          mainRepoPath: effectiveMainRepoPath,
          updatedAt: Date.now(),
        };
        setBranchCache(repoPath, cacheEntry);
        if (effectiveMainRepoPath && effectiveMainRepoPath !== repoPath) {
          setBranchCache(effectiveMainRepoPath, cacheEntry);
        }

        setHasLoaded(true);
      } catch (err) {
        console.error("[BranchDropdown] Error loading data:", err);
        const message = err instanceof Error ? err.message : "Failed to load branches";
        setError(message);
        toast.error(message);
        onError?.();
      } finally {
        setLoadingBranches(false);
        setLoadingWorktrees(false);
      }
    };
 
     loadData();
   }, [
     repoPath,
     hasLoaded,
     mainRepoPath,
     worktrees,
     setLoadingBranches,
     setLoadingWorktrees,
     setBranches,
     setCurrentBranch,
     setWorktrees,
     setMainRepoPath,
     setBranchCache,
     getBranchCache,
     onError,
   ]);

  const handleClearBranchCache = useCallback(() => {
    clearBranchCache();
    setMainRepoPath(null);
    setHasLoaded(false);
    toast.success("Branch cache cleared");
  }, [clearBranchCache, setMainRepoPath]);
 
   const handleSwitchBranch = useCallback(
     async (branchName: string) => {
       if (!repoPath) return;
 
       // Check if this branch is already checked out in a worktree
       const worktree = worktrees.find((w) => w.branch === branchName);
       
       if (worktree) {
         // Switch to the worktree path instead of trying to checkout the branch
         setRepoPath(worktree.path);
         onSelectBranch?.(branchName);
         toast.success(`Switched to worktree: ${worktree.path}`);
         return;
       }
       
       // Normal branch switch
       try {
         await git.switchBranch(repoPath, branchName);
         onSelectBranch?.(branchName);
         toast.success(`Switched to ${branchName}`);
       } catch (e) {
         toast.error(`Failed to switch branch: ${String(e)}`);
       }
     },
     [repoPath, worktrees, setRepoPath, onSelectBranch]
   );

  // Sort branches alphabetically
  const sortedBranches = useMemo(() => {
    const sorted = [...branches].sort((a, b) => a.name.localeCompare(b.name));
    console.log("[BranchDropdown] Rendering with branches:", sorted.map(b => b.name), "current:", currentBranch);
    return sorted;
  }, [branches, currentBranch]);

  // Create a map of branch names to worktree info
  const worktreeMap = useMemo(() => {
    const map = new Map<string, typeof worktrees[0]>();
    worktrees.forEach((w) => map.set(w.branch, w));
    return map;
  }, [worktrees]);

  return (
    <div className="w-full">
      <ScrollArea className="h-75">
        <div className="p-2 space-y-1">
          {error ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <AlertCircle size={16} className="text-destructive" />
              <span className="text-sm text-muted-foreground text-center">
                Failed to load branches
              </span>
            </div>
          ) : isLoadingBranches || isLoadingWorktrees ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 size={16} className="animate-spin mr-2" />
              <span className="text-sm">Loading branches...</span>
            </div>
          ) : (
            <>
              {sortedBranches.length > 0 ? (
                sortedBranches.map((branch) => {
                  const worktree = worktreeMap.get(branch.name);
                  const isInWorktree = !!worktree;
                  
                  return (
                    <Button
                      key={branch.name}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "w-full justify-start text-sm font-mono h-auto py-1.5 px-2",
                        branch.name === currentBranch && "bg-accent"
                      )}
                      onClick={() => handleSwitchBranch(branch.name)}
                    >
                      {branch.name === currentBranch && (
                        <Check size={14} className="mr-2 shrink-0" />
                      )}
                      <span className="flex-1 text-left truncate">
                        {branch.name}
                      </span>
                      {isInWorktree && (
                        <span title={`Worktree: ${worktree.path}`}>
                          <FolderGit2 
                            size={12} 
                            className="ml-1 shrink-0 text-blue-400"
                          />
                        </span>
                      )}
                    </Button>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No branches found
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer with manage buttons */}
      <Separator />
      <div className="flex items-center gap-1 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs justify-start gap-2"
          onClick={onManageBranches}
        >
          <Settings2 size={12} />
          <span>Branches</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 h-7 text-xs justify-start gap-2"
          onClick={onManageWorktrees}
        >
          <Settings2 size={12} />
          <span>Worktrees</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleClearBranchCache}
          title="Clear branch cache"
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}
