import { lazy, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

// Lazy load the WorktreeView content
const WorktreeView = lazy(() => 
  import("./WorktreeView").then(m => ({ default: m.WorktreeView }))
);

interface WorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorktreeDialog({ open, onOpenChange }: WorktreeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Worktree Management</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Suspense 
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <WorktreeView />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
