import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useTheme } from "next-themes";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { type DiffLine, type FlatItem, ITEM_HEIGHT } from "./types";
import { parseDiff } from "./parser";
import { type Segment, computeInlineDiff, renderWordDiff } from "./wordDiff";
import { type RenderedSpan, composeSyntaxAndWordDiff, useSyntaxTokens } from "./highlight";
import { type SplitRow, toSplitRows } from "./splitView";
import { LineNum, ContextLineRow, hunkContextHint } from "./DiffLines";

export type { DiffLine, Hunk, FilePatch } from "./types";
export { parseDiff } from "./parser";

// ---------------------------------------------------------------------------
// Inter-hunk gap helper
// ---------------------------------------------------------------------------

/** Extract the new-file range from a unified-diff hunk header (@@ -o,c +n,c @@). */
function parseHunkNewRange(header: string): { start: number; count: number } {
  const m = header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!m) return { start: 1, count: 0 };
  return { start: parseInt(m[1]), count: m[2] !== undefined ? parseInt(m[2]) : 1 };
}

// ---------------------------------------------------------------------------
// DiffViewer component
// ---------------------------------------------------------------------------

interface DiffViewerProps {
  diff: string;
  filePath?: string;
  /** Tailwind class controlling the scroll-container height, e.g. "h-[70vh]" */
  maxHeightClass?: string;
  mode?: "unified" | "split";
  onToggleMode?: () => void;
  /**
   * Full file lines (new-file side). When provided, the gap between any two
   * consecutive hunks becomes a toggleable "N lines not in diff" button so the
   * user can read the full context between distant changes.
   */
  fileLines?: string[] | null;
}

