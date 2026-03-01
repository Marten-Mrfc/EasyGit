import { useState, useEffect } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { BundledLanguage, LanguageInput, ThemedToken } from "shiki";
import { type DiffLine, type FilePatch } from "./types";
import { type Segment } from "./wordDiff";

// ---------------------------------------------------------------------------
// Syntax highlighting (Shiki) — fine-grained bundle + JS RegExp engine
//
// Key perf wins vs. the previous approach:
//   1. No Oniguruma WASM (~620 KB saved from the initial bundle).
//   2. Languages are lazy-loaded on demand — only the language(s) actually
//      present in the current diff are ever fetched (AGENTS.md §2.2).
//   3. Concurrent ensureLang calls for the same language are deduplicated so
//      the highlighter.loadLanguage() is never called twice for the same lang.
// ---------------------------------------------------------------------------

export type RenderedSpan = { text: string; color?: string; changed: boolean };

const EXT_LANG: Partial<Record<string, BundledLanguage>> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  rs: "rust", py: "python", go: "go", java: "java",
  c: "c", cpp: "cpp", cc: "cpp", h: "c", cs: "csharp",
  rb: "ruby", php: "php", sh: "shellscript", bash: "shellscript",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", html: "html", css: "css", sql: "sql",
  swift: "swift", kt: "kotlin", dart: "dart", lua: "lua",
};

// Each entry is a factory so the lang chunk is only fetched when first needed.
// Vite splits these into individual async chunks, so unused langs cost nothing.
const LANG_LOADERS: Partial<Record<BundledLanguage, () => Promise<unknown>>> = {
  typescript:  () => import("shiki/langs/typescript.mjs"),
  tsx:         () => import("shiki/langs/tsx.mjs"),
  javascript:  () => import("shiki/langs/javascript.mjs"),
  jsx:         () => import("shiki/langs/jsx.mjs"),
  rust:        () => import("shiki/langs/rust.mjs"),
  python:      () => import("shiki/langs/python.mjs"),
  go:          () => import("shiki/langs/go.mjs"),
  java:        () => import("shiki/langs/java.mjs"),
  c:           () => import("shiki/langs/c.mjs"),
  cpp:         () => import("shiki/langs/cpp.mjs"),
  csharp:      () => import("shiki/langs/csharp.mjs"),
  ruby:        () => import("shiki/langs/ruby.mjs"),
  php:         () => import("shiki/langs/php.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  json:        () => import("shiki/langs/json.mjs"),
  yaml:        () => import("shiki/langs/yaml.mjs"),
  toml:        () => import("shiki/langs/toml.mjs"),
  markdown:    () => import("shiki/langs/markdown.mjs"),
  html:        () => import("shiki/langs/html.mjs"),
  css:         () => import("shiki/langs/css.mjs"),
  sql:         () => import("shiki/langs/sql.mjs"),
  swift:       () => import("shiki/langs/swift.mjs"),
  kotlin:      () => import("shiki/langs/kotlin.mjs"),
  dart:        () => import("shiki/langs/dart.mjs"),
  lua:         () => import("shiki/langs/lua.mjs"),
};

// Singleton — themes are pre-loaded once; languages are added on demand.
let _hlPromise: ReturnType<typeof createHighlighterCore> | null = null;
function getHighlighter() {
  if (!_hlPromise) {
    _hlPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-dark.mjs"),
        import("shiki/themes/github-light.mjs"),
      ],
      langs: [],
      // Pure-JS engine — no WebAssembly download required (AGENTS.md §2.1)
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return _hlPromise;
}

// Track in-flight loadLanguage calls so concurrent ensureLang() invocations
// for the same lang share one Promise instead of calling loadLanguage twice.
const _loadingLangs = new Map<BundledLanguage, Promise<void>>();

/** Load `lang` into the shared highlighter if not already present. */
async function ensureLang(lang: BundledLanguage | "text"): Promise<void> {
  if (lang === "text") return;
  const hl = await getHighlighter();
  if ((hl.getLoadedLanguages() as string[]).includes(lang)) return;
  if (_loadingLangs.has(lang)) return _loadingLangs.get(lang)!;
  const loader = LANG_LOADERS[lang];
  if (!loader) return;
  const p = hl.loadLanguage(loader as LanguageInput).then(() => { _loadingLangs.delete(lang); });
  _loadingLangs.set(lang, p);
  return p;
}

export function extToLang(filename: string): BundledLanguage | "text" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}

