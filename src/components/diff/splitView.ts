import { type DiffLine } from "./types";

// ---------------------------------------------------------------------------
// Split view helpers
// ---------------------------------------------------------------------------

export type SplitRow =
  | { kind: "context"; line: DiffLine }
  | { kind: "pair"; left?: DiffLine; right?: DiffLine }
  | { kind: "collapsed"; node: DiffLine };

export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const out: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const dl = lines[i];
    if (dl.type === "context") { out.push({ kind: "context", line: dl }); i++; }
    else if (dl.type === "collapsed-context") { out.push({ kind: "collapsed", node: dl }); i++; }
    else {
      const removed: DiffLine[] = [], added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === "removed") removed.push(lines[i++]);
      while (i < lines.length && lines[i].type === "added") added.push(lines[i++]);
      const max = Math.max(removed.length, added.length);
      for (let r = 0; r < max; r++) out.push({ kind: "pair", left: removed[r], right: added[r] });
    }
  }
  return out;
}
