import { memo } from "react";
import { type ThemedToken } from "shiki";
import { type DiffLine } from "./types";

// ---------------------------------------------------------------------------
// Memoized sub-components — React.memo prevents re-render unless own props change
// ---------------------------------------------------------------------------

export const LineNum = memo(function LineNum({ n }: { n?: number }) {
  return (
    <span className="inline-block w-10 shrink-0 text-right pr-2 select-none text-[10px] text-muted-foreground/50 font-mono">
      {n ?? ""}
    </span>
  );
});

export const ContextLineRow = memo(function ContextLineRow({
  line,
  tokens,
}: {
  line: DiffLine;
  tokens: ThemedToken[] | undefined;
}) {
  return (
    <div className="flex items-start min-w-0 leading-5 border-l-2 border-l-transparent">
      <LineNum n={line.oldNum} />
      <LineNum n={line.newNum} />
      <span className="px-1 select-none shrink-0 w-3 text-muted-foreground/30"> </span>
      <span className="flex-1 min-w-0 break-all whitespace-pre-wrap text-foreground/60">
        {tokens
          ? tokens.map((tok, ti) => (
              <span key={ti} style={tok.color ? { color: tok.color, opacity: 0.75 } : undefined}>
                {tok.content}
              </span>
            ))
          : line.content}
      </span>
    </div>
  );
});

export function hunkContextHint(header: string): string {
  const m = header.match(/@@ [^@]+ @@(.*)/);
  return (m?.[1] ?? "").trim();
}
