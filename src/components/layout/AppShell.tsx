import { useEffect, useState, useRef } from "react";
import { Titlebar } from "./Titlebar";
import { Sidebar, type View } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NavigationContext } from "@/lib/navigationContext";

interface AppShellProps {
  children?: (view: View) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activeView, setActiveView] = useState<View>("changes");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    // Only register handler once (§4.1 deduplicate global event listeners)
    if (handlerRef.current) return;
    
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    
    handlerRef.current = handler;
    window.addEventListener("keydown", handler);
    
    return () => {
      window.removeEventListener("keydown", handler);
      handlerRef.current = null;
    };
  }, []);

  return (
    <NavigationContext.Provider value={{ navigate: setActiveView }}>
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
    </NavigationContext.Provider>
  );
}
