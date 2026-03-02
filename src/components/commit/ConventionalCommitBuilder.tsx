import { useState, useReducer, useMemo, useEffect, useCallback } from "react";
import { GitCommitHorizontal, AlertTriangle, Pencil, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { git } from "@/lib/git";
import { COMMIT_TYPES, type CommitType, type ConventionalCommitBuilderProps } from "./types";
import { parseFooterBlock, tokenIsValid, parseCommitMessage } from "./parser";
import { formReducer, initialFormState } from "./reducer";

export function ConventionalCommitBuilder({
  repoPath,
  hasStaged,
  onCommitSuccess,
}: ConventionalCommitBuilderProps) {
  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const [committing, setCommitting] = useState(false);
  const [viewAll, setViewAll] = useState(false);

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

  const addFooterTemplate = useCallback((token: string) => {
    const hasContent = form.footers.trim().length > 0;
    const template = `${token}: `;
    dispatch({
      type: "SET_FOOTERS",
      payload: hasContent ? `${form.footers.trimEnd()}\n${template}` : template,
    });
  }, [form.footers]);

  const handleClear = useCallback(() => {
    dispatch({ type: "RESET" });
    toast.info("Form cleared");
  }, []);

  const hasAnyContent = form.selectedType || form.description.trim() || form.scope.trim() || 
                        form.body.trim() || form.footers.trim() || form.breakingBang || form.breakingFooter.trim();

  // Progressive disclosure logic
  const showQuestion = {
    type: true, // Always show first question
    description: viewAll || !!form.selectedType,
    scope: viewAll || !!form.description.trim(),
    breaking: viewAll || !!form.description.trim(),
    body: viewAll || !!form.description.trim(),
    footers: viewAll || !!form.description.trim(),
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-6">
      {/* Header with clear button and view mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h3 className="text-sm font-semibold">Create Commit</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewAll(!viewAll)}
            className="h-7 px-2 text-xs"
          >
            {viewAll ? "Progressive" : "View All"}
          </Button>
          {hasAnyContent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X size={14} className="mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-5">
        {/* Question 1: What kind of change? (Always visible) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            <span className="text-muted-foreground mr-1.5">1.</span>
            What kind of change is this?
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMIT_TYPES.map((ct) => (
              <button
                key={ct.value}
                title={ct.description}
                onClick={() => dispatch({ type: "SET_TYPE", payload: form.selectedType === ct.value ? null : ct.value })}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-all",
                  ct.color,
                  form.selectedType === ct.value
                    ? "ring-2 ring-offset-1 ring-offset-background ring-current font-semibold scale-105"
                    : "opacity-70 hover:opacity-100 hover:scale-105"
                )}
              >
                {ct.label}
              </button>
            ))}
          </div>
          {form.selectedType && (
            <p className="text-xs text-muted-foreground pl-1">
              → {COMMIT_TYPES.find(ct => ct.value === form.selectedType)?.description}
            </p>
          )}
        </div>

        {/* Question 2: Summary */}
        {showQuestion.description && (
          <div className="space-y-2 animate-in slide-in-from-left-2 fade-in duration-300">
            <div className="flex items-center justify-between">
              <Label htmlFor="commit-desc" className="text-sm font-medium">
                <span className="text-muted-foreground mr-1.5">2.</span>
                What did you change?
              </Label>
              <span className={cn(
                "text-[10px] tabular-nums font-mono",
                form.description.length > 72 ? "text-red-400 font-semibold" :
                form.description.length > 50 ? "text-amber-400" :
                "text-muted-foreground/50"
              )}>
                {form.description.length}/72
              </span>
            </div>
            <Input
              id="commit-desc"
              placeholder="e.g., add user authentication flow"
              value={form.description}
              onChange={(e) => dispatch({ type: "SET_DESCRIPTION", payload: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canCommit) handleCommit();
              }}
              className={cn(
                "text-sm font-medium",
                form.description.length > 72 && "border-red-500/50 focus-visible:ring-red-500/30"
              )}
            />
            <p className="text-xs text-muted-foreground pl-1">
              Keep it brief and clear
            </p>
          </div>
        )}

        {/* Question 3: Scope (optional) */}
        {showQuestion.scope && (
          <div className="space-y-2 animate-in slide-in-from-left-2 fade-in duration-300">
            <Label htmlFor="commit-scope" className="text-sm font-medium">
              <span className="text-muted-foreground mr-1.5">3.</span>
              Which part of the project? <span className="font-normal text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="commit-scope"
              placeholder="e.g., auth, ui, api, core"
              value={form.scope}
              onChange={(e) => dispatch({ type: "SET_SCOPE", payload: e.target.value })}
              className={cn(
                "text-sm font-mono",
                form.scope.trim() && "opacity-100",
                !form.scope.trim() && "opacity-80 focus:opacity-100"
              )}
            />
            {scopeInvalid && (
              <p className="text-xs text-red-400 pl-1">
                Use letters, numbers, dots, slashes, underscores, or hyphens only
              </p>
            )}
          </div>
        )}

        {/* Question 4: Breaking change */}
        {showQuestion.breaking && (
          <div className="space-y-2 animate-in slide-in-from-left-2 fade-in duration-300">
            <div className="flex items-center gap-2">
              <Switch
                id="breaking-bang"
                checked={form.breakingBang}
                onCheckedChange={(checked) => dispatch({ type: "SET_BREAKING_BANG", payload: checked })}
              />
              <Label htmlFor="breaking-bang" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <span className="text-muted-foreground mr-1">4.</span>
                Is this a breaking change?
                <AlertTriangle size={14} className={cn("transition-colors", form.breakingBang ? "text-red-400" : "text-muted-foreground/50")} />
              </Label>
            </div>
            
            {form.breakingBang && (
              <div className="ml-11 space-y-1.5 animate-in slide-in-from-left-2 duration-200">
                <Label htmlFor="breaking-footer" className="text-xs text-muted-foreground">
                  What breaks and how to fix it?
                </Label>
                <Textarea
                  id="breaking-footer"
                  placeholder="e.g., removed deprecated API endpoints, use v2 instead"
                  value={form.breakingFooter}
                  onChange={(e) => dispatch({ type: "SET_BREAKING_FOOTER", payload: e.target.value })}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Question 5: More context */}
        {showQuestion.body && (
          <div className="space-y-2 pt-3 border-t border-border/50 animate-in slide-in-from-left-2 fade-in duration-300">
            <Label htmlFor="extended-body" className="text-sm font-medium">
              <span className="text-muted-foreground mr-1.5">5.</span>
              Need to explain more? <span className="font-normal text-muted-foreground text-xs">(optional)</span>
            </Label>
            <div className={cn("transition-opacity", form.body.trim() ? "opacity-100" : "opacity-80 focus-within:opacity-100")}>
              <Textarea
                id="extended-body"
                placeholder="Add context, motivation, reasoning, or anything helpful for reviewers…"
                value={form.body}
                onChange={(e) => dispatch({ type: "SET_BODY", payload: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) handleCommit();
                }}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
        )}

        {/* Question 6: Metadata */}
        {showQuestion.footers && (
          <div className="space-y-2 animate-in slide-in-from-left-2 fade-in duration-300">
            <Label htmlFor="additional-footers" className="text-sm font-medium">
              <span className="text-muted-foreground mr-1.5">6.</span>
              Add metadata? <span className="font-normal text-muted-foreground text-xs">(optional)</span>
            </Label>

            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addFooterTemplate("Refs")}>
                + Issue Ref
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addFooterTemplate("Reviewed-by")}>
                + Reviewer
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addFooterTemplate("Co-authored-by")}>
                + Co-author
              </Button>
            </div>

            <div className={cn("transition-opacity", form.footers.trim() ? "opacity-100" : "opacity-80 focus-within:opacity-100")}>
              <Textarea
                id="additional-footers"
                placeholder={"Refs: #123\nReviewed-by: Jane Doe\nCo-authored-by: John Smith <john@example.com>"}
                value={form.footers}
                onChange={(e) => dispatch({ type: "SET_FOOTERS", payload: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) handleCommit();
                }}
                rows={3}
                className={cn("text-sm resize-none font-mono", !footerValidation.isValid && "border-red-500/50 focus-visible:ring-red-500/30")}
              />
            </div>

            {!footerValidation.isValid && (
              <p className="text-xs text-red-400 pl-1">
                Format: TOKEN: value or TOKEN #value{footerValidation.invalidToken ? ` (invalid: ${footerValidation.invalidToken})` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal size={14} className="text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Preview
            </p>
          </div>
          <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
            {preview}
          </pre>
        </div>
      )}

      {/* Options */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Switch
            id="amend"
            checked={form.amend}
            onCheckedChange={(checked) => dispatch({ type: "SET_AMEND", payload: checked })}
          />
          <Label htmlFor="amend" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
            Amend previous commit
            <Pencil size={13} className={cn("transition-colors", form.amend ? "text-amber-400" : "text-muted-foreground/50")} />
          </Label>
        </div>
      </div>

      {/* Warnings */}
      {!hasStaged && !form.amend && (
        <div className="flex items-center gap-2 text-xs text-amber-400 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
          <AlertTriangle size={15} />
          <span>Stage at least one file to commit</span>
        </div>
      )}

      {form.amend && (
        <div className="flex items-center gap-2 text-xs text-amber-400 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
          <AlertTriangle size={15} />
          <span>Amending will modify your last commit — avoid if already pushed</span>
        </div>
      )}

      {/* Commit button */}
      <div className="mt-auto pt-4 space-y-2">
        <Button
          className="w-full gap-2 h-10 text-sm font-semibold"
          disabled={!canCommit}
          onClick={handleCommit}
        >
          <GitCommitHorizontal size={18} />
          {committing ? (form.amend ? "Amending…" : "Committing…") : (form.amend ? "Amend Commit" : "Commit Changes")}
          {canCommit && (
            <Badge variant="secondary" className="ml-auto font-mono text-xs h-5 px-2">
              {form.selectedType}
            </Badge>
          )}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground/60">
          Press <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[9px]">Enter</kbd> in description or{" "}
          <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-[9px]">Ctrl+Enter</kbd> in text fields
        </p>
      </div>
    </div>
  );
}
