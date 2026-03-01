// ---------------------------------------------------------------------------
// Shared diff types
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: "added" | "removed" | "context" | "collapsed-context";
  content: string;
  oldNum?: number;
  newNum?: number;
  /** Shared key linking a removed line to its matching added line (word-diff). */
  pairKey?: number;
  /** collapsed-context only: number of hidden lines. */
  count?: number;
  /** collapsed-context only: the actual lines stored for expansion. */
  collapsedLines?: DiffLine[];
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FilePatch {
  oldFile: string;
  newFile: string;
  hunks: Hunk[];
}

// ---------------------------------------------------------------------------
// Virtual list item types
// ---------------------------------------------------------------------------

export type FlatItem =
  | { kind: "file-header"; fi: number; added: number; removed: number }
  | { kind: "binary"; fi: number }
  | { kind: "hunk-header"; fi: number; hi: number }
  | { kind: "unified-line"; fi: number; hi: number; li: number }
  | { kind: "split-row"; fi: number; hi: number; ri: number }
  /** Collapsed button representing lines between two hunks that git didn't include. */
  | { kind: "inter-hunk"; fi: number; hi: number; fromLine: number; toLine: number }
  /** One expanded line from the inter-hunk gap (0-based index into fileLines). */
  | { kind: "inter-hunk-line"; fi: number; hi: number; lineIdx: number };

// Estimated heights for virtualizer (monospace code lines are ~20px each)
export const ITEM_HEIGHT: Record<FlatItem["kind"], number> = {
  "file-header": 30,
  "binary": 28,
  "hunk-header": 22,
  "unified-line": 20,
  "split-row": 20,
  "inter-hunk": 22,
  "inter-hunk-line": 20,
};
