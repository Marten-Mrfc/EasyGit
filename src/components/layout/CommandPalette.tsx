import {
  Archive,
  Download,
  FolderGit2,
  GitBranch,
  History,
  LayoutDashboard,
  ListTree,
  RefreshCw,
  Settings,
  Tag,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { git } from "@/lib/git";
import { useRepoStore } from "@/store/repoStore";
import type { View } from "./Sidebar";

const NAV_COMMANDS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "changes",  label: "Go to Changes",  icon: ListTree },
  { id: "branches", label: "Go to Branches", icon: GitBranch },
  { id: "worktree", label: "Go to Worktree", icon: LayoutDashboard },
  { id: "history",  label: "Go to History",  icon: History },
  { id: "stash",    label: "Go to Stash",    icon: Archive },
  { id: "releases", label: "Go to Releases", icon: Tag },
  { id: "settings", label: "Go to Settings", icon: Settings },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: View) => void;
}

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const repoPath    = useRepoStore((s) => s.repoPath);
  const recentRepos = useRepoStore((s) => s.recentRepos);
  const setRepoPath = useRepoStore((s) => s.setRepoPath);

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  async function fetchRepo() {
    if (!repoPath) return;
    try {
      await git.fetch(repoPath);
      toast.success("Fetched successfully");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function pullRepo() {
    if (!repoPath) return;
    try {
      await git.pull(repoPath);
      toast.success("Pull complete");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function pushRepo() {
    if (!repoPath) return;
    try {
      await git.push(repoPath);
      toast.success("Push complete");
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_COMMANDS.map(({ id, label, icon: Icon }) => (
            <CommandItem key={id} onSelect={() => run(() => onNavigate(id))}>
              <Icon />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {repoPath && (
          <CommandGroup heading="Git Actions">
            <CommandItem onSelect={() => run(fetchRepo)}>
              <RefreshCw />
              <span>Fetch</span>
            </CommandItem>
            <CommandItem onSelect={() => run(pullRepo)}>
              <Download />
              <span>Pull</span>
            </CommandItem>
            <CommandItem onSelect={() => run(pushRepo)}>
              <Upload />
              <span>Push</span>
            </CommandItem>
          </CommandGroup>
        )}

        {recentRepos.length > 0 && (
          <CommandGroup heading="Recent Repositories">
            {recentRepos.map((repo) => (
              <CommandItem
                key={repo}
                onSelect={() => run(() => { setRepoPath(repo); onNavigate("changes"); })}
              >
                <FolderGit2 />
                <span className="truncate">{repo}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
