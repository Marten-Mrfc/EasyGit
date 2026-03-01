import { useEffect, useCallback, useState, useMemo } from "react";
import { History, RefreshCw, Loader2, GitCommitHorizontal, User, Calendar, AlignLeft, Columns2, Copy, Maximize2, Minimize2 } from "lucide-react";
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
  DialogClose,
} from "@/components/ui/dialog";
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
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitDiff, setCommitDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [mode, setMode] = useState<"unified" | "split">("unified");
  const [expanded, setExpanded] = useState(false);

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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(commitDiff).then(() => toast.success("Diff copied")).catch(() => {});
  }, [commitDiff]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "unified" ? "split" : "unified"));
  }, []);

  const stats = useMemo(() => {
    const files = parseDiff(commitDiff);
    return {
      files: files.length,
      added: files.reduce((sum, f) => sum + (f.additions || 0), 0),
      removed: files.reduce((sum, f) => sum + (f.deletions || 0), 0),
    };
  }, [commitDiff]);

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
        <span className="text-sm text-muted-foreground flex-1">
          Commit History
        </span>
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
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
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
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px] font-mono text-blue-400/80 border-blue-500/30 mr-1"
                      >
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

      {/* Commit diff dialog */}
      <Dialog open={!!selectedCommit} onOpenChange={(open: boolean) => { if (!open) setSelectedCommit(null); }}>
        <DialogContent showCloseButton={false} className={`${expanded ? "max-w-[98vw] w-[98vw] h-[98vh]" : "w-[50vw] max-w-[95vw] h-[65vh]"} flex flex-col p-0 gap-0 transition-all duration-200`}>
          <DialogHeader className="px-4 py-2.5 border-b border-border shrink-0">
            <DialogTitle className="text-sm font-mono flex items-center gap-2 min-w-0">
              <GitCommitHorizontal size={14} className="text-muted-foreground shrink-0" />
              <span className="text-blue-400/80 mr-1 shrink-0">{selectedCommit?.short_hash}</span>
              <span className="truncate text-foreground flex-1 min-w-0">{selectedCommit?.message}</span>
              {(stats.added > 0 || stats.removed > 0) && (
                <span className="flex items-center gap-1 text-[11px] font-mono shrink-0">
                  <span className="text-green-400">+{stats.added}</span>
                  <span className="text-red-400">-{stats.removed}</span>
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0 ml-2">
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
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded((v) => !v)}>
                      {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{expanded ? "Restore size" : "Maximize"}</TooltipContent>
                </Tooltip>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </Button>
                </DialogClose>
              </div>
            </DialogTitle>
            {selectedCommit && (
              <p className="text-xs text-muted-foreground font-mono">
                {selectedCommit.author} · {selectedCommit.date}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 pt-2">
            {diffLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DiffViewer diff={commitDiff} maxHeightClass="max-h-[calc(100vh-140px)]" mode={mode} onToggleMode={toggleMode} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
