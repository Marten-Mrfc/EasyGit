import { Construction } from "lucide-react";

interface PlaceholderViewProps {
  name: string;
}

export function PlaceholderView({ name }: PlaceholderViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <Construction size={28} className="opacity-40" />
      <div className="text-center">
        <p className="text-sm font-medium capitalize">{name}</p>
        <p className="text-xs opacity-60">Coming in Phase 3</p>
      </div>
    </div>
  );
}
