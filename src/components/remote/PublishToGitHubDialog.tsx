import { useState } from "react";
import { Github, Loader2, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/authStore";
import { git } from "@/lib/git";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  /** Called back with the clone URL after the repo is created and remote added */
  onSuccess: (cloneUrl: string) => void;
}

export function PublishToGitHubDialog({ open, onOpenChange, repoPath, onSuccess }: Props) {
  const githubToken = useAuthStore((s) => s.githubToken);
  const githubUser = useAuthStore((s) => s.githubUser);

  // Pre-fill with the folder name
  const defaultName = repoPath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .slice(-1)[0] ?? "";

  const [repoName, setRepoName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    if (!githubToken || !repoName.trim()) return;
    setIsCreating(true);
    try {
      const cloneUrl = await git.createGithubRepo(
        repoPath,
        githubToken,
        repoName.trim(),
        isPrivate,
        description.trim() || undefined
      );
      toast.success(`Published to GitHub as ${githubUser?.login ?? ""}/${repoName.trim()}`);
      onOpenChange(false);
      onSuccess(cloneUrl);
    } catch (e) {
      toast.error(`Failed to create repository: ${String(e)}`);
    } finally {
      setIsCreating(false);
    }
  }

  // Not signed in to GitHub
  if (!githubToken) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github size={18} />
              Publish to GitHub
            </DialogTitle>
            <DialogDescription>
              Connect your GitHub account in Settings to create a repository
              and push directly from EasyGit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github size={18} />
            Publish to GitHub
          </DialogTitle>
          {githubUser && (
            <DialogDescription>
              Creating under{" "}
              <span className="font-medium text-foreground">
                {githubUser.login}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Repository name</Label>
            <Input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-project"
              className="font-mono"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description…"
            />
          </div>

          {/* Visibility toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={cn(
                "flex items-center gap-2 rounded-md border p-3 text-sm transition-colors text-left",
                !isPrivate
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              <Globe size={15} className="shrink-0" />
              <div>
                <p className="font-medium leading-none mb-0.5">Public</p>
                <p className="text-[11px] text-muted-foreground">
                  Anyone can see this
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={cn(
                "flex items-center gap-2 rounded-md border p-3 text-sm transition-colors text-left",
                isPrivate
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              <Lock size={15} className="shrink-0" />
              <div>
                <p className="font-medium leading-none mb-0.5">Private</p>
                <p className="text-[11px] text-muted-foreground">
                  Only you can see this
                </p>
              </div>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !repoName.trim()}
            className="gap-2"
          >
            {isCreating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Github size={14} />
            )}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
