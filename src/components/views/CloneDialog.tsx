import { useEffect, useRef, useState } from "react";
import { FolderOpen, GitBranch, Lock, Search } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { git } from "@/lib/git";
import { useAuthStore } from "@/store/authStore";
import { useGitHubRepos, type GitHubRepo } from "@/hooks/useGitHub";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloned: (repoPath: string) => void;
}

export function CloneDialog({ open, onOpenChange, onCloned }: CloneDialogProps) {
  const githubToken = useAuthStore((s) => s.githubToken);
  const { data: repos, isLoading: reposLoading } = useGitHubRepos();

  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [cloning, setCloning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  // Listen for streaming progress while cloning
  useEffect(() => {
    if (!cloning) return;
    let unlisten: (() => void) | undefined;
    listen<string>("clone-progress", (event) => {
      const line = event.payload;
      setLines((prev) => [...prev, line]);
      const m = line.match(/Receiving objects:\s+(\d+)%/);
      if (m) setProgress(parseInt(m[1], 10));
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [cloning]);

  function reset() {
    setUrl("");
    setDest("");
    setRepoSearch("");
    setLines([]);
    setProgress(null);
  }

  async function pickDest() {
    const path = await openFilePicker({ directory: true, title: "Choose destination folder" });
    if (path) setDest(path as string);
  }

  function selectGitHubRepo(repo: GitHubRepo) {
    setUrl(repo.clone_url);
    // Auto-suggest a dest subfolder name from the repo name
    setDest((prev) => {
      const parts = prev.replace(/\\/g, "/").split("/").filter(Boolean);
      // If dest looks like a folder (not ending in repo name), append the repo name
      if (parts.length > 0 && parts[parts.length - 1] !== repo.name) {
        return prev;
      }
      return prev;
    });
  }

  const canClone = url.trim().length > 0 && dest.trim().length > 0;

  async function handleClone() {
    if (!canClone) return;
    setCloning(true);
    setLines([]);
    setProgress(null);
    try {
      const clonedPath = await git.cloneRepo(url.trim(), dest.trim());
      toast.success("Repository cloned successfully");
      onCloned(clonedPath);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Clone failed: ${String(e)}`);
    } finally {
      setCloning(false);
      setProgress(null);
    }
  }

  const filteredRepos = repos?.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(repoSearch.toLowerCase())
  ) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!cloning) {
          reset();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={16} className="text-muted-foreground" />
            Clone Repository
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs defaultValue={githubToken ? "github" : "url"}>
            {githubToken && (
              <TabsList className="w-full h-8">
                <TabsTrigger value="github" className="flex-1 text-xs gap-1.5">
                  <GithubIcon size={12} />
                  GitHub
                </TabsTrigger>
                <TabsTrigger value="url" className="flex-1 text-xs">
                  URL
                </TabsTrigger>
              </TabsList>
            )}

            {/* GitHub repos browser */}
            {githubToken && (
              <TabsContent value="github" className="mt-3 space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Filter repositories…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <ScrollArea className="h-44 rounded-md border border-border">
                  {reposLoading ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-10">
                      Loading…
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-10">
                      No repositories found
                    </div>
                  ) : (
                    <ul className="p-1">
                      {filteredRepos.map((repo) => (
                        <li key={repo.id}>
                          <button
                            onClick={() => selectGitHubRepo(repo)}
                            className={cn(
                              "w-full text-left px-2.5 py-2 rounded-sm hover:bg-muted/60 transition-colors",
                              url === repo.clone_url && "bg-primary/10"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate flex-1">{repo.full_name}</span>
                              {repo.private && (
                                <Lock size={10} className="text-muted-foreground shrink-0" />
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {repo.description}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
                {url && (
                  <p className="text-[11px] text-muted-foreground font-mono truncate px-0.5">
                    {url}
                  </p>
                )}
              </TabsContent>
            )}

            {/* URL input */}
            <TabsContent value="url" className="mt-3 space-y-0">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Repository URL</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo.git"
                  className="font-mono text-sm h-8"
                  disabled={cloning}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Destination */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Clone into</Label>
            <div className="flex gap-2">
              <Input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder="C:\Projects\my-repo"
                className="font-mono text-sm h-8 flex-1"
                disabled={cloning}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 shrink-0"
                onClick={pickDest}
                disabled={cloning}
              >
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>

          {/* Progress area — only shown during / after clone attempt */}
          {(cloning || lines.length > 0) && (
            <div className="space-y-2">
              {progress !== null && (
                <Progress value={progress} className="h-1.5" />
              )}
              <div
                ref={logRef}
                className="h-28 rounded-md bg-muted/40 border border-border overflow-y-auto p-2 font-mono text-[11px] text-muted-foreground leading-relaxed"
              >
                {lines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {cloning && lines.length === 0 && (
                  <div className="text-muted-foreground/50">Cloning…</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={cloning}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleClone}
            disabled={!canClone || cloning}
            className="gap-1.5"
          >
            {cloning ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GithubIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}
