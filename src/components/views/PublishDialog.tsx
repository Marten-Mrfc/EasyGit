import { Suspense, lazy } from "react";

const PublishToGitHubDialog = lazy(() =>
  import("@/components/remote/PublishToGitHubDialog").then((mod) => ({
    default: mod.PublishToGitHubDialog,
  }))
);

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: (cloneUrl: string) => void;
}

export function PublishDialog({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
}: PublishDialogProps) {
  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <PublishToGitHubDialog
        open={open}
        onOpenChange={onOpenChange}
        repoPath={repoPath}
        onSuccess={onSuccess}
      />
    </Suspense>
  );
}
