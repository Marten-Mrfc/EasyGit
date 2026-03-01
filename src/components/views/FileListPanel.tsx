import { Suspense, lazy, memo } from "react";
import { ResizablePanel } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import type { FileStatus } from "@/lib/git";

// Lazy load FileChecklist for better performance
const FileChecklist = lazy(() =>
  import("@/components/commit/FileChecklist").then((mod) => ({
    default: mod.FileChecklist,
  }))
);

function FileChecklistSkeleton() {
  return (
    <div className="h-full p-4 space-y-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

interface FileListPanelProps {
  repoPath: string;
  status: FileStatus[];
  onViewDiff: (file: FileStatus, staged: boolean) => void;
  onRefresh: () => Promise<void>;
  onCloseDiff?: () => void;
}

export const FileListPanel = memo(function FileListPanel({
  repoPath,
  status,
  onViewDiff,
  onRefresh,
  onCloseDiff,
}: FileListPanelProps) {
  return (
    <ResizablePanel defaultSize={38} minSize={24} className="min-h-0">
      <div className="h-full min-h-0 overflow-hidden flex flex-col">
        {status.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-4">
            No changes
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<FileChecklistSkeleton />}>
              <FileChecklist
                files={status}
                repoPath={repoPath}
                onRefresh={onRefresh}
                onViewDiff={onViewDiff}
                onCloseDiff={onCloseDiff}
              />
            </Suspense>
          </div>
        )}
      </div>
    </ResizablePanel>
  );
});
