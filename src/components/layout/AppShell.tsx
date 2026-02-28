import { useState } from "react";
import { Titlebar } from "./Titlebar";
import { Sidebar, type View } from "./Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

interface AppShellProps {
  children?: (view: View) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activeView, setActiveView] = useState<View>("changes");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
        <Titlebar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={activeView} onNavigate={setActiveView} />
          <main className="flex-1 overflow-auto">
            {children ? children(activeView) : null}
          </main>
        </div>
      </div>
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}
