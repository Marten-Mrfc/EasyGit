import { useState, useEffect } from "react";
import {
  Archive,
  ChevronsUpDown,
  FolderGit2,
  FolderOpen,
  History,
  ListTree,
  Settings,
  Tag,
  X,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/repoStore";
import { git } from "@/lib/git";

export type View =
  | "changes"
  | "branches"
  | "worktree"
  | "history"
  | "stash"
  | "releases"
  | "settings";

interface NavItem {
  id: View;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "changes", label: "Changes", icon: ListTree },
  { id: "history", label: "History", icon: History },
  { id: "stash", label: "Stash", icon: Archive },
  { id: "releases", label: "Releases", icon: Tag },
];

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (view: View) => void;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onNavigate(item.id)}
          className={cn(
            "w-full justify-start gap-3 px-3 font-normal",
            active && "font-medium"
          )}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={16} className="shrink-0" />
          {item.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const { repoPath, recentRepos, setRepoPath, clearRepo, setWorktrees } =
    useRepoStore();
  const [repoPopoverOpen, setRepoPopoverOpen] = useState(false);
  const [repoName, setRepoName] = useState<string | null>(null);
  
  // Load worktrees and fetch GitHub repo name
  useEffect(() => {
    if (!repoPath) {
      setRepoName(null);
      return;
    }
    
    // Load worktrees
    git.listWorktrees(repoPath)
      .then(setWorktrees)
      .catch(() => {
        setWorktrees([]);
      });
    
    // Try to get repo name from remote URL (GitHub)
    git.getRemotes(repoPath)
      .then((remotes) => {
        // Find origin or first remote
        const remote = remotes.find((r) => r.name === "origin") || remotes[0];
        
        if (remote) {
          // Parse GitHub repo name from URL
          // Supports: git@github.com:user/repo.git, https://github.com/user/repo.git, etc.
          const match = remote.url.match(/[:/]([^/]+)\/([^/]+?)(\.git)?$/);
          if (match) {
            setRepoName(match[2]); // Extract repo name
            return;
          }
        }
        
        // Fallback to folder name
        setRepoName(repoPath.replace(/\\/g, "/").split("/").filter(Boolean).slice(-1)[0] ?? "");
      })
      .catch(() => {
        // Fallback to folder name
        setRepoName(repoPath.replace(/\\/g, "/").split("/").filter(Boolean).slice(-1)[0] ?? "");
      });
  }, [repoPath, setWorktrees]);
  
  function basename(p: string) {
    return p.replace(/\\/g, "/").split("/").filter(Boolean).slice(-1)[0] ?? p;
  }

  async function openDifferentRepo() {
    try {
      const path = await openDialog({
        directory: true,
        multiple: false,
        title: "Open Git Repository",
      });
      if (path) {
        setRepoPath(path as string);
        setRepoPopoverOpen(false);
      }
    } catch {
      /* dialog cancelled */
    }
  }

  return (
    <aside className="w-52 bg-sidebar border-r border-border flex flex-col shrink-0">
      {/* Repo switcher header */}
      {repoPath ? (
        <Popover open={repoPopoverOpen} onOpenChange={setRepoPopoverOpen}>
          <PopoverTrigger asChild>
            <button className="w-full px-3 py-2 border-b border-border shrink-0 text-left hover:bg-muted/30 transition-colors focus:outline-none">
              <div className="flex items-center gap-1.5">
                <FolderGit2 size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs font-medium truncate flex-1">
                  {repoName}
                </span>
                <ChevronsUpDown
                  size={11}
                  className="text-muted-foreground shrink-0 opacity-60"
                />
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-0"
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={12}
          >
            <div className="p-2 border-b border-border">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">
                Switch Repository
              </p>
            </div>
            <ScrollArea className="max-h-[min(18rem,calc(100vh-14rem))]">
              <div className="p-1">
                {recentRepos.map((repo) => (
                  <button
                    key={repo}
                    onClick={() => {
                      setRepoPath(repo);
                      setRepoPopoverOpen(false);
                    }}
                    className={cn(
                      "w-full text-left flex flex-col px-2 py-1.5 rounded-sm hover:bg-muted transition-colors text-xs",
                      repo === repoPath && "bg-muted/70"
                    )}
                  >
                    <span className="font-medium truncate">{basename(repo)}</span>
                    <span className="text-muted-foreground truncate text-[10px]">
                      {repo}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="p-1 border-t border-border space-y-0.5">
              <button
                onClick={openDifferentRepo}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
              >
                <FolderOpen size={13} />
                Open different repository…
              </button>
              <button
                onClick={() => {
                  clearRepo();
                  setRepoPopoverOpen(false);
                }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
                Close repository
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <ScrollArea className="flex-1 overflow-hidden">
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={activeView === item.id}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>

      <div className="px-2 pb-2">
        <Separator className="mb-2" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeView === "settings" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onNavigate("settings")}
              className={cn(
                "w-full justify-start gap-3 px-3 font-normal",
                activeView === "settings" && "font-medium"
              )}
              aria-current={activeView === "settings" ? "page" : undefined}
            >
              <Settings size={16} className="shrink-0" />
              Settings
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
