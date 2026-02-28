import { useState } from "react";
import { CheckSquare, Square, MinusSquare, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { git, type FileStatus } from "@/lib/git";

interface FileChecklistProps {
  files: FileStatus[];
  repoPath: string;
  onRefresh: () => Promise<void>;
  onViewDiff?: (file: FileStatus, staged: boolean) => void;
}

// Colour-coded status badge
const STATUS_STYLE: Record<string, string> = {
  M: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  A: "bg-green-500/15 text-green-400 border-green-500/30",
  D: "bg-red-500/15 text-red-400 border-red-500/30",
  R: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  C: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "?": "bg-muted text-muted-foreground",
  U: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

function FileRow({
  file,
  repoPath,
  onRefresh,
  onViewDiff,
  type,
}: {
  file: FileStatus;
  repoPath: string;
  onRefresh: () => Promise<void>;
  onViewDiff?: (file: FileStatus, staged: boolean) => void;
  type: "staged" | "unstaged";
}) {
  const [busy, setBusy] = useState(false);
  const status = type === "staged" ? file.staged_status : file.unstaged_status;
  const styleClass = STATUS_STYLE[status] ?? "bg-muted text-muted-foreground";

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (type === "unstaged") {
        await git.stageFiles(repoPath, [file.path]);
      } else {
        await git.unstageFiles(repoPath, [file.path]);
      }
      await onRefresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  const Icon = type === "staged" ? CheckSquare : Square;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-muted/50 group cursor-pointer select-none transition-colors",
        busy && "opacity-50 pointer-events-none"
      )}
      onClick={toggle}
    >
      <Icon
        size={15}
        className={cn(
          "shrink-0",
          type === "staged" ? "text-primary" : "text-muted-foreground"
        )}
      />
      <Badge
        variant="outline"
        className={cn("h-4 px-1 text-[10px] font-mono leading-none shrink-0", styleClass)}
      >
        {status || "·"}
      </Badge>
      <span className="text-xs text-foreground truncate flex-1 font-mono">
        {file.path}
      </span>
      {onViewDiff && (
        <button
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded"
          onClick={(e) => { e.stopPropagation(); onViewDiff(file, type === "staged"); }}
          title="View diff"
          aria-label="View diff"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  );
}

export function FileChecklist({ files, repoPath, onRefresh, onViewDiff }: FileChecklistProps) {
  const staged = files.filter((f) => f.is_staged);
  const unstaged = files.filter((f) => f.is_unstaged);

  async function stageAll() {
    try {
      await git.stageFiles(repoPath, unstaged.map((f) => f.path));
      await onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function unstageAll() {
    try {
      await git.unstageFiles(repoPath, staged.map((f) => f.path));
      await onRefresh();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <MinusSquare size={24} className="opacity-40" />
        <p className="text-sm">No changes</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {/* Staged section */}
        {staged.length > 0 && (
          <>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Staged ({staged.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={unstageAll}
              >
                Unstage All
              </Button>
            </div>
            {staged.map((f) => (
              <FileRow
                key={`staged-${f.path}`}
                file={f}
                repoPath={repoPath}
                onRefresh={onRefresh}
                onViewDiff={onViewDiff}
                type="staged"
              />
            ))}
          </>
        )}

        {staged.length > 0 && unstaged.length > 0 && (
          <Separator className="my-1.5 mx-3" />
        )}

        {/* Unstaged / Untracked section */}
        {unstaged.length > 0 && (
          <>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Changes ({unstaged.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={stageAll}
              >
                Stage All
              </Button>
            </div>
            {unstaged.map((f) => (
              <FileRow
                key={`unstaged-${f.path}`}
                file={f}
                repoPath={repoPath}
                onRefresh={onRefresh}
                onViewDiff={onViewDiff}
                type="unstaged"
              />
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
