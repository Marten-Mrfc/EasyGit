import type { ReactNode } from "react";
import { type DiffLine } from "./types";

// ---------------------------------------------------------------------------
// Word diff — code-aware tokenization · prefix/suffix stripping · semantic
//             cleanup · similarity guard
// ---------------------------------------------------------------------------

export type Segment = { text: string; changed: boolean };

/**
 * Code-aware tokenizer.
 * Groups: identifier/keyword runs, integer/float literals, whitespace runs,
 * then any single remaining character (operators, brackets, quotes, …).
 * This produces far fewer tokens than character-level diffing while still
 * giving sub-word granularity for operators and punctuation.
 */
const CODE_TOKEN_RE =
  /[A-Za-z_$\u00C0-\u024F][A-Za-z0-9_$\u00C0-\u024F]*|[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|\s+|./gsu;

function tokenize(s: string): string[] {
  return s.match(CODE_TOKEN_RE) ?? (s ? [s] : []);
}

/** Strip common prefix and suffix tokens before running LCS. */
function stripCommonEnds(
  a: string[],
  b: string[],
): { prefixLen: number; suffixLen: number } {
  const min = Math.min(a.length, b.length);
  let prefixLen = 0;
  while (prefixLen < min && a[prefixLen] === b[prefixLen]) prefixLen++;
  let suffixLen = 0;
  while (
    suffixLen < min - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) suffixLen++;
  return { prefixLen, suffixLen };
}

/** Merge adjacent segments of the same kind. */
function mergeSegs(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.changed === s.changed) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Semantic cleanup (Neil Fraser §3.2.1).
 * Absorbs small equal runs that are shorter-or-equal to the surrounding
 * changed segments into those changed segments, eliminating "chaff" tokens
 * like lone brackets or commas that coincidentally appear in both lines.
 */
function semanticCleanup(segs: Segment[]): Segment[] {
  let work = mergeSegs(segs);
  let dirty = true;
  while (dirty) {
    dirty = false;
    for (let i = 1; i < work.length - 1; i++) {
      const cur = work[i];
      if (cur.changed) continue;
      const prev = work[i - 1];
      const next = work[i + 1];
      if (!prev.changed || !next.changed) continue;
      // Absorb if the equality is shorter than or equal to both neighbours
      if (cur.text.length <= prev.text.length && cur.text.length <= next.text.length) {
        prev.text += cur.text + next.text;
        work.splice(i, 2);
        dirty = true;
        break;
      }
    }
  }
  return mergeSegs(work);
}

/**
 * Compute inline word-level diff between two lines.
 *
 * Strategy:
 *   1. Tokenize with code-aware regex (identifiers, numbers, whitespace, single chars)
 *   2. Strip identical prefix/suffix tokens before running LCS
 *   3. Run LCS DP only on the differing interior
 *   4. Apply semantic boundary cleanup to remove coincidental-equality chaff
 *   5. Similarity guard: if less than 15% of the original characters are
 *      unchanged, highlight the whole content — noisy micro-annotations on
 *      unrelated lines do more harm than good
 */
export function computeInlineDiff(
  a: string,
  b: string,
): { aSegs: Segment[]; bSegs: Segment[] } {
  // Fast path: identical strings
  if (a === b) return { aSegs: [{ text: a, changed: false }], bSegs: [{ text: b, changed: false }] };

  const aToks = tokenize(a);
  const bToks = tokenize(b);

  // Cap: extremely long lines fall back to whole-line highlight to avoid O(n²) cost
  if (aToks.length > 300 || bToks.length > 300) {
    return { aSegs: [{ text: a, changed: true }], bSegs: [{ text: b, changed: true }] };
  }

  const { prefixLen, suffixLen } = stripCommonEnds(aToks, bToks);
  const aMid = aToks.slice(prefixLen, suffixLen ? -suffixLen : undefined);
  const bMid = bToks.slice(prefixLen, suffixLen ? -suffixLen : undefined);

  const prefixText = aToks.slice(0, prefixLen).join("");
  const suffixText = suffixLen ? aToks.slice(-suffixLen).join("") : "";

  // LCS DP on the interior tokens
  const m = aMid.length;
  const n = bMid.length;
  // Use Uint32Array rows for speed; no Uint16Array overflow risk
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        aMid[i - 1] === bMid[j - 1]
          ? dp[i - 1][j - 1] + 1
          : dp[i - 1][j] >= dp[i][j - 1]
          ? dp[i - 1][j]
          : dp[i][j - 1];

  // Traceback
  const aEdit: Segment[] = [];
  const bEdit: Segment[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aMid[i - 1] === bMid[j - 1]) {
      aEdit.push({ text: aMid[i - 1], changed: false });
      bEdit.push({ text: bMid[j - 1], changed: false });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      bEdit.push({ text: bMid[j - 1], changed: true }); j--;
    } else {
      aEdit.push({ text: aMid[i - 1], changed: true }); i--;
    }
  }
  aEdit.reverse();
  bEdit.reverse();

  // Wrap with prefix/suffix
  function wrap(mid: Segment[]): Segment[] {
    const out: Segment[] = [];
    if (prefixText) out.push({ text: prefixText, changed: false });
    out.push(...mid);
    if (suffixText) out.push({ text: suffixText, changed: false });
    return out;
  }

  const aSegsRaw = semanticCleanup(wrap(aEdit));
  const bSegsRaw = semanticCleanup(wrap(bEdit));

  // Similarity guard: count unchanged characters
  const aUnchanged = aSegsRaw.filter((s) => !s.changed).reduce((n, s) => n + s.text.length, 0);
  const bUnchanged = bSegsRaw.filter((s) => !s.changed).reduce((n, s) => n + s.text.length, 0);
  const similarityA = aUnchanged / (a.length || 1);
  const similarityB = bUnchanged / (b.length || 1);

  if (similarityA < 0.15 && similarityB < 0.15) {
    // Too dissimilar — whole-line highlight avoids noisy chaff annotations
    return { aSegs: [{ text: a, changed: true }], bSegs: [{ text: b, changed: true }] };
  }

  return { aSegs: aSegsRaw, bSegs: bSegsRaw };
}

export function renderWordDiff(
  dl: DiffLine,
  inlineDiffs: Map<number, { aSegs: Segment[]; bSegs: Segment[] }>,
): ReactNode {
  if (dl.pairKey === undefined) return dl.content;
  const result = inlineDiffs.get(dl.pairKey);
  if (!result) return dl.content;
  const segs = dl.type === "removed" ? result.aSegs : result.bSegs;
  const isRemoved = dl.type === "removed";
  return segs.map((seg, si) =>
    seg.changed ? (
      // Only set background — text colour is inherited from the line/syntax tokens
      <mark
        key={si}
        className={
          isRemoved
            ? "rounded-sm not-italic bg-red-500/40"
            : "rounded-sm not-italic bg-green-500/40"
        }
      >
        {seg.text}
      </mark>
    ) : (
      <span key={si}>{seg.text}</span>
    ),
  );
}