export function DiffViewer({
  diff,
  filePath: _filePath,
  maxHeightClass = "h-[70vh]",
  mode = "unified",
  onToggleMode,
  fileLines = null,
}: DiffViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  // ── Parse diff + compute word-diff pairs ──────────────────────────────────
  const { files, inlineDiffs } = useMemo(() => {
    const files = parseDiff(diff);
    const pairs = new Map<number, { removed?: DiffLine; added?: DiffLine }>();
    for (const file of files)
      for (const hunk of file.hunks)
        for (const line of hunk.lines)
          if (line.pairKey !== undefined) {
            const entry = pairs.get(line.pairKey) ?? {};
            if (line.type === "removed") entry.removed = line;
            else if (line.type === "added") entry.added = line;
            pairs.set(line.pairKey, entry);
          }
    const inlineDiffs = new Map<number, { aSegs: Segment[]; bSegs: Segment[] }>();
    for (const [key, { removed, added }] of pairs)
      if (removed && added) inlineDiffs.set(key, computeInlineDiff(removed.content, added.content));
    return { files, inlineDiffs };
  }, [diff]);

  // ── Syntax tokens (async, progressive) ────────────────────────────────────
  const tokenMap = useSyntaxTokens(files, isDark);

  // ── Pre-compute composed syntax+word-diff spans (AGENTS.md §5.1) ──────────
  // Moving this out of render-time is the key CPU win — O(n) once, not O(n) per render
  const composedSpansMap = useMemo(() => {
    const map = new Map<DiffLine, RenderedSpan[]>();
    for (const file of files)
      for (const hunk of file.hunks)
        for (const dl of hunk.lines) {
          if (dl.type !== "added" && dl.type !== "removed") continue;
          if (dl.pairKey === undefined) continue;
          const tokens = tokenMap.get(dl);
          const iDiff = inlineDiffs.get(dl.pairKey);
          if (!tokens || !iDiff) continue;
          const segs = dl.type === "removed" ? iDiff.aSegs : iDiff.bSegs;
          map.set(dl, composeSyntaxAndWordDiff(tokens, segs));
        }
    return map;
  }, [files, tokenMap, inlineDiffs]);

  // ── Split-row cache, stable across re-renders ──────────────────────────────
  const splitRowsCache = useMemo(() => {
    const cache = new Map<string, SplitRow[]>();
    for (let fi = 0; fi < files.length; fi++)
      for (let hi = 0; hi < files[fi].hunks.length; hi++)
        cache.set(`${fi}-${hi}`, toSplitRows(files[fi].hunks[hi].lines));
    return cache;
  }, [files]);

  // ── Collapsed context state ───────────────────────────────────────────────
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

  const expandContext = useCallback((key: string) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // ── Inter-hunk gap state ──────────────────────────────────────────────────
  // Each key is "fi-hi" (gap sitting just above hunk hi of file fi).
  const [expandedInterHunks, setExpandedInterHunks] = useState<Set<string>>(new Set());

  const toggleInterHunk = useCallback((key: string) => {
    setExpandedInterHunks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Keyboard navigation ─────────────────────────────────────────────────
  // useRef for cursor — nav doesn't need to cause a re-render (AGENTS.md §5.12)
  const hunkCursorRef = useRef(0);

  const hunkIds = useMemo(
    () => files.flatMap((f, fi) => f.hunks.map((_, hi) => `diff-hunk-${fi}-${hi}`)),
    [files]
  );

  const navHunk = useCallback((delta: 1 | -1) => {
    if (!hunkIds.length) return;
    const next = Math.max(0, Math.min(hunkIds.length - 1, hunkCursorRef.current + delta));
    hunkCursorRef.current = next;
    document.getElementById(hunkIds[next])?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hunkIds]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("input,textarea,select")) return;
    if (e.key === "]") { e.preventDefault(); navHunk(1); }
    else if (e.key === "[") { e.preventDefault(); navHunk(-1); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); onToggleMode?.(); }
  }, [navHunk, onToggleMode]);

  // ── Flat virtual item list ────────────────────────────────────────────────
  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      let added = 0, removed = 0;
      for (const h of file.hunks)
        for (const l of h.lines) {
          if (l.type === "added") added++;
          else if (l.type === "removed") removed++;
        }
      out.push({ kind: "file-header", fi, added, removed });
      if (file.hunks.length === 0) { out.push({ kind: "binary", fi }); continue; }
      for (let hi = 0; hi < file.hunks.length; hi++) {
        // ── Inter-hunk gap: lines between the previous hunk and this one ──────
        // Git only includes a fixed context window around each change.  Any
        // lines outside that window are absent from the diff entirely.  When we
        // have the full file content we can fill that gap on demand.
        if (hi > 0 && fileLines && fileLines.length > 0) {
          const prevR = parseHunkNewRange(file.hunks[hi - 1].header);
          const thisR = parseHunkNewRange(file.hunks[hi].header);
          // 0-based indices into fileLines:
          //   prevR ends at line (prevR.start + prevR.count - 1) in 1-indexed
          //                   = (prevR.start + prevR.count - 2) in 0-indexed
          //   gap starts one line later  →  prevR.start + prevR.count - 1
          //   thisR starts at thisR.start (1-indexed) = thisR.start - 1 (0-indexed)
          //   gap ends one line before   →  thisR.start - 2
          const fromLine = prevR.start + prevR.count - 1;
          const toLine   = thisR.start - 2;
          if (toLine >= fromLine && toLine < fileLines.length) {
            const ihKey = `${fi}-${hi}`;
            out.push({ kind: "inter-hunk", fi, hi, fromLine, toLine });
            if (expandedInterHunks.has(ihKey)) {
              for (let lineIdx = fromLine; lineIdx <= toLine; lineIdx++)
                out.push({ kind: "inter-hunk-line", fi, hi, lineIdx });
            }
          }
        }

        out.push({ kind: "hunk-header", fi, hi });
        if (mode === "unified") {
          for (let li = 0; li < file.hunks[hi].lines.length; li++)
            out.push({ kind: "unified-line", fi, hi, li });
        } else {
          const rows = splitRowsCache.get(`${fi}-${hi}`) ?? [];
          for (let ri = 0; ri < rows.length; ri++)
            out.push({ kind: "split-row", fi, hi, ri });
        }
      }
    }
    return out;
  // expandedContexts / expandedInterHunks → list grows; fileLines → gap items appear
  }, [files, mode, splitRowsCache, expandedContexts, expandedInterHunks, fileLines]);

  // ── Virtualizer ──────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => ITEM_HEIGHT[items[index].kind],
    overscan: 15, // render 15 items beyond viewport edges
    // Stable keys prevent unnecessary DOM recycling when collapsed-context
    // items are expanded and new rows are inserted into the list.
    getItemKey: (index) => {
      const item = items[index];
      if (item.kind === "unified-line")   return `u-${item.fi}-${item.hi}-${item.li}`;
      if (item.kind === "split-row")      return `s-${item.fi}-${item.hi}-${item.ri}`;
      if (item.kind === "hunk-header")    return `hh-${item.fi}-${item.hi}`;
      if (item.kind === "file-header")    return `fh-${item.fi}`;
      if (item.kind === "inter-hunk")     return `ih-${item.fi}-${item.hi}`;
      if (item.kind === "inter-hunk-line") return `ihl-${item.fi}-${item.hi}-${item.lineIdx}`;
      return `bin-${item.fi}`;
    },
    measureElement: typeof window !== "undefined"
      ? (el) => el.getBoundingClientRect().height
      : undefined,
  });

  // ── Per-line content renderer ─────────────────────────────────────────────
  // This is a pure function of DiffLine + precomputed maps — no closures over component state
  function renderLineContent(dl: DiffLine): React.ReactNode {
    const composed = composedSpansMap.get(dl);
    if (composed) {
      const isRemoved = dl.type === "removed";
      return composed.map((span, si) => {
        const style: React.CSSProperties = span.color ? { color: span.color } : {};
        if (span.changed) {
          style.backgroundColor = isRemoved ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)";
          style.borderRadius = "2px";
        }
        return <span key={si} style={style}>{span.text}</span>;
      });
    }
    const tokens = tokenMap.get(dl);
    if (tokens) return tokens.map((tok, ti) => (
      <span key={ti} style={tok.color ? { color: tok.color } : undefined}>{tok.content}</span>
    ));
    if (dl.pairKey !== undefined && inlineDiffs.has(dl.pairKey)) return renderWordDiff(dl, inlineDiffs);
    return dl.content;
  }

  // ── Split cell renderer ───────────────────────────────────────────────────
  function renderSplitCell(dl: DiffLine | undefined, side: "removed" | "added") {
    const isRemoved = side === "removed";
    if (!dl) return (
      <div className={cn("flex min-w-0 flex-1", isRemoved && "border-r border-border/20 bg-muted/5")}>
        <span className="w-10 shrink-0" />
        <span className="w-3 shrink-0" />
        <span className="flex-1 px-1" />
      </div>
    );
    const hasTokens = !!tokenMap.get(dl);
    return (
      <div className={cn(
        "flex items-start min-w-0 flex-1",
        isRemoved && "bg-red-500/10 border-r border-border/20",
        !isRemoved && "bg-green-500/10",
      )}>
        <span className="inline-block w-10 shrink-0 text-right pr-1 select-none text-[10px] text-muted-foreground/40 font-mono leading-5">
          {isRemoved ? dl.oldNum : dl.newNum}
        </span>
        <span className={cn("px-1 select-none shrink-0 w-3 text-[10px] leading-5",
          isRemoved ? "text-red-400" : "text-green-400")}>
          {isRemoved ? "−" : "+"}
        </span>
        <span className={cn(
          "flex-1 min-w-0 break-all whitespace-pre-wrap text-[12px] leading-5 px-1",
          !hasTokens && isRemoved && "text-red-200",
          !hasTokens && !isRemoved && "text-green-100",
        )}>
          {renderLineContent(dl)}
        </span>
      </div>
    );
  }

  // ── Item renderer ─────────────────────────────────────────────────────────
  function renderItem(item: FlatItem): React.ReactNode {
    if (item.kind === "file-header") {
      const file = files[item.fi];
      const { added, removed } = item;
      const total = added + removed || 1;
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/80 backdrop-blur border-b border-border text-[11px] font-mono">
          <span className="text-muted-foreground truncate flex-1 min-w-0">{file.newFile || file.oldFile}</span>
          {(added > 0 || removed > 0) && (
            <>
              <span className="text-green-400 shrink-0">+{added}</span>
              <span className="text-red-400 shrink-0">-{removed}</span>
              <div className="w-14 h-1.5 rounded-full overflow-hidden bg-muted/60 flex shrink-0">
                <div className="bg-green-500/70 h-full" style={{ width: `${(added / total) * 100}%` }} />
                <div className="bg-red-500/70 h-full flex-1" />
              </div>
            </>
          )}
        </div>
      );
    }

    if (item.kind === "binary") {
      return (
        <div className="px-3 py-2 text-xs text-muted-foreground italic">
          Binary file — no diff available
        </div>
      );
    }

    if (item.kind === "hunk-header") {
      const hunk = files[item.fi].hunks[item.hi];
      const hunkId = `diff-hunk-${item.fi}-${item.hi}`;
      const ctxHint = hunkContextHint(hunk.header);
      return (
        <div id={hunkId} className="flex items-baseline gap-2 px-2 py-0.5 bg-blue-500/5 border-y border-blue-500/15 text-[10px] font-mono select-none">
          <span className="text-blue-400/70">{hunk.header.match(/@@ [^@]+ @@/)?.[0] ?? hunk.header}</span>
          {ctxHint && <span className="text-muted-foreground/50 font-sans truncate">{ctxHint}</span>}
        </div>
      );
    }

    if (item.kind === "unified-line") {
      const dl = files[item.fi].hunks[item.hi].lines[item.li];
      const ctxKey = `${item.fi}-${item.hi}-${item.li}`;

      if (dl.type === "collapsed-context") {
        if (expandedContexts.has(ctxKey) && dl.collapsedLines) {
          return (
            <Fragment>
              {dl.collapsedLines.map((cl, cli) => (
                <ContextLineRow key={cli} line={cl} tokens={tokenMap.get(cl)} />
              ))}
            </Fragment>
          );
        }
        return (
          <button
            onClick={() => expandContext(ctxKey)}
            className="w-full flex items-center gap-2 px-3 py-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors select-none border-y border-border/30 font-mono"
          >
            <ChevronsUpDown size={11} className="shrink-0" />
            <span>{dl.count} unchanged lines</span>
          </button>
        );
      }

      if (dl.type === "context") {
        return <ContextLineRow line={dl} tokens={tokenMap.get(dl)} />;
      }

      const isAdded = dl.type === "added";
      return (
        <div className={cn(
          "flex items-start min-w-0 leading-5 border-l-2",
          isAdded ? "bg-green-500/10 border-l-green-500/50" : "bg-red-500/10 border-l-red-500/50",
        )}>
          <LineNum n={isAdded ? undefined : dl.oldNum} />
          <LineNum n={isAdded ? dl.newNum : undefined} />
          <span className={cn("px-1 select-none shrink-0 w-3", isAdded ? "text-green-400" : "text-red-400")}>
            {isAdded ? "+" : "−"}
          </span>
          <span className={cn(
            "flex-1 min-w-0 break-all whitespace-pre-wrap",
            !tokenMap.get(dl) && isAdded && "text-green-100",
            !tokenMap.get(dl) && !isAdded && "text-red-200",
          )}>
            {renderLineContent(dl)}
          </span>
        </div>
      );
    }

    if (item.kind === "split-row") {
      const rows = splitRowsCache.get(`${item.fi}-${item.hi}`) ?? [];
      const row = rows[item.ri];
      const ctxKey = `${item.fi}-${item.hi}-${item.ri}`;

      if (row.kind === "collapsed") {
        if (expandedContexts.has(ctxKey) && row.node.collapsedLines) {
          return (
            <Fragment>
              {row.node.collapsedLines.map((cl, cli) => (
                <div key={cli} className="flex border-b border-border/10">
                  {renderSplitCell(cl, "removed")}
                  {renderSplitCell(cl, "added")}
                </div>
              ))}
            </Fragment>
          );
        }
        return (
          <button
            onClick={() => expandContext(ctxKey)}
            className="w-full flex items-center gap-2 px-3 py-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors select-none border-y border-border/30 font-mono"
          >
            <ChevronsUpDown size={11} className="shrink-0" />
            <span>{row.node.count} unchanged lines</span>
          </button>
        );
      }

      if (row.kind === "context") {
        return (
          <div className="flex border-b border-border/10">
            {renderSplitCell(row.line, "removed")}
            {renderSplitCell(row.line, "added")}
          </div>
        );
      }

      // pair row
      return (
        <div className="flex border-b border-border/10">
          {renderSplitCell(row.left, "removed")}
          {renderSplitCell(row.right, "added")}
        </div>
      );
    }

    // ── Inter-hunk gap toggle button ─────────────────────────────────────────
    if (item.kind === "inter-hunk") {
      const ihKey = `${item.fi}-${item.hi}`;
      const isExpanded = expandedInterHunks.has(ihKey);
      const count = item.toLine - item.fromLine + 1;
      return (
        <button
          onClick={() => toggleInterHunk(ihKey)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-0.5 text-[10px] transition-colors select-none border-y font-mono",
            isExpanded
              ? "text-blue-400/80 hover:text-blue-400 bg-blue-500/5 border-blue-500/20"
              : "text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/5 border-blue-500/15",
          )}
        >
          <ChevronsUpDown size={11} className="shrink-0" />
          <span>
            {isExpanded
              ? `↑ Collapse ${count} unchanged lines`
              : `↕ ${count} unchanged lines — click to expand`}
          </span>
        </button>
      );
    }

    // ── Inter-hunk gap line (expanded) ───────────────────────────────────────
    if (item.kind === "inter-hunk-line") {
      const content = fileLines?.[item.lineIdx] ?? "";
      const lineNum = item.lineIdx + 1; // 1-indexed for display
      if (mode === "split") {
        return (
          <div className="flex border-b border-border/10 bg-muted/5">
            <div className="flex min-w-0 flex-1 border-r border-border/20">
              <LineNum n={lineNum} />
              <span className="w-3 shrink-0" />
              <span className="flex-1 min-w-0 break-all whitespace-pre-wrap text-foreground/50 text-[12px] px-1 leading-5">{content || "\u00A0"}</span>
            </div>
            <div className="flex min-w-0 flex-1">
              <LineNum n={lineNum} />
              <span className="w-3 shrink-0" />
              <span className="flex-1 min-w-0 break-all whitespace-pre-wrap text-foreground/50 text-[12px] px-1 leading-5">{content || "\u00A0"}</span>
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-start min-w-0 leading-5 border-l-2 border-l-transparent bg-muted/5">
          <LineNum n={undefined} />
          <LineNum n={lineNum} />
          <span className="px-1 select-none shrink-0 w-3 text-muted-foreground/30"> </span>
          <span className="flex-1 min-w-0 break-all whitespace-pre-wrap text-foreground/50 text-[12px]">
            {content || "\u00A0"}
          </span>
        </div>
      );
    }

    return null;
  }

  // ── Early exit ────────────────────────────────────────────────────────────
  if (!diff.trim()) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No diff available
      </div>
    );
  }

  const totalSize = virtualizer.getTotalSize();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded w-full h-full"
    >
      {/* Replace ScrollArea with a plain div — required for react-virtual to get the scroll element */}
      <div
        ref={scrollRef}
        className={cn(
          "w-full overflow-auto font-mono text-xs",
          // Custom minimal scrollbar
          "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full",
          maxHeightClass,
        )}
      >
        {/* The virtualized container — fixed overall height, items positioned absolutely */}
        <div style={{ height: totalSize, position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((vitem) => (
            <div
              key={vitem.key}
              data-index={vitem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vitem.start}px)`,
              }}
            >
              {renderItem(items[vitem.index])}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
