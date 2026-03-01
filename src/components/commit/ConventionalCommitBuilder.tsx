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
  breaking: boolean;
  description: string;
  body: string;
  bodyOpen: boolean;
  amend: boolean;
}

type FormAction =
  | { type: "SET_TYPE"; payload: CommitType | null }
  | { type: "SET_SCOPE"; payload: string }
  | { type: "SET_BREAKING"; payload: boolean }
  | { type: "SET_DESCRIPTION"; payload: string }
  | { type: "SET_BODY"; payload: string }
  | { type: "SET_BODY_OPEN"; payload: boolean }
  | { type: "SET_AMEND"; payload: boolean }
  | { type: "FILL_FROM_COMMIT"; payload: Partial<FormState> }
  | { type: "RESET" };

const initialFormState: FormState = {
  selectedType: null,
  scope: "",
  breaking: false,
  description: "",
  body: "",
  bodyOpen: false,
  amend: false,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_TYPE":
      return { ...state, selectedType: action.payload };
    case "SET_SCOPE":
      return { ...state, scope: action.payload };
    case "SET_BREAKING":
      return { ...state, breaking: action.payload };
    case "SET_DESCRIPTION":
      return { ...state, description: action.payload };
    case "SET_BODY":
      return { ...state, body: action.payload };
    case "SET_BODY_OPEN":
      return { ...state, bodyOpen: action.payload };
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

export function ConventionalCommitBuilder({
  repoPath,
  hasStaged,
  onCommitSuccess,
}: ConventionalCommitBuilderProps) {
  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const [committing, setCommitting] = useState(false);

  const preview = useMemo(() => {
    if (!form.selectedType || !form.description.trim()) return "";
    const scopePart = form.scope.trim() ? `(${form.scope.trim()})` : "";
    const breakingMark = form.breaking ? "!" : "";
    const header = `${form.selectedType}${scopePart}${breakingMark}: ${form.description.trim()}`;
    return form.body.trim() ? `${header}\n\n${form.body.trim()}` : header;
  }, [form.selectedType, form.scope, form.breaking, form.description, form.body]);

  const canCommit = useMemo(
    () => (hasStaged || form.amend) && form.selectedType !== null && form.description.trim().length > 0 && !committing,
    [hasStaged, form.amend, form.selectedType, form.description, committing]
  );

  // When amend is toggled on, pre-fill the form with the last commit message
  useEffect(() => {
    if (!form.amend) return;
    git.getLastCommitMessage(repoPath).then((msg) => {
      // Try to parse the conventional commit format
      const match = msg.match(/^(\w+)(?:\(([^)]+)\))?(!)?: (.+?)(?:\n\n([\s\S]*))?$/);
      if (match) {
        const [, type, scopeVal, breakingMark, desc, bodyVal] = match;
        const knownType = COMMIT_TYPES.find((ct) => ct.value === type);
        dispatch({
          type: "FILL_FROM_COMMIT",
          payload: {
            selectedType: (knownType?.value ?? null) as CommitType | null,
            scope: scopeVal || "",
            breaking: breakingMark === "!",
            description: desc || "",
            body: bodyVal?.trim() || "",
            bodyOpen: !!(bodyVal?.trim()),
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
          id="breaking"
          checked={form.breaking}
          onCheckedChange={(checked) => dispatch({ type: "SET_BREAKING", payload: checked })}
        />
        <Label htmlFor="breaking" className="flex items-center gap-1.5 cursor-pointer text-sm">
          <AlertTriangle size={13} className={cn("transition-colors", form.breaking ? "text-red-400" : "text-muted-foreground")} />
          Breaking change
        </Label>
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
          <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[9px]">Ctrl+Enter</kbd> to commit
        </p>
      </div>
    </div>
  );
}
