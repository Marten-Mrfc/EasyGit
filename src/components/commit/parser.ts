import type { ParsedFooter } from "./types";

const FOOTER_START_RE = /^(BREAKING CHANGE|BREAKING-CHANGE|[A-Za-z][A-Za-z0-9-]*)(?:: | #)(.*)$/;

export function parseFooterBlock(raw: string): { entries: ParsedFooter[]; isValid: boolean } {
  const lines = raw.split(/\r?\n/);
  const entries: ParsedFooter[] = [];

  for (const line of lines) {
    const match = line.match(FOOTER_START_RE);
    if (match) {
      const [, token, value] = match;
      entries.push({ token, value });
      continue;
    }

    if (line.trim().length === 0) {
      if (entries.length === 0) {
        return { entries: [], isValid: false };
      }
      entries[entries.length - 1].value += "\n";
      continue;
    }

    if (entries.length === 0) {
      return { entries: [], isValid: false };
    }

    entries[entries.length - 1].value += `\n${line}`;
  }

  return { entries, isValid: entries.length > 0 };
}

export function tokenIsValid(token: string): boolean {
  const upperToken = token.toUpperCase();
  if (upperToken === "BREAKING CHANGE" || upperToken === "BREAKING-CHANGE") {
    return token === "BREAKING CHANGE" || token === "BREAKING-CHANGE";
  }
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(token);
}

export function splitBodyAndFooters(rest: string): { body: string; footers: string } {
  if (!rest.trim()) {
    return { body: "", footers: "" };
  }

  const lines = rest.split(/\r?\n/);
  let footerStart = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (!FOOTER_START_RE.test(lines[i])) continue;
    if (i > 0 && lines[i - 1].trim() !== "") continue;
    footerStart = i;
    break;
  }

  if (footerStart === -1) {
    return { body: rest.trim(), footers: "" };
  }

  return {
    body: lines.slice(0, footerStart).join("\n").trim(),
    footers: lines.slice(footerStart).join("\n").trim(),
  };
}

export function parseCommitMessage(message: string): {
  type: string;
  scope: string;
  hasBang: boolean;
  description: string;
  body: string;
  breakingFooter: string;
  footers: string;
} | null {
  const lines = message.split(/\r?\n/);
  const header = (lines[0] ?? "").trim();
  const headerMatch = header.match(/^([A-Za-z][A-Za-z0-9-]*)(?:\(([^)\s]+)\))?(!)?:\s+(.+)$/);
  if (!headerMatch) {
    return null;
  }

  const [, type, scope, bang, description] = headerMatch;
  const rest = lines.slice(1).join("\n").replace(/^\n+/, "");
  const { body, footers } = splitBodyAndFooters(rest);

  let breakingFooter = "";
  let remainingFooters = footers;
  if (footers.trim()) {
    const parsed = parseFooterBlock(footers.trim());
    if (parsed.isValid) {
      const nonBreaking = parsed.entries.filter((entry) => {
        const upperToken = entry.token.toUpperCase();
        return upperToken !== "BREAKING CHANGE" && upperToken !== "BREAKING-CHANGE";
      });
      const breaking = parsed.entries.find((entry) => {
        const upperToken = entry.token.toUpperCase();
        return upperToken === "BREAKING CHANGE" || upperToken === "BREAKING-CHANGE";
      });
      breakingFooter = breaking?.value.trim() ?? "";
      remainingFooters = nonBreaking.map((entry) => `${entry.token}: ${entry.value}`).join("\n").trim();
    }
  }

  return {
    type,
    scope: scope ?? "",
    hasBang: bang === "!",
    description,
    body,
    breakingFooter,
    footers: remainingFooters,
  };
}
