import { useState, useMemo } from "react";
import { GitCommitHorizontal, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
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
  const [selectedType, setSelectedType] = useState<CommitType | null>(null);
  const [scope, setScope] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [bodyOpen, setBodyOpen] = useState(false);
  const [committing, setCommitting] = useState(false);

  const preview = useMemo(() => {
    if (!selectedType || !description.trim()) return "";
    const scopePart = scope.trim() ? `(${scope.trim()})` : "";
    const breakingMark = breaking ? "!" : "";
    const header = `${selectedType}${scopePart}${breakingMark}: ${description.trim()}`;
    return body.trim() ? `${header}\n\n${body.trim()}` : header;
  }, [selectedType, scope, breaking, description, body]);

  const canCommit = hasStaged && selectedType !== null && description.trim().length > 0 && !committing;

  async function handleCommit() {
    if (!canCommit) return;
    setCommitting(true);
    try {
      await git.commit(repoPath, preview);
      toast.success("Committed successfully");
      // reset form
      setSelectedType(null);
      setScope("");
      setBreaking(false);
      setDescription("");
      setBody("");
      setBodyOpen(false);
      onCommitSuccess();
    } catch (e) {
      toast.error(`Commit failed: ${String(e)}`);
    } finally {
      setCommitting(false);
    }
  }

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
              onClick={() => setSelectedType(selectedType === ct.value ? null : ct.value)}
              className={cn(
                "px-2.5 py-1 text-xs font-mono rounded border transition-all",
                ct.color,
                selectedType === ct.value
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
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-8 font-mono text-sm"
        />
      </div>

      {/* Breaking change */}
      <div className="flex items-center gap-3">
        <Switch
          id="breaking"
          checked={breaking}
          onCheckedChange={setBreaking}
        />
        <Label htmlFor="breaking" className="flex items-center gap-1.5 cursor-pointer text-sm">
          <AlertTriangle size={13} className={cn("transition-colors", breaking ? "text-red-400" : "text-muted-foreground")} />
          Breaking change
        </Label>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="commit-desc" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Description
        </Label>
        <Input
          id="commit-desc"
          placeholder="Short description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canCommit) handleCommit(); }}
          className="h-8 text-sm"
        />
      </div>

      {/* Body (collapsible) */}
      <Collapsible open={bodyOpen} onOpenChange={setBodyOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold hover:text-foreground transition-colors">
            Body <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
            {bodyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5">
          <Textarea
            placeholder="Additional context, motivation, or migration notes…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
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

      {/* Hints */}
      {!hasStaged && (
        <div className="flex items-center gap-2 text-xs text-amber-400 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle size={13} />
          Stage at least one file to commit.
        </div>
      )}

      {/* Commit button */}
      <div className="mt-auto pt-2">
        <Button
          className="w-full gap-2"
          disabled={!canCommit}
          onClick={handleCommit}
        >
          <GitCommitHorizontal size={16} />
          {committing ? "Committing…" : "Commit"}
          {canCommit && (
            <Badge variant="secondary" className="ml-auto font-mono text-[10px] h-5 px-1.5">
              {selectedType}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
}
