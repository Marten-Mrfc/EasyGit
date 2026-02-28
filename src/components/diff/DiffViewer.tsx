import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DiffLine {
  type: "added" | "removed" | "context" | "hunk" | "file";
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface Hunk {
  header: string;
  lines: DiffLine[];
}

interface FilePatch {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
}

function parseDiff(raw: string): FilePatch[] {
  const files: FilePatch[] = [];
  if (!raw.trim()) return files;

  let current: FilePatch | null = null;
  let currentHunk: Hunk | null = null;
  let oldNum = 0;
  let newNum = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("--- ")) {
      if (currentHunk && current) current.hunks.push(currentHunk);
      if (current) files.push(current);
      const oldFile = line.slice(4).replace(/^a\//, "");
      current = { oldFile, newFile: "", hunks: [] };
      currentHunk = null;
    } else if (line.startsWith("+++ ") && current) {
      current.newFile = line.slice(4).replace(/^b\//, "");
    } else if (line.startsWith("@@ ") && current) {
      if (currentHunk) current.hunks.push(currentHunk);
      // @@ -<old>,<count> +<new>,<count> @@ [context]
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldNum = m ? parseInt(m[1]) : 1;
      newNum = m ? parseInt(m[2]) : 1;
      currentHunk = { header: line, lines: [] };
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "added", content: line.slice(1), newNum: newNum++ });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "removed", content: line.slice(1), oldNum: oldNum++ });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : "",
          oldNum: oldNum++,
          newNum: newNum++,
        });
      }
    }
  }
  if (currentHunk && current) current.hunks.push(currentHunk);
  if (current) files.push(current);
  return files;
}

function LineNum({ n }: { n?: number }) {
  return (
    <span className="inline-block w-10 text-right pr-2 shrink-0 select-none text-[10px] text-muted-foreground/50 font-mono">
      {n !== undefined ? n : ""}
    </span>
  );
}

interface DiffViewerProps {
  /** Raw unified diff string returned by git diff */
  diff: string;
  filePath?: string;
  /** Max-height class for the scroll area, e.g. "max-h-96" */
  maxHeightClass?: string;
}

export function DiffViewer({ diff, filePath: _filePath, maxHeightClass = "max-h-[70vh]" }: DiffViewerProps) {
  const [blameMode] = useState(false);
  void blameMode; // reserved for future blame toggle

  const files = useMemo(() => parseDiff(diff), [diff]);

  if (!diff.trim()) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No diff available
      </div>
    );
  }

  return (
    <ScrollArea className={cn("w-full font-mono text-xs", maxHeightClass)}>
      {files.map((file, fi) => (
        <div key={fi} className="mb-1">
          {/* File header */}
          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted/80 backdrop-blur border-b border-border text-[11px] font-mono">
            <span className="text-muted-foreground truncate">{file.newFile || file.oldFile}</span>
          </div>

          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* Hunk header */}
              <div className="px-2 py-0.5 bg-blue-500/5 border-y border-blue-500/15 text-[10px] text-blue-400/70 font-mono select-none">
                {hunk.header}
              </div>

              {/* Diff lines */}
              {hunk.lines.map((dl, li) => (
                <div
                  key={li}
                  className={cn(
                    "flex items-start min-w-0 leading-5 border-l-2",
                    dl.type === "added" && "bg-green-500/10 border-l-green-500/50",
                    dl.type === "removed" && "bg-red-500/10 border-l-red-500/50",
                    dl.type === "context" && "border-l-transparent"
                  )}
                >
                  <LineNum n={dl.type !== "added" ? dl.oldNum : undefined} />
                  <LineNum n={dl.type !== "removed" ? dl.newNum : undefined} />
                  <span
                    className={cn(
                      "px-1 select-none shrink-0 w-3",
                      dl.type === "added" && "text-green-400",
                      dl.type === "removed" && "text-red-400",
                      dl.type === "context" && "text-muted-foreground/30"
                    )}
                  >
                    {dl.type === "added" ? "+" : dl.type === "removed" ? "−" : " "}
                  </span>
                  <span
                    className={cn(
                      "flex-1 min-w-0 break-all whitespace-pre-wrap",
                      dl.type === "added" && "text-green-100",
                      dl.type === "removed" && "text-red-200",
                      dl.type === "context" && "text-foreground/70"
                    )}
                  >
                    {dl.content}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </ScrollArea>
  );
}

// Thin "More info" row shown below the diff for file log access
export function DiffFileInfo({
  filePath,
  repoPath,
  onShowHistory,
}: {
  filePath: string;
  repoPath: string;
  onShowHistory: (filePath: string, repoPath: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => onShowHistory(filePath, repoPath)}
      >
        File History
      </Button>
    </div>
  );
}
