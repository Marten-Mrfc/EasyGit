import "./App.css";
import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/AppShell";
// OpenRepoView and PlaceholderView are lightweight — keep them eager so the
// initial blank-repo screen appears without any loading flash.
import { OpenRepoView } from "@/components/views/OpenRepoView";
import { PlaceholderView } from "@/components/views/PlaceholderView";
import { useRepoStore } from "@/store/repoStore";
import { useAuthStore } from "@/store/authStore";
import type { View } from "@/components/layout/Sidebar";

// Lazy-load heavier views so their JS (and vendor chunks like diff2html) is
// only parsed when the user actually navigates to that section.
const ChangesView  = lazy(() => import("@/components/views/ChangesView").then(m => ({ default: m.ChangesView })));
const BranchesView = lazy(() => import("@/components/views/BranchesView").then(m => ({ default: m.BranchesView })));
const WorktreeView = lazy(() => import("@/components/views/WorktreeView").then(m => ({ default: m.WorktreeView })));
const StashView    = lazy(() => import("@/components/views/StashView").then(m => ({ default: m.StashView })));
const HistoryView  = lazy(() => import("@/components/views/HistoryView").then(m => ({ default: m.HistoryView })));
const SettingsView = lazy(() => import("@/components/views/SettingsView").then(m => ({ default: m.SettingsView })));
const ReleasesView = lazy(() => import("@/components/views/ReleasesView").then(m => ({ default: m.ReleasesView })));

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
      {(view) => (
        <Suspense fallback={null}>
          <ViewRouter view={view} />
        </Suspense>
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

