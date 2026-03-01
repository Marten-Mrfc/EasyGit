import { memo } from "react";
import { RefreshCw, GitBranch, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ChangesViewHeaderProps {
  currentBranch: string | null;
  stagedCount: number;
  isLoadingStatus: boolean;
  onPull: () => void;
  onPush: () => void;
  onRefresh: () => void;
  isPushing: boolean;
}

export const ChangesViewHeader = memo(function ChangesViewHeader({
  currentBranch,
  stagedCount,
  isLoadingStatus,
  onPull,
  onPush,
  onRefresh,
  isPushing,
}: ChangesViewHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/50 shrink-0">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-1">
        <GitBranch size={14} />
        <span className="font-mono font-medium text-foreground truncate max-w-48">
          {currentBranch || "—"}
        </span>
        {stagedCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
            {stagedCount} staged
          </Badge>
        )}
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
