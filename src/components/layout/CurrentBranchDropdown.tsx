import { useState, useCallback } from "react";
import { GitBranch, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BranchDropdownContent } from "./BranchDropdownContent";

interface CurrentBranchDropdownProps {
  currentBranch: string | null;
  stagedCount: number;
  onBranchChange?: (branch: string) => void;
  onManageBranches?: () => void;
  onManageWorktrees?: () => void;
}

export function CurrentBranchDropdown({
  currentBranch,
  stagedCount,
  onBranchChange,
  onManageBranches,
  onManageWorktrees,
}: CurrentBranchDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleBranchSelect = useCallback(
    (branch: string) => {
      onBranchChange?.(branch);
      setOpen(false);
    },
    [onBranchChange]
  );

  const handleError = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-sm font-mono font-medium"
        >
          <GitBranch size={14} />
          <span className="truncate max-w-48">{currentBranch || "—"}</span>
          {stagedCount > 0 && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 text-[10px] font-mono ml-1"
            >
              {stagedCount}
            </Badge>
          )}
          <ChevronDown size={14} className="ml-0.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" side="bottom" align="start">
        <BranchDropdownContent
          onSelectBranch={handleBranchSelect}
          onManageBranches={onManageBranches}
          onManageWorktrees={onManageWorktrees}
          onError={handleError}
        />
      </PopoverContent>
    </Popover>
  );
}
