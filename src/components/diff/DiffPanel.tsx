import { useMemo, useState, useEffect, useCallback } from "react";
// Direct icon imports — avoids loading the entire lucide barrel (AGENTS.md §2.1)
import { AlignLeft, Columns2, Copy, FileText, GitCommitHorizontal, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiffViewer, parseDiff } from "./DiffViewer";
import { useFileTokens } from "./highlight";
import { git, type CommitInfo, type BlameLine } from "@/lib/git";

const GROUP_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f97316", "#6366f1",
];

interface DiffPanelProps {
  repoPath: string;
  filePath: string;
  staged: boolean;
}

/**
 * Embedded diff panel for side-by-side display in ChangesView.
 * Same functionality as DiffSheet but renders as an inline panel (not a modal).
 */
export function DiffPanel({ repoPath, filePath, staged }: DiffPanelProps) {
  const [diffText, setDiffText] = useState("");
  const [fileLog, setFileLog] = useState<CommitInfo[]>([]);
  const [blame, setBlame] = useState<BlameLine[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("diff");
  const [mode, setMode] = useState<"unified" | "split">("unified");

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setDiffText("");
    setFileLog([]);
    setBlame([]);
    setFileContent(null);
    setTab("diff");

    // Start all three fetches in parallel (AGENTS.md §1.4).
    // fileContent is needed immediately for inter-hunk gap expansion so we
    // prefetch it alongside the diff rather than waiting for a tab switch.
    Promise.all([
      git.getDiff(repoPath, filePath, staged).catch(() => ""),
      git.getFileLog(repoPath, filePath).catch(() => [] as CommitInfo[]),
      git.getFileContent(repoPath, filePath).catch(() => null),
    ])
      .then(([d, log, content]) => {
        setDiffText(d);
        setFileLog(log);
        setFileContent(content);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [filePath, repoPath, staged]);

  const handleTabChange = useCallback((value: string) => {
    setTab(value);
    if (value === "blame" && blame.length === 0 && !loading) {
      git.getBlame(repoPath, filePath)
        .then(setBlame)
        .catch((e) => toast.error(String(e)));
    }
    if (value === "file" && fileContent === null && !loading) {
      git.getFileContent(repoPath, filePath)
        .then(setFileContent)
        .catch((e) => toast.error(String(e)));
    }
  }, [blame.length, fileContent, loading, repoPath, filePath]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(diffText).then(() => toast.success("Diff copied")).catch(() => {});
  }, [diffText]);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "unified" ? "split" : "unified"));
  }, []);

  // Derived stats — calculated during rendering from existing data (AGENTS.md §5.1)
  const stats = useMemo(() => {
    const files = parseDiff(diffText);
    let added = 0, removed = 0;
    for (const f of files)
      for (const h of f.hunks)
        for (const l of h.lines) {
          if (l.type === "added") added++;
          else if (l.type === "removed") removed++;
        }
    return { added, removed };
  }, [diffText]);

  const blameGroups = useMemo(() => {
    if (!blame.length) return [];
    const groups: { hash: string; lines: BlameLine[]; color: string }[] = [];
    let colorIdx = 0;
    const hashColors = new Map<string, string>();
    for (const bl of blame) {
      const prev = groups[groups.length - 1];
      if (prev && prev.hash === bl.hash) {
        prev.lines.push(bl);
      } else {
        if (!hashColors.has(bl.hash)) {
          hashColors.set(bl.hash, GROUP_COLORS[colorIdx % GROUP_COLORS.length]);
          colorIdx++;
        }
        groups.push({ hash: bl.hash, lines: [bl], color: hashColors.get(bl.hash)! });
      }
    }
    return groups;
  }, [blame]);

  const fileName = filePath.replace(/\\/g, "/").split("/").slice(-1)[0] ?? filePath;

  // Stable array reference — only re-splits when fileContent actually changes.
  // Passed to DiffViewer so inter-hunk gaps can be expanded without a round-trip.
  const fileLines = useMemo(() => fileContent?.split("\n") ?? null, [fileContent]);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const fileTokens = useFileTokens(fileContent, fileName, isDark);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-mono min-w-0">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <span className="truncate flex-1 min-w-0">{filePath}</span>
          {staged && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0">
              staged
            </Badge>
          )}
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
          </div>
        </div>
      </div>

      {/* Content tabs */}
      <Tabs value={tab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <TabsList className="mx-4 mt-2 shrink-0 w-fit">
          <TabsTrigger value="diff">Diff</TabsTrigger>
          <TabsTrigger value="file">Full File</TabsTrigger>
          <TabsTrigger value="history">History ({fileLog.length})</TabsTrigger>
          <TabsTrigger value="blame">Blame</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Diff tab — takes full remaining height; DiffViewer virtualizes the lines */}
            <TabsContent value="diff" className="flex-1 overflow-hidden mt-0 p-3 pt-2 min-h-0">
              <DiffViewer
                diff={diffText}
                filePath={fileName}
                maxHeightClass="h-full"
                mode={mode}
                onToggleMode={toggleMode}
                fileLines={fileLines}
              />
            </TabsContent>

            <TabsContent value="file" className="flex-1 overflow-hidden mt-0 min-h-0">
              <ScrollArea className="h-full">
                {fileContent === null ? (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : (
                  <table className="w-full font-mono text-xs">
                    <tbody>
                      {fileContent.split("\n").map((line, i) => (
                        <tr key={i} className="hover:bg-muted/20 border-b border-border/10">
                          <td className="text-right pr-3 pl-2 select-none w-10 shrink-0 text-muted-foreground/40 leading-5">
                            {i + 1}
                          </td>
                          <td className="px-2 py-0 whitespace-pre leading-5">
                            {fileTokens[i]
                              ? fileTokens[i].map((tok, ti) => (
                                  <span key={ti} style={tok.color ? { color: tok.color } : undefined}>
                                    {tok.content}
                                  </span>
                                ))
                              : <span className="text-foreground/80">{line || "\u00A0"}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-hidden mt-0 min-h-0">
              <ScrollArea className="h-full">
                {fileLog.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                    No commits found for this file
                  </div>
                ) : (
                  <ul className="py-2">
                    {fileLog.map((c) => (
                      <li
                        key={c.hash}
                        className="flex items-start gap-3 px-4 py-2 hover:bg-muted/30 border-b border-border/40 last:border-0"
                      >
                        <GitCommitHorizontal size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{c.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {c.short_hash} · {c.author} · {c.date}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="blame" className="flex-1 overflow-hidden mt-0 min-h-0">
              <ScrollArea className="h-full">
                {blameGroups.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                    {tab === "blame" ? "Loading blame…" : "Click Blame tab to load"}
                  </div>
                ) : (
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      {blameGroups.map((group) =>
                        group.lines.map((bl, gi) => (
                          <tr key={bl.line_number} className="hover:bg-muted/25 border-b border-border/20">
                            <td
                              className="w-1 p-0"
                              style={{ backgroundColor: group.color, opacity: gi === 0 ? 1 : 0.3 }}
                            />
                            <td className="px-2 py-0.5 text-right text-muted-foreground/40 select-none w-10 shrink-0">
                              {bl.line_number}
                            </td>
                            {gi === 0 ? (
                              <>
                                <td className="px-2 py-0.5 text-blue-400/70 whitespace-nowrap w-20 shrink-0">
                                  {bl.hash}
                                </td>
                                <td className="px-2 py-0.5 text-muted-foreground whitespace-nowrap w-28 shrink-0 truncate max-w-28">
                                  {bl.author}
                                </td>
                                <td className="px-2 py-0.5 text-muted-foreground/60 whitespace-nowrap w-24 shrink-0">
                                  {bl.date}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-2 py-0.5 w-20 shrink-0" />
                                <td className="px-2 py-0.5 w-28 shrink-0" />
                                <td className="px-2 py-0.5 w-24 shrink-0" />
                              </>
                            )}
                            <td className="px-2 py-0.5 text-foreground/80 break-all whitespace-pre">
                              {bl.content}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
