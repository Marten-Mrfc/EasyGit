import { useEffect, useState } from "react";
import { Titlebar } from "./Titlebar";
import { Sidebar, type View } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

interface AppShellProps {
  children?: (view: View) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activeView, setActiveView] = useState<View>("changes");
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={(view) => { setActiveView(view); setPaletteOpen(false); }}
      />
    </TooltipProvider>
  );
}
