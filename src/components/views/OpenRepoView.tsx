import { useState } from "react";
import { Download, FolderOpen, GitBranch, Clock, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CloneDialog } from "./CloneDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRepoStore } from "@/store/repoStore";

export function OpenRepoView() {
  const { setRepoPath, recentRepos, removeRecentRepo } = useRepoStore();
  const [cloneOpen, setCloneOpen] = useState(false);

  async function pickFolder() {
    try {
      const path = await open({ directory: true, multiple: false, title: "Open Git Repository" });
      if (path) {
        setRepoPath(path as string);
      }
    } catch {
      toast.error("Could not open folder picker.");
    }
  }

  function openRecent(path: string) {
    setRepoPath(path);
  }

  function basename(path: string) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {/* Hero card */}
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
              <GitBranch size={32} className="text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Open a Repository</CardTitle>
          <CardDescription>
            Select a local folder to start working with Git.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-2">
          <Button size="lg" className="w-full gap-2" onClick={pickFolder}>
            <FolderOpen size={18} />
            Browse for Folder
          </Button>
          <Button size="lg" variant="outline" className="w-full gap-2" onClick={() => setCloneOpen(true)}>
            <Download size={18} />
            Clone a Repository
          </Button>
        </CardContent>
        <CloneDialog
          open={cloneOpen}
          onOpenChange={setCloneOpen}
          onCloned={(p) => setRepoPath(p)}
        />
      </Card>

      {/* Recent repos */}
      {recentRepos.length > 0 && (
        <Card className="w-full max-w-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock size={14} />
              Recent Repositories
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Separator />
            <ScrollArea className="max-h-52">
              <ul className="py-1">
                {recentRepos.map((repo) => (
                  <li key={repo} className="flex items-center group">
                    <button
                      onClick={() => openRecent(repo)}
                      className="flex-1 flex flex-col items-start px-4 py-2 hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-sm font-medium">{basename(repo)}</span>
                      <span className="text-xs text-muted-foreground truncate w-full">{repo}</span>
                    </button>
                    <button
                      onClick={() => removeRecentRepo(repo)}
                      className="mr-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      aria-label="Remove from recent"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
