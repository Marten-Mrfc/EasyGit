import { type DiffLine, type FilePatch, type Hunk } from "./types";

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

const COLLAPSE_THRESHOLD = 5;
const CONTEXT_KEEP = 3;

function pairLines(lines: DiffLine[]): DiffLine[] {
  const out = lines.map((l) => ({ ...l }));
  let pairCounter = 0;
  let i = 0;
  while (i < out.length) {
    if (out[i].type === "removed") {
      let rEnd = i;
      while (rEnd < out.length && out[rEnd].type === "removed") rEnd++;
      let aEnd = rEnd;
      while (aEnd < out.length && out[aEnd].type === "added") aEnd++;
      // Only pair (and therefore word-diff) when exactly one line was changed.
      // Multi-line change blocks are left unpaired — word diff would be noisy there.
      if (rEnd - i === 1 && aEnd - rEnd === 1) {
        const key = pairCounter++;
        out[i] = { ...out[i], pairKey: key };
        out[rEnd] = { ...out[rEnd], pairKey: key };
      }
      i = aEnd;
    } else {
      i++;
    }
  }
  return out;
}

function collapseContext(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "context") { out.push(lines[i++]); continue; }
    let runEnd = i;
    while (runEnd < lines.length && lines[runEnd].type === "context") runEnd++;
    const run = lines.slice(i, runEnd);
    const atStart = i === 0;
    const atEnd = runEnd === lines.length;
    if (!atStart && !atEnd && run.length >= COLLAPSE_THRESHOLD) {
      if (run.length > CONTEXT_KEEP * 2) {
        const hidden = run.slice(CONTEXT_KEEP, run.length - CONTEXT_KEEP);
        out.push(...run.slice(0, CONTEXT_KEEP));
        out.push({ type: "collapsed-context", content: "", count: hidden.length, collapsedLines: hidden });
        out.push(...run.slice(run.length - CONTEXT_KEEP));
      } else {
        out.push({ type: "collapsed-context", content: "", count: run.length, collapsedLines: run });
      }
    } else {
      out.push(...run);
    }
    i = runEnd;
  }
  return out;
}

function finalizeHunk(hunk: Hunk): Hunk {
  return { ...hunk, lines: collapseContext(pairLines(hunk.lines)) };
}

// ---------------------------------------------------------------------------
// Diff parser
// ---------------------------------------------------------------------------

export function parseDiff(raw: string): FilePatch[] {
  const files: FilePatch[] = [];
  if (!raw.trim()) return files;
  let current: FilePatch | null = null;
  let currentHunk: Hunk | null = null;
  let oldNum = 0;
  let newNum = 0;
  for (const line of raw.split("\n")) {
    if (line.startsWith("--- ")) {
      if (currentHunk && current) current.hunks.push(finalizeHunk(currentHunk));
      if (current) files.push(current);
      current = { oldFile: line.slice(4).replace(/^a\//, ""), newFile: "", hunks: [] };
      currentHunk = null;
    } else if (line.startsWith("+++ ") && current) {
      current.newFile = line.slice(4).replace(/^b\//, "");
    } else if (line.startsWith("@@ ") && current) {
      if (currentHunk) current.hunks.push(finalizeHunk(currentHunk));
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldNum = m ? parseInt(m[1]) : 1;
      newNum = m ? parseInt(m[2]) : 1;
      currentHunk = { header: line, lines: [] };
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "added", content: line.slice(1), newNum: newNum++ });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "removed", content: line.slice(1), oldNum: oldNum++ });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : "",
          oldNum: oldNum++,
          newNum: newNum++,
        });
      }
    }
  }
  if (currentHunk && current) current.hunks.push(finalizeHunk(currentHunk));
  if (current) files.push(current);
  return files;
}
