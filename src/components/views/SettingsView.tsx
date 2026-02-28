import { useState, useEffect, useRef } from "react";
import {
  Github,
  Gitlab,
  LogOut,
  Loader2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  RefreshCw,
  Download,
  Info,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";
import { useGitHubUser, useInvalidateGitHubCache } from "@/hooks/useGitHub";
import { useUpdater } from "@/hooks/useUpdater";
import {
  GITHUB_CLIENT_ID,
  validateGitHubToken,
  validateGitLabToken,
  startGitHubDeviceFlow,
  pollGitHubDeviceToken,
  type DeviceCodeData,
} from "@/lib/auth";

// ---------------------------------------------------------------------------
// GitHub Section
// ---------------------------------------------------------------------------

function GitHubSection() {
  const { githubToken, connectGitHub, disconnectGitHub } = useAuthStore();
  const { data: user, isLoading: userLoading } = useGitHubUser();
  const invalidateCache = useInvalidateGitHubCache();

  const [pat, setPat] = useState("");
  const [patConnecting, setPatConnecting] = useState(false);
  const [flowStep, setFlowStep] = useState<"idle" | "starting" | "waiting">(
    "idle"
  );
  const [deviceInfo, setDeviceInfo] = useState<DeviceCodeData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasClientId = !!GITHUB_CLIENT_ID;

  // Poll for token completion during device flow
  useEffect(() => {
    if (!deviceInfo || flowStep !== "waiting") return;

    pollRef.current = setInterval(async () => {
      try {
        const token = await pollGitHubDeviceToken(deviceInfo.device_code);
        if (token) {
          clearInterval(pollRef.current!);
          await connectGitHub(token);
          setFlowStep("idle");
          setDeviceInfo(null);
          toast.success("Connected to GitHub!");
        }
      } catch (e) {
        clearInterval(pollRef.current!);
        toast.error(String(e));
        setFlowStep("idle");
        setDeviceInfo(null);
      }
    }, (deviceInfo.interval + 1) * 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [deviceInfo, flowStep, connectGitHub]);

  async function handleStartDeviceFlow() {
    setFlowStep("starting");
    try {
      const data = await startGitHubDeviceFlow();
      setDeviceInfo(data);
      setFlowStep("waiting");
      await openUrl(data.verification_uri);
    } catch (e) {
      toast.error(`Failed to start login: ${String(e)}`);
      setFlowStep("idle");
    }
  }

  function cancelDeviceFlow() {
    if (pollRef.current) clearInterval(pollRef.current);
    setFlowStep("idle");
    setDeviceInfo(null);
  }

  async function handlePatConnect() {
    const trimmed = pat.trim();
    if (!trimmed) return;
    setPatConnecting(true);
    try {
      await validateGitHubToken(trimmed);
      await connectGitHub(trimmed);
      setPat("");
      toast.success("Connected to GitHub!");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPatConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectGitHub();
    invalidateCache();
    toast("Disconnected from GitHub");
  }

  // --- Connected state ---
  if (githubToken) {
    return (
      <div className="flex items-center gap-3">
        {userLoading ? (
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        ) : user ? (
          <>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={user.avatar_url} alt={user.login} />
              <AvatarFallback>{user.login[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.name ?? user.login}
              </p>
              <p className="text-xs text-muted-foreground">@{user.login}</p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-1">
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            Connected
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Disconnect"
        >
          <LogOut size={14} />
        </Button>
      </div>
    );
  }

  // --- Device flow waiting state ---
  if (flowStep === "waiting" && deviceInfo) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Open{" "}
          <button
            onClick={() => openUrl(deviceInfo.verification_uri)}
            className="font-mono text-foreground underline underline-offset-2 hover:text-primary inline-flex items-center gap-1"
          >
            {deviceInfo.verification_uri}
            <ExternalLink size={10} />
          </button>{" "}
          and enter:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-center text-xl font-mono font-bold tracking-widest bg-muted rounded-md py-2 px-3">
            {deviceInfo.user_code}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(deviceInfo.user_code);
              toast("Code copied");
            }}
          >
            <Copy size={14} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 size={12} className="animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1">
            Waiting for authorization…
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelDeviceFlow}
            className="text-xs text-muted-foreground h-6 px-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // --- Sign-in form ---
  return (
    <div className="space-y-4">
      {hasClientId ? (
        <Button
          className="w-full gap-2"
          onClick={handleStartDeviceFlow}
          disabled={flowStep === "starting"}
        >
          {flowStep === "starting" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Github size={15} />
          )}
          Sign in with GitHub
        </Button>
      ) : (
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">OAuth sign-in not configured</p>
          <p>
            Create a GitHub OAuth App and set{" "}
            <code className="font-mono text-foreground">VITE_GITHUB_CLIENT_ID</code>{" "}
            in <code className="font-mono text-foreground">.env</code> to enable
            "Sign in with GitHub".
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Key size={10} />
          personal access token
        </span>
        <Separator className="flex-1" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Token with <code className="font-mono">repo</code> +{" "}
          <code className="font-mono">read:user</code> scopes
        </Label>
        <div className="flex gap-2">
          <Input
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            type="password"
            className="font-mono text-xs h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePatConnect();
            }}
          />
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={handlePatConnect}
            disabled={patConnecting || !pat.trim()}
          >
            {patConnecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitLab Section
// ---------------------------------------------------------------------------

function GitLabSection() {
  const { gitlabToken, gitlabUser, connectGitLab, disconnectGitLab, setGitLabUser } =
    useAuthStore();
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com");
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleConnect() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setIsConnecting(true);
    try {
      const user = await validateGitLabToken(trimmed, baseUrl);
      await connectGitLab(trimmed);
      setGitLabUser(user);
      setToken("");
      toast.success("Connected to GitLab!");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setIsConnecting(false);
    }
  }

  if (gitlabToken) {
    return (
      <div className="flex items-center gap-3">
        {gitlabUser ? (
          <>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={gitlabUser.avatar_url} alt={gitlabUser.username} />
              <AvatarFallback>
                {gitlabUser.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{gitlabUser.name}</p>
              <p className="text-xs text-muted-foreground">
                @{gitlabUser.username}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-1">
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            Connected
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            disconnectGitLab();
            toast("Disconnected from GitLab");
          }}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Disconnect"
        >
          <LogOut size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">GitLab URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://gitlab.com"
          className="text-xs h-8 font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Personal Access Token with{" "}
          <code className="font-mono">read_user</code> +{" "}
          <code className="font-mono">api</code> scopes
        </Label>
        <div className="flex gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="glpat-…"
            type="password"
            className="font-mono text-xs h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnect();
            }}
          />
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={handleConnect}
            disabled={isConnecting || !token.trim()}
          >
            {isConnecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account badge shown in the connected GitHub repos section
// ---------------------------------------------------------------------------

function GitHubReposPreview() {
  const token = useAuthStore((s) => s.githubToken);
  // Repos are fetched via TanStack Query on demand; just show a hint here
  if (!token) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Your repositories are available for cloning from the Open Repository screen.
    </p>
  );
}

// ---------------------------------------------------------------------------
// About & Updates Section
// ---------------------------------------------------------------------------

function AboutSection() {
  const { status, update, error, checkForUpdates, installUpdate } =
    useUpdater();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info size={13} />
          <span>Version 0.1.0</span>
        </div>
        {status === "available" && update ? (
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={installUpdate}>
            <Download size={12} />
            Install v{update.version}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={checkForUpdates}
            disabled={status === "checking" || status === "downloading"}
          >
            {status === "checking" || status === "downloading" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {status === "checking"
              ? "Checking…"
              : status === "downloading"
              ? "Installing…"
              : "Check for updates"}
          </Button>
        )}
      </div>
      {status === "up-to-date" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-green-500" />
          You're on the latest version.
        </p>
      )}
      {status === "error" && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsView
// ---------------------------------------------------------------------------

export function SettingsView() {
  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-lg space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Connect accounts and configure preferences.
          </p>
        </div>

        {/* GitHub */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Github size={16} />
            <h2 className="text-sm font-semibold">GitHub</h2>
            <Badge variant="outline" className="text-[10px] ml-auto">
              github.com
            </Badge>
          </div>
          <div className="rounded-lg border border-border p-4">
            <GitHubSection />
          </div>
          <GitHubReposPreview />
          <p className="text-xs text-muted-foreground">
            Required for push/pull with private GitHub repositories. Your token
            is stored locally on this device only.
          </p>
        </section>

        <Separator />

        {/* GitLab */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Gitlab size={16} />
            <h2 className="text-sm font-semibold">GitLab</h2>
          </div>
          <div className="rounded-lg border border-border p-4">
            <GitLabSection />
          </div>
          <p className="text-xs text-muted-foreground">
            Works with both gitlab.com and self-hosted instances. Enter your
            instance URL above.
          </p>
        </section>

        <Separator />

        {/* About & Updates */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">About</h2>
          <div className="rounded-lg border border-border p-4">
            <AboutSection />
          </div>
          <p className="text-xs text-muted-foreground">
            EasyGit is open source.{" "}
            <button
              onClick={() => openUrl("https://github.com/Marten-Mrfc/EasyGit")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              View on GitHub
            </button>
          </p>
        </section>
      </div>
    </ScrollArea>
  );
}
