import { Suspense, lazy } from "react";
import { ResizablePanel } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import type { FileStatus } from "@/lib/git";

// Lazy load heavy components
const ConventionalCommitBuilder = lazy(() =>
  import("@/components/commit/ConventionalCommitBuilder").then((mod) => ({
    default: mod.ConventionalCommitBuilder,
  }))
);

const DiffPanel = lazy(() =>
  import("@/components/diff/DiffPanel").then((mod) => ({
    default: mod.DiffPanel,
  }))
);

function DiffPanelSkeleton() {
  return (
    <div className="h-full p-4 space-y-3">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function CommitBuilderSkeleton() {
  return (
    <div className="h-full p-4 space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

interface DiffOrCommitPanelProps {
  repoPath: string;
  diffFile: FileStatus | null;
  diffStaged: boolean;
  hasStaged: boolean;
  onCommitSuccess: () => void;
}

export function DiffOrCommitPanel({
  repoPath,
  diffFile,
  diffStaged,
  hasStaged,
  onCommitSuccess,
}: DiffOrCommitPanelProps) {
  return (
    <ResizablePanel defaultSize={62} minSize={30}>
      <div className="h-full overflow-hidden border-l border-border">
        {diffFile ? (
          <Suspense fallback={<DiffPanelSkeleton />}>
            <DiffPanel
              repoPath={repoPath}
              filePath={diffFile.path}
              staged={diffStaged}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<CommitBuilderSkeleton />}>
            <ConventionalCommitBuilder
              repoPath={repoPath}
              hasStaged={hasStaged}
              onCommitSuccess={onCommitSuccess}
            />
          </Suspense>
        )}
      </div>
    </ResizablePanel>
  );
}
