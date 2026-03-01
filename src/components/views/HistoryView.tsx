import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { History, RefreshCw, Loader2, GitCommitHorizontal, User, Calendar, AlignLeft, Columns2, Copy, Maximize2, Minimize2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { DiffViewer, parseDiff } from "@/components/diff/DiffViewer";
import { useRepoStore } from "@/store/repoStore";
import { git, type CommitInfo } from "@/lib/git";

function toRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  if (s < 2592000) return `${Math.floor(s / 604800)}w ago`;
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo ago`;
  return `${Math.floor(s / 31536000)}y ago`;
}

export function HistoryView() {
  const { repoPath } = useRepoStore();
  const fileListRef = useRef<HTMLDivElement>(null);

  // State declarations upfront (React hooks rule)
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitDiff, setCommitDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [fileListPanelWidth, setFileListPanelWidth] = useState(0);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const log = await git.getLog(repoPath, 200);
      setCommits(log);
    } catch (e) {
      toast.error(`Failed to load history: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openCommitDiff(c: CommitInfo) {
    setSelectedCommit(c);
    setCommitDiff("");
    setSelectedFile(null);
    setDiffLoading(true);
    try {
      const diff = await git.getCommitDiff(repoPath!, c.hash);
      setCommitDiff(diff);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDiffLoading(false);
    }
  }

  // Parse diff to extract files with stats
  const diffFiles = useMemo(() => {
    if (!commitDiff) return [];
    const files = parseDiff(commitDiff);
    return files.map((file) => {
      let additions = 0;
      let deletions = 0;
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.type === "added") additions++;
          if (line.type === "removed") deletions++;
        }
      }
      return {
        newFile: file.newFile,
        oldFile: file.oldFile,
        additions,
        deletions,
      };
    });
  }, [commitDiff]);

  // Close dialog on Escape key
  useEffect(() => {
    if (!selectedCommit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedCommit(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCommit]);

  // Measure file list panel width for dynamic path shortening
  useEffect(() => {
    const element = fileListRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      setFileListPanelWidth(element.clientWidth);
    });

    observer.observe(element);
    setFileListPanelWidth(element.clientWidth); // Set initial width

    return () => observer.disconnect();
  }, []);

  // Auto-select first file when diff loads
  useEffect(() => {
    if (diffFiles.length > 0 && selectedFile === null && !diffLoading) {
      setSelectedFile(diffFiles[0].newFile);
    }
  }, [diffFiles, selectedFile, diffLoading]);

  // Get the currently selected file's diff
  const selectedFileDiff = useMemo(() => {
    if (!selectedFile || !commitDiff) return "";
    const files = parseDiff(commitDiff);
    const file = files.find((f) => f.newFile === selectedFile);
    if (!file) return "";

    // Reconstruct the diff for just this file
    const result: string[] = [];
    result.push(`--- a/${file.oldFile}`);
    result.push(`+++ b/${file.newFile}`);
    for (const hunk of file.hunks) {
      result.push(hunk.header);
      for (const line of hunk.lines) {
        if (line.type === "added") {
          result.push("+" + line.content);
        } else if (line.type === "removed") {
          result.push("-" + line.content);
        } else if (line.type === "context") {
          result.push(" " + line.content);
        } else if (line.type === "collapsed-context") {
          result.push(" // ... " + line.count + " lines of context");
        }
      }
    }
    return result.join("\n");
  }, [selectedFile, commitDiff]);

  const stats = useMemo(() => {
    if (!selectedFileDiff) return { added: 0, removed: 0 };
    let added = 0;
    let removed = 0;
    for (const line of selectedFileDiff.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      else if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return { added, removed };
  }, [selectedFileDiff]);

  const handleCopy = useCallback(() => {
    if (selectedFileDiff) {
      navigator.clipboard.writeText(selectedFileDiff).then(() => toast.success("Diff copied")).catch(() => {});
    }
  }, [selectedFileDiff]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "unified" ? "split" : "unified"));
  }, []);

  // Helper function to intelligently shorten file paths based on available width
  const getDisplayPath = useCallback(
    (fullPath: string): string => {
      // Use actual panel width thresholds instead of character estimates
      // Account for padding (px-2.5 = 10px), gap, and stat badges
      const effectiveWidth = fileListPanelWidth - 60; // 10px padding left + 10px padding right + 40px for badges/gaps

      if (effectiveWidth < 0) {
        return fullPath.split("/")[fullPath.split("/").length - 1]; // Just filename
      }

      // If enough space, show full path
      if (effectiveWidth > 280) {
        return fullPath;
      }

      const parts = fullPath.split("/");

      // Try showing last 3 parts
      if (effectiveWidth > 180) {
        return parts.slice(-3).join("/");
      }

      // Try showing last 2 parts
      if (effectiveWidth > 100) {
        return parts.slice(-2).join("/");
      }

      // Just the filename
      return parts[parts.length - 1];
    },
    [fileListPanelWidth]
  );

  const filtered = commits.filter(
    (c) =>
      c.message.toLowerCase().includes(query.toLowerCase()) ||
      c.author.toLowerCase().includes(query.toLowerCase()) ||
      c.short_hash.includes(query)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
        <History size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Commit History</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <Input
          placeholder="Filter by message, author, or hash…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 text-sm"
        />
      </div>

      {/* Commit list */}
      <ScrollArea className="flex-1 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {commits.length === 0 ? "No commits found" : "No matches"}
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((c) => (
              <li
                key={c.hash}
                className="flex items-start gap-3 px-3 py-2.5 group hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0 cursor-pointer"
                onClick={() => openCommitDiff(c)}
              >
                <GitCommitHorizontal size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c.message}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-mono text-blue-400/80 border-blue-500/30 mr-1">
                        {c.short_hash}
                      </Badge>
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <User size={10} />
                      {c.author}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar size={10} />
                      <span title={c.date}>{toRelativeTime(c.date)}</span>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Modal Dialog with file/diff side-by-side */}
      <Dialog open={selectedCommit !== null} onOpenChange={(open) => !open && setSelectedCommit(null)}>
        <DialogContent className={`flex flex-col p-0 [&_button:last-of-type]:hidden ${fullscreenMode ? "max-w-[95vw] h-[95vh] w-full" : "max-w-6xl h-[80vh]"}`}>
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <GitCommitHorizontal size={16} className="text-muted-foreground shrink-0" />
                {selectedCommit && (
                  <>
                    <span className="text-blue-400/80 font-mono text-sm shrink-0">{selectedCommit.short_hash}</span>
                    <DialogTitle className="text-sm truncate flex-1">{selectedCommit.message}</DialogTitle>
                    {(stats.added > 0 || stats.removed > 0) && (
                      <span className="flex items-center gap-1 text-[11px] font-mono shrink-0">
                        <span className="text-green-400">+{stats.added}</span>
                        <span className="text-red-400">-{stats.removed}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={mode === "unified" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setMode("unified")}
                    >
                      <AlignLeft size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Unified view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={mode === "split" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setMode("split")}
                    >
                      <Columns2 size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Split view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                      <Copy size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy diff</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setFullscreenMode(!fullscreenMode)}
                    >
                      {fullscreenMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{fullscreenMode ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSelectedCommit(null)}
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
            {selectedCommit && (
              <p className="text-xs text-muted-foreground font-mono mt-2">
                {selectedCommit.author} · {selectedCommit.date}
              </p>
            )}
          </DialogHeader>

          {/* Dialog body with resizable file/diff panels */}
          <div className="flex-1 overflow-hidden flex">
            {diffLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResizablePanelGroup className="w-full h-full">
                {/* Left panel: File list */}
                <ResizablePanel defaultSize={35} minSize={20}>
                  <div ref={fileListRef} className="h-full w-full">
                    <ScrollArea className="h-full">
                      {diffFiles.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                          No files changed
                        </div>
                      ) : (
                        <ul className="py-1">
                          {diffFiles.map((file, index) => (
                            <li
                              key={`${file.newFile}-${index}`}
                              onClick={() => setSelectedFile(file.newFile)}
                              className={`px-2.5 py-1.5 border-b border-border/40 last:border-0 cursor-pointer transition-colors ${
                                selectedFile === file.newFile
                                  ? "bg-muted text-foreground font-medium"
                                  : "hover:bg-muted/50 text-muted-foreground"
                              }`}
                              title={file.newFile}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate flex-1 text-xs font-mono">
                                  {getDisplayPath(file.newFile)}
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {(file.additions || 0) > 0 && (
                                    <span className="text-[10px] text-green-400 font-mono">
                                      +{file.additions}
                                    </span>
                                  )}
                                  {(file.deletions || 0) > 0 && (
                                    <span className="text-[10px] text-red-400 font-mono">
                                      -{file.deletions}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </ScrollArea>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle onPointerDown={(e) => e.stopPropagation()} />

                {/* Right panel: Diff viewer */}
                <ResizablePanel defaultSize={65} minSize={30}>
                  {selectedFile ? (
                    <div className="h-full overflow-auto p-4">
                      <DiffViewer diff={selectedFileDiff} maxHeightClass="h-full" mode={mode} onToggleMode={toggleMode} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Select a file to view changes
                    </div>
                  )}
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
