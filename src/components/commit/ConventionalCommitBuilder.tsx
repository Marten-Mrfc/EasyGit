import { useState, useReducer, useMemo, useEffect, useCallback } from "react";
import { GitCommitHorizontal, ChevronDown, ChevronUp, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { git } from "@/lib/git";

const COMMIT_TYPES = [
  { value: "feat",     label: "feat",     description: "New feature",         color: "text-green-400  border-green-500/40  bg-green-500/10  hover:bg-green-500/20" },
  { value: "fix",      label: "fix",      description: "Bug fix",             color: "text-red-400    border-red-500/40    bg-red-500/10    hover:bg-red-500/20" },
  { value: "chore",    label: "chore",    description: "Build/tool changes",  color: "text-zinc-400   border-zinc-500/40   bg-zinc-500/10   hover:bg-zinc-500/20" },
  { value: "docs",     label: "docs",     description: "Documentation",       color: "text-sky-400    border-sky-500/40    bg-sky-500/10    hover:bg-sky-500/20" },
  { value: "refactor", label: "refactor", description: "Code restructuring",  color: "text-purple-400 border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20" },
  { value: "test",     label: "test",     description: "Adding tests",        color: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20" },
  { value: "ci",       label: "ci",       description: "CI/CD changes",       color: "text-blue-400   border-blue-500/40   bg-blue-500/10   hover:bg-blue-500/20" },
  { value: "perf",     label: "perf",     description: "Performance tweak",   color: "text-orange-400 border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20" },
  { value: "style",    label: "style",    description: "Formatting, whitespace", color: "text-pink-400 border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20" },
  { value: "revert",   label: "revert",   description: "Revert a commit",     color: "text-rose-400   border-rose-500/40   bg-rose-500/10   hover:bg-rose-500/20" },
] as const;

type CommitType = typeof COMMIT_TYPES[number]["value"];

// Form state and reducer for efficient batch updates (§5.1 derived state)
interface FormState {
  selectedType: CommitType | null;
  scope: string;
  breakingBang: boolean;
  breakingFooter: string;
  description: string;
  body: string;
  bodyOpen: boolean;
  footers: string;
  footerOpen: boolean;
  amend: boolean;
}

type FormAction =
  | { type: "SET_TYPE"; payload: CommitType | null }
  | { type: "SET_SCOPE"; payload: string }
  | { type: "SET_BREAKING_BANG"; payload: boolean }
  | { type: "SET_BREAKING_FOOTER"; payload: string }
  | { type: "SET_DESCRIPTION"; payload: string }
  | { type: "SET_BODY"; payload: string }
  | { type: "SET_BODY_OPEN"; payload: boolean }
  | { type: "SET_FOOTERS"; payload: string }
  | { type: "SET_FOOTER_OPEN"; payload: boolean }
  | { type: "SET_AMEND"; payload: boolean }
  | { type: "FILL_FROM_COMMIT"; payload: Partial<FormState> }
  | { type: "RESET" };

const initialFormState: FormState = {
  selectedType: null,
  scope: "",
  breakingBang: false,
  breakingFooter: "",
  description: "",
  body: "",
  bodyOpen: false,
  footers: "",
  footerOpen: false,
  amend: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_TYPE":
      return { ...state, selectedType: action.payload };
    case "SET_SCOPE":
      return { ...state, scope: action.payload };
    case "SET_BREAKING_BANG":
      return { ...state, breakingBang: action.payload };
    case "SET_BREAKING_FOOTER":
      return { ...state, breakingFooter: action.payload };
    case "SET_DESCRIPTION":
      return { ...state, description: action.payload };
    case "SET_BODY":
      return { ...state, body: action.payload };
    case "SET_BODY_OPEN":
      return { ...state, bodyOpen: action.payload };
    case "SET_FOOTERS":
      return { ...state, footers: action.payload };
    case "SET_FOOTER_OPEN":
      return { ...state, footerOpen: action.payload };
    case "SET_AMEND":
      return { ...state, amend: action.payload };
    case "FILL_FROM_COMMIT":
      return { ...state, ...action.payload };
    case "RESET":
      return initialFormState;
    default:
      return state;
  }
}

interface ConventionalCommitBuilderProps {
  repoPath: string;
  hasStaged: boolean;
  onCommitSuccess: () => void;
}

interface ParsedFooter {
  token: string;
  value: string;
}

const FOOTER_START_RE = /^(BREAKING CHANGE|BREAKING-CHANGE|[A-Za-z][A-Za-z0-9-]*)(?:: | #)(.*)$/;

function parseFooterBlock(raw: string): { entries: ParsedFooter[]; isValid: boolean } {
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

function tokenIsValid(token: string): boolean {
  const upperToken = token.toUpperCase();
  if (upperToken === "BREAKING CHANGE" || upperToken === "BREAKING-CHANGE") {
    return token === "BREAKING CHANGE" || token === "BREAKING-CHANGE";
  }
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(token);
}

function splitBodyAndFooters(rest: string): { body: string; footers: string } {
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

function parseCommitMessage(message: string): {
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

export function ConventionalCommitBuilder({
  repoPath,
  hasStaged,
  onCommitSuccess,
}: ConventionalCommitBuilderProps) {
  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const [committing, setCommitting] = useState(false);

  const scopeInvalid = useMemo(() => {
    const trimmed = form.scope.trim();
    if (!trimmed) return false;
    return !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(trimmed);
  }, [form.scope]);

  const footerValidation = useMemo(() => {
    const trimmed = form.footers.trim();
    if (!trimmed) {
      return { isValid: true, invalidToken: "" };
    }

    const parsed = parseFooterBlock(trimmed);
    if (!parsed.isValid) {
      return { isValid: false, invalidToken: "" };
    }

    const invalidEntry = parsed.entries.find((entry) => !tokenIsValid(entry.token));
    if (invalidEntry) {
      return { isValid: false, invalidToken: invalidEntry.token };
    }

    return { isValid: true, invalidToken: "" };
  }, [form.footers]);

  const preview = useMemo(() => {
    if (!form.selectedType || !form.description.trim()) return "";
    const scopePart = form.scope.trim() ? `(${form.scope.trim()})` : "";
    const breakingMark = form.breakingBang ? "!" : "";
    const header = `${form.selectedType}${scopePart}${breakingMark}: ${form.description.trim()}`;

    const sections: string[] = [];
    if (form.body.trim()) {
      sections.push(form.body.trim());
    }

    const footerLines: string[] = [];
    if (form.breakingFooter.trim()) {
      footerLines.push(`BREAKING CHANGE: ${form.breakingFooter.trim()}`);
    }
    if (form.footers.trim()) {
      footerLines.push(form.footers.trim());
    }
    if (footerLines.length > 0) {
      sections.push(footerLines.join("\n"));
    }

    return sections.length > 0 ? `${header}\n\n${sections.join("\n\n")}` : header;
  }, [form.selectedType, form.scope, form.breakingBang, form.description, form.body, form.breakingFooter, form.footers]);

  const canCommit = useMemo(
    () => {
      return (hasStaged || form.amend)
        && form.selectedType !== null
        && form.description.trim().length > 0
        && !scopeInvalid
        && footerValidation.isValid
        && !committing;
    },
    [hasStaged, form.amend, form.selectedType, form.description, scopeInvalid, footerValidation.isValid, committing]
  );

  // When amend is toggled on, pre-fill the form with the last commit message
  useEffect(() => {
    if (!form.amend) return;
    git.getLastCommitMessage(repoPath).then((msg) => {
      const parsed = parseCommitMessage(msg);
      if (parsed) {
        const knownType = COMMIT_TYPES.find((ct) => ct.value === parsed.type.toLowerCase());
        dispatch({
          type: "FILL_FROM_COMMIT",
          payload: {
            selectedType: (knownType?.value ?? null) as CommitType | null,
            scope: parsed.scope,
            breakingBang: parsed.hasBang,
            breakingFooter: parsed.breakingFooter,
            description: parsed.description,
            body: parsed.body,
            bodyOpen: !!parsed.body,
            footers: parsed.footers,
            footerOpen: !!(parsed.breakingFooter || parsed.footers),
          },
        });
      } else {
        // Non-conventional message — put it all in description
        const rest = msg.split("\n").slice(2).join("\n").trim();
        dispatch({
          type: "FILL_FROM_COMMIT",
          payload: {
            description: msg.split("\n")[0] || "",
            body: rest,
            bodyOpen: !!rest,
            footers: "",
            footerOpen: false,
            breakingFooter: "",
            breakingBang: false,
          },
        });
      }
    }).catch(() => { /* no commits yet */ });
  }, [form.amend, repoPath]);

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setCommitting(true);
    try {
      if (form.amend) {
        await git.amendCommit(repoPath, preview);
        toast.success("Commit amended");
      } else {
        await git.commit(repoPath, preview);
        toast.success("Committed successfully");
      }
      dispatch({ type: "RESET" });
      onCommitSuccess();
    } catch (e) {
      toast.error(`Commit failed: ${String(e)}`);
    } finally {
      setCommitting(false);
    }
  }, [canCommit, form.amend, repoPath, preview, onCommitSuccess]);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* Commit type */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Type
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {COMMIT_TYPES.map((ct) => (
            <button
              key={ct.value}
              title={ct.description}
              onClick={() => dispatch({ type: "SET_TYPE", payload: form.selectedType === ct.value ? null : ct.value })}
              className={cn(
                "px-2.5 py-1 text-xs font-mono rounded border transition-all",
                ct.color,
                form.selectedType === ct.value
                  ? "ring-2 ring-offset-1 ring-offset-background ring-current font-semibold"
                  : "opacity-70 hover:opacity-100"
              )}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope */}
      <div className="space-y-1.5">
        <Label htmlFor="commit-scope" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Scope <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          id="commit-scope"
          placeholder="auth, ui, api…"
          value={form.scope}
          onChange={(e) => dispatch({ type: "SET_SCOPE", payload: e.target.value })}
          className="h-8 font-mono text-sm"
        />
      </div>

      {/* Breaking change */}
      <div className="flex items-center gap-3">
        <Switch
          id="breaking-bang"
          checked={form.breakingBang}
          onCheckedChange={(checked) => dispatch({ type: "SET_BREAKING_BANG", payload: checked })}
        />
        <Label htmlFor="breaking-bang" className="flex items-center gap-1.5 cursor-pointer text-sm">
          <AlertTriangle size={13} className={cn("transition-colors", form.breakingBang ? "text-red-400" : "text-muted-foreground")} />
          Add ! marker to header
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="breaking-footer" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Breaking Footer <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          id="breaking-footer"
          placeholder="Describe the breaking change..."
          value={form.breakingFooter}
          onChange={(e) => dispatch({ type: "SET_BREAKING_FOOTER", payload: e.target.value })}
          className="h-8 text-sm"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="commit-desc" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Description
          </Label>
          <span className={cn(
            "text-[10px] tabular-nums",
            form.description.length > 72 ? "text-red-400" :
            form.description.length > 50 ? "text-amber-400" :
            "text-muted-foreground/50"
          )}>
            {form.description.length}/72
          </span>
        </div>
        <Input
          id="commit-desc"
          placeholder="Short description…"
          value={form.description}
          onChange={(e) => dispatch({ type: "SET_DESCRIPTION", payload: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canCommit) handleCommit();
          }}
          className={cn("h-8 text-sm", form.description.length > 72 && "border-red-500/50 focus-visible:ring-red-500/30")}
        />
        {scopeInvalid && (
          <p className="text-[10px] text-red-400">
            Scope must be a noun-like token (letters, numbers, dot, slash, underscore, hyphen).
          </p>
        )}
      </div>

      {/* Body (collapsible) */}
      <Collapsible open={form.bodyOpen} onOpenChange={(open) => dispatch({ type: "SET_BODY_OPEN", payload: open })}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold hover:text-foreground transition-colors">
            Body <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
            {form.bodyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5">
          <Textarea
            placeholder="Additional context, motivation, or migration notes…"
            value={form.body}
            onChange={(e) => dispatch({ type: "SET_BODY", payload: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) handleCommit();
            }}
            rows={3}
            className="text-sm resize-none font-mono"
          />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={form.footerOpen} onOpenChange={(open) => dispatch({ type: "SET_FOOTER_OPEN", payload: open })}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold hover:text-foreground transition-colors">
            Footers <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
            {form.footerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5 space-y-1.5">
          <Textarea
            placeholder={"Reviewed-by: Z\nRefs: #123"}
            value={form.footers}
            onChange={(e) => dispatch({ type: "SET_FOOTERS", payload: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) handleCommit();
            }}
            rows={4}
            className={cn("text-sm resize-none font-mono", !footerValidation.isValid && "border-red-500/50 focus-visible:ring-red-500/30")}
          />
          {!footerValidation.isValid && (
            <p className="text-[10px] text-red-400">
              Footer lines must start with TOKEN: value or TOKEN #value.{footerValidation.invalidToken ? ` Invalid token: ${footerValidation.invalidToken}` : ""}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Preview */}
      {preview && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-semibold">Preview</p>
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
            {preview}
          </pre>
        </div>
      )}

      {/* Amend toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="amend"
          checked={form.amend}
          onCheckedChange={(checked) => dispatch({ type: "SET_AMEND", payload: checked })}
        />
        <Label htmlFor="amend" className="flex items-center gap-1.5 cursor-pointer text-sm">
          <Pencil size={13} className={cn("transition-colors", form.amend ? "text-amber-400" : "text-muted-foreground")} />
          Amend last commit
        </Label>
      </div>

      {/* Hints */}
      {!hasStaged && !form.amend && (
        <div className="flex items-center gap-2 text-xs text-amber-400 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle size={13} />
          Stage at least one file to commit.
        </div>
      )}

      {/* Commit button */}
      <div className="mt-auto pt-2 space-y-1.5">
        <Button
          className="w-full gap-2"
          disabled={!canCommit}
          onClick={handleCommit}
        >
          <GitCommitHorizontal size={16} />
          {committing ? (form.amend ? "Amending…" : "Committing…") : (form.amend ? "Amend Commit" : "Commit")}
          {canCommit && (
            <Badge variant="secondary" className="ml-auto font-mono text-[10px] h-5 px-1.5">
              {form.selectedType}
            </Badge>
          )}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground/50">
          Press <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[9px]">Enter</kbd> or{" "}
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[9px]">Ctrl+Enter</kbd> to commit from multi-line fields
        </p>
      </div>
    </div>
  );
}