export function composeSyntaxAndWordDiff(tokens: ThemedToken[], segs: Segment[]): RenderedSpan[] {
  const boundaries = new Set<number>([0]);
  let pos = 0;
  for (const tok of tokens) { pos += tok.content.length; boundaries.add(pos); }
  pos = 0;
  for (const seg of segs) { pos += seg.text.length; boundaries.add(pos); }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const fullText = segs.map((s) => s.text).join("");
  const tokFlat: { start: number; end: number; color?: string }[] = [];
  let t = 0;
  for (const tok of tokens) { tokFlat.push({ start: t, end: t + tok.content.length, color: tok.color }); t += tok.content.length; }
  const segFlat: { start: number; end: number; changed: boolean }[] = [];
  let s = 0;
  for (const seg of segs) { segFlat.push({ start: s, end: s + seg.text.length, changed: seg.changed }); s += seg.text.length; }
  let ti = 0, si = 0;
  const result: RenderedSpan[] = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k], end = sorted[k + 1];
    if (start >= fullText.length) break;
    while (ti < tokFlat.length - 1 && tokFlat[ti].end <= start) ti++;
    while (si < segFlat.length - 1 && segFlat[si].end <= start) si++;
    result.push({ text: fullText.slice(start, end), color: tokFlat[ti]?.color, changed: segFlat[si]?.changed ?? false });
  }
  return result;
}

/**
 * Progressively highlights syntax, yielding to the event loop between hunks
 * so the UI stays responsive (AGENTS.md §1.1). Language chunks are fetched on
 * demand via ensureLang(). State is flushed once per file rather than once per
 * hunk — for a diff with M hunks across N files this cuts re-renders (and the
 * expensive composedSpansMap recalculation in DiffViewer) from M down to N.
 */
export function useSyntaxTokens(files: FilePatch[], isDark: boolean): Map<DiffLine, ThemedToken[]> {
  const [tokenMap, setTokenMap] = useState<Map<DiffLine, ThemedToken[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    setTokenMap(new Map()); // reset on new diff
    const theme = isDark ? "github-dark" : "github-light";
    (async () => {
      const accumulated = new Map<DiffLine, ThemedToken[]>();
      for (const file of files) {
        if (cancelled) return;
        const lang = extToLang(file.newFile || file.oldFile);
        // Fetch the language grammar chunk now (no-op if already cached).
        await ensureLang(lang);
        if (cancelled) return;
        const hl = await getHighlighter();
        for (const hunk of file.hunks) {
          if (cancelled) return;
          const newLines: DiffLine[] = [];
          const oldLines: DiffLine[] = [];
          for (const dl of hunk.lines) {
            if (dl.type === "context") { newLines.push(dl); oldLines.push(dl); }
            else if (dl.type === "added") { newLines.push(dl); }
            else if (dl.type === "removed") { oldLines.push(dl); }
            else if (dl.type === "collapsed-context" && dl.collapsedLines) {
              for (const cl of dl.collapsedLines) { newLines.push(cl); oldLines.push(cl); }
            }
          }
          if (newLines.length > 0) {
            const { tokens } = hl.codeToTokens(newLines.map((l) => l.content).join("\n"), { lang, theme });
            newLines.forEach((dl, i) => { if (tokens[i]) accumulated.set(dl, tokens[i]); });
          }
          if (oldLines.length > 0) {
            const { tokens } = hl.codeToTokens(oldLines.map((l) => l.content).join("\n"), { lang, theme });
            oldLines.forEach((dl, i) => { if (tokens[i] && !accumulated.has(dl)) accumulated.set(dl, tokens[i]); });
          }
          // Yield between hunks — keeps the UI responsive on large diffs.
          await new Promise<void>((r) => setTimeout(r, 0));
        }
        // Flush state once per file (not per hunk) — reduces re-renders from
        // Σ(hunks) to Σ(files), cutting wasteful composedSpansMap recalculations.
        if (!cancelled) setTokenMap(new Map(accumulated));
      }
    })();
    return () => { cancelled = true; };
  }, [files, isDark]);
  return tokenMap;
}

/**
 * Highlight an entire file's content with Shiki, returning one ThemedToken[]
 * per line. Returns an empty array while loading, then fills progressively in
 * chunks so the UI stays responsive on large files.
 */
export function useFileTokens(
  content: string | null,
  filename: string,
  isDark: boolean,
): ThemedToken[][] {
  const [lines, setLines] = useState<ThemedToken[][]>([]);
  useEffect(() => {
    if (!content) { setLines([]); return; }
    let cancelled = false;
    setLines([]);
    const theme = isDark ? "github-dark" : "github-light";
    const lang = extToLang(filename);
    const CHUNK = 300; // lines per chunk — larger than diff chunks, fewer state updates
    (async () => {
      await ensureLang(lang);
      const hl = await getHighlighter();
      if (cancelled) return;
      const allLines = content.split("\n");
      const accumulated: ThemedToken[][] = [];
      for (let start = 0; start < allLines.length; start += CHUNK) {
        if (cancelled) return;
        const slice = allLines.slice(start, start + CHUNK).join("\n");
        const { tokens } = hl.codeToTokens(slice, { lang, theme });
        accumulated.push(...tokens);
        // Yield between chunks for responsiveness
        await new Promise<void>((r) => setTimeout(r, 0));
        if (!cancelled) setLines([...accumulated]);
      }
    })();
    return () => { cancelled = true; };
  }, [content, filename, isDark]);
  return lines;
}
