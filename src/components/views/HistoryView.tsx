import { useEffect, useCallback, useState } from "react";
import { History, RefreshCw, Loader2, GitCommitHorizontal, User, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useRepoStore } from "@/store/repoStore";
import { git, type CommitInfo } from "@/lib/git";

export function HistoryView() {
  const { repoPath } = useRepoStore();
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitDiff, setCommitDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);

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
      // Show diff: current commit vs parent
      const diff = await git.getDiff(repoPath!, `${c.hash}^..${c.hash}`, false).catch(async () => {
        // First commit has no parent — diff against empty tree
        return git.getDiff(repoPath!, c.hash, false);
      });
      setCommitDiff(diff);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDiffLoading(false);
    }
  }

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
                      {c.date}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Commit diff sheet */}
      <Sheet open={!!selectedCommit} onOpenChange={(open: boolean) => { if (!open) setSelectedCommit(null); }}>
        <SheetContent side="right" className="w-[min(90vw,900px)] sm:max-w-none flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="text-sm font-mono flex items-center gap-2">
              <GitCommitHorizontal size={14} className="text-muted-foreground" />
              <span className="text-blue-400/80 mr-1">{selectedCommit?.short_hash}</span>
              <span className="truncate text-foreground">{selectedCommit?.message}</span>
            </SheetTitle>
            {selectedCommit && (
              <p className="text-xs text-muted-foreground font-mono">
                {selectedCommit.author} · {selectedCommit.date}
              </p>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-auto p-4 pt-2">
            {diffLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DiffViewer diff={commitDiff} maxHeightClass="max-h-[calc(100vh-140px)]" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
