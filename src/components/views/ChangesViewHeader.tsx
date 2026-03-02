import { memo } from "react";
import { RefreshCw, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrentBranchDropdown } from "@/components/layout/CurrentBranchDropdown";

interface ChangesViewHeaderProps {
  currentBranch: string | null;
  stagedCount: number;
  isLoadingStatus: boolean;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  isPushing: boolean;
  onBranchChange?: (branch: string) => void;
  onManageBranches?: () => void;
  onManageWorktrees?: () => void;
}

export const ChangesViewHeader = memo(function ChangesViewHeader({
  currentBranch,
  stagedCount,
  isLoadingStatus,
  onPull,
  onPush,
  onRefresh,
  isPushing,
  onBranchChange,
  onManageBranches,
  onManageWorktrees,
}: ChangesViewHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1">
        <CurrentBranchDropdown
          currentBranch={currentBranch}
          stagedCount={stagedCount}
          onBranchChange={onBranchChange}
          onManageBranches={onManageBranches}
          onManageWorktrees={onManageWorktrees}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPull}
        title="Pull"
      >
        <ArrowDown size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onPush}
        disabled={isPushing}
        title="Push"
      >
        {isPushing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ArrowUp size={14} />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onRefresh}
        disabled={isLoadingStatus}
        title="Refresh"
      >
        {isLoadingStatus ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
      </Button>
    </div>
  );
});
