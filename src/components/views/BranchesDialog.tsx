import { lazy, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

// Lazy load the BranchesView content
const BranchesView = lazy(() => 
  import("./BranchesView").then(m => ({ default: m.BranchesView }))
);

interface BranchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BranchesDialog({ open, onOpenChange }: BranchesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Branch Management</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Suspense 
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <BranchesView />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
