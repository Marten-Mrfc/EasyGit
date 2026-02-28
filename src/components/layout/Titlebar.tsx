import { Minus, Moon, Square, Sun, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const appWindow = getCurrentWindow();

function WindowButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          className={`h-10 w-12 rounded-none ${
            destructive
              ? "hover:bg-destructive hover:text-destructive-foreground"
              : "hover:bg-accent"
          }`}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Titlebar() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header
      className="h-10 flex items-center justify-between bg-sidebar border-b border-border select-none shrink-0"
      data-tauri-drag-region
    >
      {/* Left: app name — drag region */}
      <div
        className="flex items-center gap-2 px-3 flex-1 h-full"
        data-tauri-drag-region
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-primary shrink-0"
          aria-hidden
        >
          <circle cx="4" cy="4" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="4" r="2" fill="currentColor" />
          <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="text-sm font-medium text-foreground">EasyGit</span>
      </div>

      {/* Right: theme toggle + window controls — NOT drag region */}
      <div className="flex items-center h-full">
        <WindowButton
          label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </WindowButton>
        <WindowButton label="Minimize" onClick={() => appWindow.minimize()}>
          <Minus size={14} />
        </WindowButton>
        <WindowButton label="Maximize" onClick={() => appWindow.toggleMaximize()}>
          <Square size={12} />
        </WindowButton>
        <WindowButton label="Close" onClick={() => appWindow.close()} destructive>
          <X size={14} />
        </WindowButton>
      </div>
    </header>
  );
}
