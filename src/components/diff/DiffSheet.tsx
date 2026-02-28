import { useState, useEffect } from "react";
import { FileText, Loader2, GitCommitHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "./DiffViewer";
import { git, type CommitInfo, type BlameLine } from "@/lib/git";

interface DiffSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  filePath: string;
  staged: boolean;
}

export function DiffSheet({ open, onOpenChange, repoPath, filePath, staged }: DiffSheetProps) {
  const [diffText, setDiffText] = useState("");
  const [fileLog, setFileLog] = useState<CommitInfo[]>([]);
  const [blame, setBlame] = useState<BlameLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("diff");

  useEffect(() => {
    if (!open || !filePath) return;
    setLoading(true);
    setDiffText("");
    setFileLog([]);
    setBlame([]);
    setTab("diff");

    Promise.all([
      git.getDiff(repoPath, filePath, staged).catch(() => ""),
      git.getFileLog(repoPath, filePath).catch(() => [] as CommitInfo[]),
    ])
      .then(([d, log]) => {
        setDiffText(d);
        setFileLog(log);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [open, filePath, repoPath, staged]);

  function handleTabChange(value: string) {
    setTab(value);
    if (value === "blame" && blame.length === 0 && !loading) {
      git.getBlame(repoPath, filePath)
        .then(setBlame)
        .catch((e) => toast.error(String(e)));
    }
  }

  const fileName = filePath.replace(/\\/g, "/").split("/").slice(-1)[0] ?? filePath;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(90vw,900px)] sm:max-w-none flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm font-mono">
            <FileText size={14} className="text-muted-foreground shrink-0" />
            <span className="truncate">{filePath}</span>
            {staged && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0">staged</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 shrink-0 w-fit">
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="history">File History ({fileLog.length})</TabsTrigger>
            <TabsTrigger value="blame">Blame</TabsTrigger>
          </TabsList>

          {loading && (
            <div className="flex items-center justify-center flex-1">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && (
            <>
              <TabsContent value="diff" className="flex-1 overflow-hidden mt-0 p-4 pt-2">
                <DiffViewer diff={diffText} filePath={fileName} maxHeightClass="max-h-[calc(100vh-160px)]" />
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-[calc(100vh-160px)]">
                  {fileLog.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                      No commits found for this file
                    </div>
                  ) : (
                    <ul className="py-2">
                      {fileLog.map((c) => (
                        <li key={c.hash} className="flex items-start gap-3 px-4 py-2 hover:bg-muted/30 border-b border-border/40 last:border-0">
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

              <TabsContent value="blame" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-[calc(100vh-160px)]">
                  {blame.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                      {tab === "blame" ? "Loading blame…" : "Click Blame tab to load"}
                    </div>
                  ) : (
                    <table className="w-full text-xs font-mono">
                      <tbody>
                        {blame.map((bl) => (
                          <tr key={bl.line_number} className="hover:bg-muted/25 border-b border-border/20">
                            <td className="px-2 py-0.5 text-right text-muted-foreground/40 select-none w-10 shrink-0">
                              {bl.line_number}
                            </td>
                            <td className="px-2 py-0.5 text-blue-400/70 whitespace-nowrap w-20 shrink-0">
                              {bl.hash}
                            </td>
                            <td className="px-2 py-0.5 text-muted-foreground whitespace-nowrap w-28 shrink-0 truncate max-w-28">
                              {bl.author}
                            </td>
                            <td className="px-2 py-0.5 text-muted-foreground/60 whitespace-nowrap w-24 shrink-0">
                              {bl.date}
                            </td>
                            <td className="px-2 py-0.5 text-foreground/80 break-all whitespace-pre">
                              {bl.content}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ScrollArea>
              </TabsContent>
            </>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
