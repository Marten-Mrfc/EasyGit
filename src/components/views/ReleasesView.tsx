import { useState, useCallback } from "react";
import {
  Tag,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Globe,
  Lock,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useRepoStore } from "@/store/repoStore";
import { useAuthStore } from "@/store/authStore";
import { git, type TagInfo } from "@/lib/git";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse owner/repo from a GitHub remote URL (https or ssh). */
function parseGitHubOwnerRepo(
  url: string
): { owner: string; repo: string } | null {
  // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

/** Suggest next semver versions from latest tag name. */
function suggestNextVersions(latest: string | undefined): string[] {
  if (!latest) return ["v0.1.0", "v1.0.0"];
  const clean = latest.replace(/^v/, "");
  const parts = clean.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [];
  const [major, minor, patch] = parts;
  return [
    `v${major}.${minor}.${patch + 1}`,
    `v${major}.${minor + 1}.0`,
    `v${major + 1}.0.0`,
  ];
}

/** Convert raw oneline commit log into grouped markdown release notes. */
function formatReleaseNotes(commits: string[]): string {
  if (commits.length === 0) return "";

  const groups: Record<string, string[]> = {
    "✨ Features": [],
    "🐛 Bug Fixes": [],
    "♻️ Refactors": [],
    "📚 Docs": [],
    "🔧 Other": [],
  };

  for (const line of commits) {
    // strip leading commit hash
    const msg = line.replace(/^[0-9a-f]+ /, "").trim();
    if (/^feat/.test(msg)) groups["✨ Features"].push(msg);
    else if (/^fix/.test(msg)) groups["🐛 Bug Fixes"].push(msg);
    else if (/^refactor/.test(msg)) groups["♻️ Refactors"].push(msg);
    else if (/^docs/.test(msg)) groups["📚 Docs"].push(msg);
    else groups["🔧 Other"].push(msg);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => `### ${title}\n${items.map((i) => `- ${i}`).join("\n")}`)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// CreateReleaseDialog
// ---------------------------------------------------------------------------

interface CreateReleaseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repoPath: string;
  tags: TagInfo[];
  githubToken: string | null;
  githubRemote: { owner: string; repo: string } | null;
  onCreated: () => void;
}

function CreateReleaseDialog({
  open,
  onOpenChange,
  repoPath,
  tags,
  githubToken,
  githubRemote,
  onCreated,
}: CreateReleaseDialogProps) {
  const latestTag = tags[0]?.name;
  const suggestions = suggestNextVersions(latestTag);

  const [tagName, setTagName] = useState(suggestions[0] ?? "v0.1.0");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [prerelease, setPrerelease] = useState(false);
  const [draft, setDraft] = useState(false);
  const [publishToGitHub, setPublishToGitHub] = useState(
    !!githubToken && !!githubRemote
  );
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>("");

  function reset() {
    setTagName(suggestions[0] ?? "v0.1.0");
    setTitle("");
    setNotes("");
    setPrerelease(false);
    setDraft(false);
    setPublishToGitHub(!!githubToken && !!githubRemote);
    setStep("");
  }

  async function handleGenerateNotes() {
    setGenerating(true);
    try {
      if (githubToken && githubRemote) {
        // Use GitHub's native release-notes generator for richer output
        const generated = await git.generateGithubReleaseNotes(
          githubToken,
          githubRemote.owner,
          githubRemote.repo,
          tagName,
          latestTag,
        );
        setNotes(generated || "No changes since last tag.");
      } else {
        // Fallback: build notes from local commit log
        const commits = await git.getCommitsSinceTag(repoPath, latestTag);
        const generated = formatReleaseNotes(commits);
        setNotes(generated || "No changes since last tag.");
      }
    } catch {
      // If GitHub API fails, fall back to local parsing
      try {
        const commits = await git.getCommitsSinceTag(repoPath, latestTag);
        const generated = formatReleaseNotes(commits);
        setNotes(generated || "No changes since last tag.");
      } catch (inner) {
        toast.error(String(inner));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate() {
    const trimTag = tagName.trim();
    const trimTitle = (title.trim() || trimTag);
    if (!trimTag) return;

    setBusy(true);
    try {
      // 1. Create local tag
      setStep("Creating local tag…");
      await git.createTag(repoPath, trimTag, trimTitle);

      // 2. Push tag to origin
      setStep("Pushing tag to origin…");
      try {
        await git.pushTag(repoPath, trimTag);
      } catch {
        // If no remote, warn but continue
        toast.warning("Tag created locally but could not push (no remote?)");
      }

      // 3. Create GitHub Release
      if (publishToGitHub && githubToken && githubRemote) {
        setStep("Creating GitHub Release…");
        const url = await git.createGithubRelease(
          githubToken,
          githubRemote.owner,
          githubRemote.repo,
          trimTag,
          trimTitle,
          notes,
          prerelease,
          draft
        );
        toast.success(
          <span>
            Release published!{" "}
            <button
              className="underline"
              onClick={() => openUrl(url)}
            >
              View on GitHub
            </button>
          </span>
        );
      } else {
        toast.success(`Tag '${trimTag}' created and pushed`);
      }

      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) {
          reset();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Release</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Tag name + suggestions */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tag</Label>
            <Input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="v1.0.0"
              className="font-mono text-sm h-8"
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTagName(s)}
                    className={cn(
                      "text-[11px] font-mono px-2 py-0.5 rounded-full border transition-colors",
                      tagName === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Title{" "}
              <span className="text-muted-foreground/60">(defaults to tag name)</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tagName || "Release title"}
              className="text-sm h-8"
            />
          </div>

          {/* Release notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Release notes
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                onClick={handleGenerateNotes}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Sparkles size={11} />
                )}
                {githubToken && githubRemote ? "Generate via GitHub" : "Generate from commits"}
              </Button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what's changed in this release…"
              rows={7}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="prerelease"
                checked={prerelease}
                onCheckedChange={setPrerelease}
                className="scale-75 -ml-1"
              />
              <Label htmlFor="prerelease" className="text-xs cursor-pointer">
                Pre-release
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="draft"
                checked={draft}
                onCheckedChange={setDraft}
                className="scale-75 -ml-1"
              />
              <Label htmlFor="draft" className="text-xs cursor-pointer">
                Draft
              </Label>
            </div>
          </div>

          {/* Publish to GitHub toggle */}
          {githubToken && githubRemote ? (
            <div className="rounded-md bg-muted px-3 py-2 flex items-center gap-2.5">
              <Github size={13} className="text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 text-muted-foreground">
                Publish to{" "}
                <span className="font-medium text-foreground">
                  {githubRemote.owner}/{githubRemote.repo}
                </span>
              </span>
              <Switch
                checked={publishToGitHub}
                onCheckedChange={setPublishToGitHub}
                className="scale-75"
              />
            </div>
          ) : githubToken && !githubRemote ? (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              <span className="text-xs text-muted-foreground">
                No GitHub remote detected — tag will be created locally only.
              </span>
            </div>
          ) : (
            <div className="rounded-md bg-muted px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                Connect GitHub in Settings to also publish a GitHub Release.
              </span>
            </div>
          )}

          {/* Step indicator */}
          {step && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={11} className="animate-spin" />
              {step}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={busy || !tagName.trim()}
            className="gap-1.5"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Tag size={13} />}
            {publishToGitHub && githubRemote ? "Publish Release" : "Create Tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tiny inline GitHub icon to avoid import issues
function Github({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TagRow
// ---------------------------------------------------------------------------

interface TagRowProps {
  tag: TagInfo;
  onDelete: (tag: TagInfo) => void;
}

function TagRow({ tag, onDelete }: TagRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 group">
      <Tag size={13} className="text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono font-medium">{tag.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {tag.commit_hash}
          </span>
        </div>
        {tag.message && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {tag.message}
          </p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
        {tag.date}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(tag)}
        title="Delete tag"
      >
        <Trash2 size={12} />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteTagDialog
// ---------------------------------------------------------------------------

interface DeleteTagDialogProps {
  tag: TagInfo | null;
  onClose: () => void;
  onConfirm: (tag: TagInfo, deleteRemote: boolean) => Promise<void>;
}

function DeleteTagDialog({ tag, onClose, onConfirm }: DeleteTagDialogProps) {
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!tag) return;
    setBusy(true);
    await onConfirm(tag, deleteRemote);
    setBusy(false);
    setDeleteRemote(false);
    onClose();
  }

  return (
    <AlertDialog open={!!tag} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete tag "{tag?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the local tag. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="del-remote"
            checked={deleteRemote}
            onCheckedChange={setDeleteRemote}
            className="scale-75 -ml-1"
          />
          <Label htmlFor="del-remote" className="text-xs cursor-pointer">
            Also delete from remote (origin)
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handle}
            disabled={busy}
          >
            {busy ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// ReleasesView
// ---------------------------------------------------------------------------

export function ReleasesView() {
  const repoPath = useRepoStore((s) => s.repoPath)!;
  const { githubToken } = useAuthStore();

  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TagInfo | null>(null);
  const [remotes, setRemotes] = useState<{ name: string; url: string }[]>([]);

  // Derive GitHub owner/repo from remotes
  const githubRemote = remotes
    .map((r) => parseGitHubOwnerRepo(r.url))
    .find(Boolean) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tagList, remoteList] = await Promise.all([
        git.listTags(repoPath),
        git.getRemotes(repoPath),
      ]);
      setTags(tagList);
      setRemotes(remoteList);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  // Load on mount
  useState(() => { load(); });

  async function handleDeleteConfirm(tag: TagInfo, deleteRemote: boolean) {
    try {
      await git.deleteTag(repoPath, tag.name);
      if (deleteRemote) {
        try {
          await git.deleteRemoteTag(repoPath, tag.name);
        } catch {
          toast.warning("Tag deleted locally but could not delete from remote");
        }
      }
      toast.success(`Tag '${tag.name}' deleted`);
      await load();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Tag size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Releases</h2>
          {tags.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {tags.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {githubToken && githubRemote && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() =>
                openUrl(
                  `https://github.com/${githubRemote.owner}/${githubRemote.repo}/releases`
                )
              }
              title="Open releases on GitHub"
            >
              <ExternalLink size={12} />
              GitHub
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={12} />
            New Release
          </Button>
        </div>
      </div>

      {/* GitHub remote badge */}
      {githubRemote && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
          <Github size={11} className="text-muted-foreground" />
          <span>
            Connected to{" "}
            <span className="font-medium text-foreground">
              {githubRemote.owner}/{githubRemote.repo}
            </span>
          </span>
          {githubToken ? (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto gap-1">
              <Globe size={8} /> GitHub connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto gap-1 text-amber-600 border-amber-500/30">
              <Lock size={8} /> No GitHub token
            </Badge>
          )}
        </div>
      )}

      {/* Body */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-2 space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-md">
                <Skeleton className="h-3.5 w-3.5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-24" />
                </div>
                <Skeleton className="h-2.5 w-14" />
              </div>
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-8">
            <div className="rounded-full bg-muted p-3">
              <Tag size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No releases yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Tags mark specific points in your history. Create your first release to get started.
            </p>
            <Button
              size="sm"
              className="gap-1.5 mt-1"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={13} />
              New Release
            </Button>
          </div>
        ) : (
          <div className="p-2">
            {tags.map((tag, i) => (
              <div key={tag.name}>
                <TagRow tag={tag} onDelete={setTagToDelete} />
                {i < tags.length - 1 && (
                  <Separator className="mx-3 my-0.5 opacity-40" />
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Dialogs */}
      <CreateReleaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        repoPath={repoPath}
        tags={tags}
        githubToken={githubToken}
        githubRemote={githubRemote}
        onCreated={load}
      />

      <DeleteTagDialog
        tag={tagToDelete}
        onClose={() => setTagToDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
