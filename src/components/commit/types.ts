export const COMMIT_TYPES = [
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

export type CommitType = typeof COMMIT_TYPES[number]["value"];

export interface FormState {
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

export type FormAction =
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

export interface ParsedFooter {
  token: string;
  value: string;
}

export interface ConventionalCommitBuilderProps {
  repoPath: string;
  hasStaged: boolean;
  onCommitSuccess: () => void;
}
