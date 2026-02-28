import { useEffect, useCallback, useState } from "react";
import {
  Archive,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  DownloadCloud,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
import { git } from "@/lib/git";

export function StashView() {
  const {
    repoPath,
    stashes,
    setStashes,
    setLoadingStashes,
    isLoadingStashes,
  } = useRepoStore();

  const [pushOpen, setPushOpen] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoadingStashes(true);
    try {
      const list = await git.listStashes(repoPath);
      setStashes(list);
    } catch (e) {
      toast.error(`Failed to load stashes: ${String(e)}`);
    } finally {
      setLoadingStashes(false);
    }
  }, [repoPath, setStashes, setLoadingStashes]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handlePush() {
    if (!repoPath) return;
    try {
      const msg = await git.stashPush(repoPath, stashMessage || undefined, includeUntracked);
      toast.success(msg || "Stash saved");
      setStashMessage("");
      setIncludeUntracked(false);
      setPushOpen(false);
      await refresh();
    } catch (e) {
      toast.error(`Stash failed: ${String(e)}`);
    }
  }

  async function handlePop(index: number) {
    if (!repoPath) return;
    try {
      const msg = await git.stashPop(repoPath, index);
      toast.success(msg || `Popped stash@{${index}}`);
      await refresh();
    } catch (e) {
      toast.error(`Pop failed: ${String(e)}`);
    }
  }

  async function handleApply(index: number) {
    if (!repoPath) return;
    try {
      const msg = await git.stashApply(repoPath, index);
      toast.success(msg || `Applied stash@{${index}}`);
      await refresh();
    } catch (e) {
      toast.error(`Apply failed: ${String(e)}`);
    }
  }

  async function handleDrop(index: number) {
    if (!repoPath) return;
    try {
      await git.stashDrop(repoPath, index);
      toast.success(`Dropped stash@{${index}}`);
      await refresh();
    } catch (e) {
      toast.error(`Drop failed: ${String(e)}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
        <Archive size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          Stashes
          {stashes.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">
              {stashes.length}
            </Badge>
          )}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refresh}
          disabled={isLoadingStashes}
          title="Refresh"
        >
          {isLoadingStashes ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>

        {/* Push (save) stash */}
        <Dialog open={pushOpen} onOpenChange={setPushOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 gap-1.5 px-2.5">
              <Plus size={13} />
              Save Stash
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Save Stash</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="stash-msg">Message <span className="font-normal text-muted-foreground/60">(optional)</span></Label>
                <Input
                  id="stash-msg"
                  placeholder="WIP: working on feature…"
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePush(); }}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="include-untracked"
                  checked={includeUntracked}
                  onCheckedChange={setIncludeUntracked}
                />
                <Label htmlFor="include-untracked" className="cursor-pointer text-sm">
                  Include untracked files (-u)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={handlePush}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stash list */}
      <ScrollArea className="flex-1">
        {stashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
            <PackageOpen size={24} className="opacity-30" />
            No stashes
          </div>
        ) : (
          <ul className="py-1">
            {stashes.map((s) => (
              <li
                key={s.index}
                className="flex items-center gap-3 px-3 py-3 group hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0"
              >
                <Archive size={14} className="text-muted-foreground/50 shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{s.message}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.reference} · {s.hash}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handlePop(s.index)}
                    title="Pop (apply and drop)"
                  >
                    <DownloadCloud size={11} className="mr-1" />
                    Pop
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => handleApply(s.index)}
                    title="Apply (keep in stash)"
                  >
                    Apply
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Drop stash"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Drop stash?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Permanently delete <span className="font-mono font-medium">{s.reference}</span>?{" "}
                          This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDrop(s.index)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Drop
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
