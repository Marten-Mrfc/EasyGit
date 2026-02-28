import "./App.css";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { OpenRepoView } from "@/components/views/OpenRepoView";
import { ChangesView } from "@/components/views/ChangesView";
import { BranchesView } from "@/components/views/BranchesView";
import { WorktreeView } from "@/components/views/WorktreeView";
import { StashView } from "@/components/views/StashView";
import { HistoryView } from "@/components/views/HistoryView";
import { SettingsView } from "@/components/views/SettingsView";
import { ReleasesView } from "@/components/views/ReleasesView";
import { PlaceholderView } from "@/components/views/PlaceholderView";
import { useRepoStore } from "@/store/repoStore";
import { useAuthStore } from "@/store/authStore";
import type { View } from "@/components/layout/Sidebar";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ViewRouter({ view }: { view: View }) {
  const repoPath = useRepoStore((s) => s.repoPath);

  if (view === "settings") return <SettingsView />;
  if (!repoPath) return <OpenRepoView />;

  switch (view) {
    case "changes":
      return <ChangesView />;
    case "branches":
      return <BranchesView />;
    case "worktree":
      return <WorktreeView />;
    case "history":
      return <HistoryView />;
    case "stash":
      return <StashView />;
    case "releases":
      return <ReleasesView />;
    default:
      return <PlaceholderView name={view} />;
  }
}

function AppContent() {
  const initAuth = useAuthStore((s) => s.initAuth);
  useEffect(() => { initAuth(); }, [initAuth]);

  return (
    <AppShell>
      {(view) => <ViewRouter view={view} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

