import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Bot,
  Cpu,
  Plug,
  Github,
  Check,
  X,
  Trash2,
  Plus,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/useSettings";
import { useGitHub } from "@/hooks/useGitHub";
import { useClaudeCode } from "@/hooks/useClaudeCode";
import { useCopilot } from "@/hooks/useCopilot";
import { useProviderConfigs } from "@/hooks/useProviderConfigs";
import { useMcpServers } from "@/hooks/useMcpServers";
import { useTheme } from "@/hooks/useTheme";
import {
  PROVIDERS,
  CHAT_MODES,
  type Provider,
  type ChatMode,
  type PanelContent,
} from "@/lib/types";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLanguage, setLanguage, getAvailableLanguages } from "@/lib/i18n";

type Section = "general" | "ai" | "agent" | "integrations";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, save } = useSettings();
  const github = useGitHub();
  const claudeCode = useClaudeCode();
  const copilot = useCopilot();
  const providerConfigs = useProviderConfigs();
  const mcp = useMcpServers();
  const { theme, setTheme } = useTheme();
  const { panelAssignment, setPanelAssignment } = useLayoutMode();

  const [activeSection, setActiveSection] = useState<Section>("general");
  const [saving, setSaving] = useState(false);
  const [claudeLoginCode, setClaudeLoginCode] = useState("");

  // AI fields
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [aiRules, setAiRules] = useState("");
  // AWS Bedrock fields
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsBearerToken, setAwsBearerToken] = useState("");
  const [awsAuthMode, setAwsAuthMode] = useState<"bearer" | "iam">("bearer");

  // Agent fields
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxSteps, setMaxSteps] = useState(100);
  const [maxToolSteps, setMaxToolSteps] = useState(10);
  const [autoFixProblems, setAutoFixProblems] = useState(false);

  // General fields
  const [defaultChatMode, setDefaultChatMode] = useState<ChatMode>("agent");
  const [language, setLang] = useState(getLanguage());

  // Add provider form
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState<Provider>("anthropic");
  const [newModel, setNewModel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [addingProvider, setAddingProvider] = useState(false);
  // Edit provider
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState("");

  // MCP fields
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState<"stdio" | "http">("stdio");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  // Sync from loaded settings
  useEffect(() => {
    if (settings) {
      setProvider((settings.provider as Provider) || "anthropic");
      setModel(settings.model || "");
      setBaseUrl(settings.base_url || "");
      setAiRules(settings.ai_rules || "");
      setAutoApprove(settings.auto_approve ?? false);
      setMaxSteps(settings.max_steps ?? 100);
      setMaxToolSteps(settings.max_tool_steps ?? 10);
      setAutoFixProblems(settings.auto_fix_problems ?? false);

      // Unpack Bedrock credentials from api_key JSON
      if (settings.provider === "bedrock" && settings.api_key) {
        try {
          const creds = JSON.parse(settings.api_key);
          if (creds.bearerToken) {
            setAwsAuthMode("bearer");
            setAwsBearerToken(creds.bearerToken);
            setAwsAccessKeyId("");
            setAwsSecretAccessKey("");
          } else {
            setAwsAuthMode("iam");
            setAwsAccessKeyId(creds.accessKeyId || "");
            setAwsSecretAccessKey(creds.secretAccessKey || "");
            setAwsBearerToken("");
          }
          setAwsRegion(settings.base_url || "us-east-1");
          setApiKey("");
        } catch {
          setApiKey(settings.api_key || "");
        }
      } else {
        setApiKey(settings.api_key || "");
      }
    }
  }, [settings]);

  // Refresh SDK auth status when provider changes to a subscription provider
  useEffect(() => {
    if (provider === "claude-code") claudeCode.refreshStatus();
    if (provider === "copilot") copilot.refreshStatus();
  }, [provider]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Pack Bedrock credentials into api_key/base_url columns
      const effectiveApiKey = provider === "claude-code" || provider === "copilot"
        ? ""
        : provider === "bedrock"
        ? JSON.stringify(
            awsAuthMode === "bearer"
              ? { bearerToken: awsBearerToken }
              : { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey }
          )
        : apiKey;
      const effectiveBaseUrl = provider === "bedrock" ? awsRegion : baseUrl;

      await save({
        provider,
        model,
        api_key: effectiveApiKey,
        base_url: effectiveBaseUrl,
        ai_rules: aiRules || undefined,
        auto_approve: autoApprove,
        max_steps: maxSteps,
        max_tool_steps: maxToolSteps,
        auto_fix_problems: autoFixProblems,
      });
      toast.success("Settings saved");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 h-12 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">Settings</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar nav */}
        <nav className="w-48 border-r p-2 space-y-1 shrink-0">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors",
                  activeSection === s.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Right content */}
        <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
          {activeSection === "general" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">General</h2>
                <p className="text-sm text-muted-foreground">
                  Appearance and default behavior.
                </p>
              </div>
              <Separator />

              {/* Theme */}
              <div className="space-y-2">
                <Label>Theme</Label>
                <select
                  value={theme}
                  onChange={(e) =>
                    setTheme(e.target.value as "light" | "dark" | "system")
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label>Language</Label>
                <select
                  value={language}
                  onChange={(e) => {
                    const lang = e.target.value;
                    setLang(lang);
                    setLanguage(lang);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {getAvailableLanguages().map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Changes apply after reload.
                </p>
              </div>

              {/* Default chat mode */}
              <div className="space-y-2">
                <Label>Default Chat Mode</Label>
                <select
                  value={defaultChatMode}
                  onChange={(e) =>
                    setDefaultChatMode(e.target.value as ChatMode)
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {CHAT_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Panel Layout */}
              <div className="space-y-2">
                <Label>Panel Layout</Label>
                <p className="text-xs text-muted-foreground">
                  Choose what content appears in each panel position.
                </p>
                <div className="flex gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Left Panel</Label>
                    <select
                      value={panelAssignment.left}
                      onChange={(e) => {
                        const val = e.target.value as PanelContent;
                        setPanelAssignment({
                          left: val,
                          right: val === "chat" ? "preview" : "chat",
                        });
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="chat">Chat</option>
                      <option value="preview">Preview / Code</option>
                    </select>
                  </div>
                  <div className="space-y-1 flex-1">
                    <Label className="text-xs">Right Panel</Label>
                    <select
                      value={panelAssignment.right}
                      onChange={(e) => {
                        const val = e.target.value as PanelContent;
                        setPanelAssignment({
                          right: val,
                          left: val === "chat" ? "preview" : "chat",
                        });
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="chat">Chat</option>
                      <option value="preview">Preview / Code</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "ai" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">AI Providers</h2>
                <p className="text-sm text-muted-foreground">
                  Configure multiple AI providers. Click to activate.
                </p>
              </div>
              <Separator />

              {/* Configured providers list */}
              <div className="space-y-2">
                {providerConfigs.configs.map((cfg) => {
                  const pc = PROVIDERS.find((p) => p.id === cfg.provider);
                  const isEditing = editingId === cfg.id;
                  return (
                    <div
                      key={cfg.id}
                      className={cn(
                        "border rounded-lg p-3 transition-colors cursor-pointer",
                        cfg.is_active
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/30",
                      )}
                      onClick={() => {
                        if (!cfg.is_active) providerConfigs.activate(cfg.id);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${cfg.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="text-sm font-medium">{pc?.name || cfg.provider}</span>
                          {pc && pc.models.length > 0 ? (
                            <select
                              value={cfg.model}
                              onChange={(e) => {
                                e.stopPropagation();
                                providerConfigs.update(cfg.id, { model: e.target.value });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-6 rounded border text-xs px-1 bg-transparent"
                            >
                              {pc.models.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              {!pc.models.includes(cfg.model) && (
                                <option value={cfg.model}>{cfg.model}</option>
                              )}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">{cfg.model}</span>
                          )}
                          {cfg.is_active && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Active</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {pc?.requiresApiKey && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingId(isEditing ? null : cfg.id);
                                setEditApiKey("");
                              }}
                            >
                              <Settings className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:text-destructive"
                            onClick={() => providerConfigs.remove(cfg.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {cfg.api_key && (
                        <p className="text-xs text-muted-foreground mt-1 ml-5">{cfg.api_key}</p>
                      )}
                      {/* Inline edit for API key */}
                      {isEditing && (
                        <div className="flex items-center gap-2 mt-2 ml-5" onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="password"
                            value={editApiKey}
                            onChange={(e) => setEditApiKey(e.target.value)}
                            placeholder="New API key"
                            className="h-7 text-xs flex-1"
                          />
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!editApiKey.trim()}
                            onClick={async () => {
                              await providerConfigs.update(cfg.id, { api_key: editApiKey });
                              setEditingId(null);
                              setEditApiKey("");
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                      {/* Claude Code auth status */}
                      {cfg.provider === "claude-code" && (
                        <div className="mt-2 ml-5" onClick={(e) => e.stopPropagation()}>
                          {claudeCode.status.authenticated ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Check className="h-3 w-3 text-green-500" />
                              Authenticated{claudeCode.status.account ? ` as ${claudeCode.status.account}` : ""}
                            </span>
                          ) : claudeCode.loginUrl ? (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">1. Open this link and sign in:</p>
                              <a href={claudeCode.loginUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary underline flex items-center gap-1">
                                Sign in with Claude <ExternalLink className="h-3 w-3" />
                              </a>
                              {claudeCode.needsCode && (
                                <>
                                  <p className="text-xs text-muted-foreground mt-2">2. Paste the code shown after sign-in:</p>
                                  <div className="flex items-center gap-2">
                                    <Input value={claudeLoginCode} onChange={(e) => setClaudeLoginCode(e.target.value)}
                                      placeholder="Paste authorization code" className="h-7 text-xs flex-1" />
                                    <Button size="sm" className="h-7 text-xs"
                                      disabled={!claudeLoginCode.trim() || claudeCode.submitting}
                                      onClick={async () => {
                                        await claudeCode.submitCode(claudeLoginCode.trim());
                                        setClaudeLoginCode("");
                                      }}>
                                      {claudeCode.submitting ? "Verifying..." : "Submit"}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs"
                              disabled={claudeCode.loading} onClick={claudeCode.startLogin}>
                              {claudeCode.loading ? "Starting..." : "Sign in with Claude"}
                            </Button>
                          )}
                        </div>
                      )}
                      {/* Copilot auth status */}
                      {cfg.provider === "copilot" && (
                        <div className="mt-2 ml-5" onClick={(e) => e.stopPropagation()}>
                          {copilot.status.authenticated ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Check className="h-3 w-3 text-green-500" />
                              Authenticated{copilot.status.account ? ` as ${copilot.status.account}` : ""}
                            </span>
                          ) : copilot.loginUrl ? (
                            <div className="space-y-2">
                              <a href={copilot.loginUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary underline flex items-center gap-1">
                                Open GitHub <ExternalLink className="h-3 w-3" />
                              </a>
                              {copilot.userCode && (
                                <code className="px-2 py-1 bg-muted rounded font-mono text-sm tracking-wider">
                                  {copilot.userCode}
                                </code>
                              )}
                              {copilot.polling && <p className="text-xs text-muted-foreground">Waiting...</p>}
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                              disabled={copilot.loading} onClick={copilot.startLogin}>
                              <Github className="h-3 w-3" />
                              {copilot.loading ? "Starting..." : "Sign in with GitHub"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {providerConfigs.configs.length === 0 && !providerConfigs.loading && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No providers configured yet. Add one below.
                  </p>
                )}
              </div>

              {/* Add provider form */}
              {showAddProvider ? (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Add Provider</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddProvider(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <select
                    value={newProvider}
                    onChange={(e) => {
                      const p = e.target.value as Provider;
                      setNewProvider(p);
                      const pc = PROVIDERS.find((x) => x.id === p);
                      setNewModel(pc?.models[0] || "");
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {(() => {
                    const pc = PROVIDERS.find((p) => p.id === newProvider);
                    return (
                      <>
                        {pc && pc.models.length > 0 ? (
                          <select value={newModel} onChange={(e) => setNewModel(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                            {pc.models.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Model name" />
                        )}
                        {pc?.requiresApiKey && (
                          <Input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="API key" />
                        )}
                        {pc?.requiresBaseUrl && (
                          <Input value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} placeholder="Base URL" />
                        )}
                      </>
                    );
                  })()}
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!newModel || addingProvider}
                    onClick={async () => {
                      setAddingProvider(true);
                      try {
                        await providerConfigs.create({
                          provider: newProvider,
                          model: newModel,
                          api_key: newApiKey || undefined,
                          base_url: newBaseUrl || undefined,
                        });
                        setShowAddProvider(false);
                        setNewApiKey("");
                        setNewBaseUrl("");
                      } finally {
                        setAddingProvider(false);
                      }
                    }}
                  >
                    {addingProvider ? "Adding..." : "Add Provider"}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-1 w-full" onClick={() => setShowAddProvider(true)}>
                  <Plus className="h-3 w-3" />
                  Add Provider
                </Button>
              )}

              <Separator />

              {/* Custom AI Rules */}
              <div className="space-y-2">
                <Label>Custom AI Rules</Label>
                <textarea
                  value={aiRules}
                  onChange={(e) => setAiRules(e.target.value)}
                  placeholder="Override default AI rules (tech stack, coding style, etc.)"
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use defaults (React + TypeScript + Tailwind + shadcn/ui)
                </p>
              </div>
            </div>
          )}

          {activeSection === "agent" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Agent</h2>
                <p className="text-sm text-muted-foreground">
                  Configure autonomous agent behavior and limits.
                </p>
              </div>
              <Separator />

              {/* Auto-approve */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-approve">Auto-approve tool calls</Label>
                  <p className="text-xs text-muted-foreground">
                    Skip consent prompts and automatically approve all tool
                    calls.
                  </p>
                </div>
                <Switch
                  id="auto-approve"
                  checked={autoApprove}
                  onCheckedChange={setAutoApprove}
                />
              </div>

              <Separator />

              {/* Max chat turns */}
              <div className="space-y-2">
                <Label htmlFor="max-steps">Max chat turns</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum number of agent loop steps per message (default: 25).
                </p>
                <Input
                  id="max-steps"
                  type="number"
                  min={1}
                  max={100}
                  value={maxSteps}
                  onChange={(e) =>
                    setMaxSteps(parseInt(e.target.value) || 25)
                  }
                  className="w-24"
                />
              </div>

              {/* Max tool call steps */}
              <div className="space-y-2">
                <Label htmlFor="max-tool-steps">Max tool call steps</Label>
                <p className="text-xs text-muted-foreground">
                  Maximum number of consecutive tool calls before pausing
                  (default: 10).
                </p>
                <Input
                  id="max-tool-steps"
                  type="number"
                  min={1}
                  max={50}
                  value={maxToolSteps}
                  onChange={(e) =>
                    setMaxToolSteps(parseInt(e.target.value) || 10)
                  }
                  className="w-24"
                />
              </div>

              <Separator />

              {/* Auto-fix problems */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-fix">Auto-fix problems</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically attempt to fix type errors and lint issues
                    after code changes.
                  </p>
                </div>
                <Switch
                  id="auto-fix"
                  checked={autoFixProblems}
                  onCheckedChange={setAutoFixProblems}
                />
              </div>
            </div>
          )}

          {activeSection === "integrations" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Integrations</h2>
                <p className="text-sm text-muted-foreground">
                  Connect external services and MCP servers.
                </p>
              </div>
              <Separator />

              {/* GitHub */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  <Label className="text-base">GitHub</Label>
                </div>
                {github.status.connected ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      Connected as {github.status.username}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={github.disconnect}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : github.deviceCode ? (
                  <div className="space-y-2 text-sm">
                    <p>Enter this code at GitHub:</p>
                    <div className="flex items-center gap-2">
                      <code className="px-3 py-1.5 bg-muted rounded font-mono text-lg tracking-wider">
                        {github.deviceCode.user_code}
                      </code>
                      <a
                        href={github.deviceCode.verification_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Open GitHub
                      </a>
                    </div>
                    {github.polling && (
                      <p className="text-xs text-muted-foreground">
                        Waiting for authorization...
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={github.startDeviceFlow}
                  >
                    <Github className="h-3.5 w-3.5" />
                    Connect GitHub
                  </Button>
                )}
              </div>

              <Separator />

              {/* MCP Servers */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  <Label className="text-base">MCP Servers</Label>
                </div>

                {mcp.servers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-sm border rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${s.enabled ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      <span className="text-xs">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({s.transport})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => mcp.toggle(s.id, !s.enabled)}
                      >
                        {s.enabled ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        onClick={() => mcp.remove(s.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <Input
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="Server name"
                    className="h-7 text-xs flex-1"
                  />
                  <select
                    value={mcpTransport}
                    onChange={(e) =>
                      setMcpTransport(e.target.value as "stdio" | "http")
                    }
                    className="h-7 rounded border text-xs px-1"
                  >
                    <option value="stdio">stdio</option>
                    <option value="http">http</option>
                  </select>
                </div>
                {mcpTransport === "stdio" ? (
                  <Input
                    value={mcpCommand}
                    onChange={(e) => setMcpCommand(e.target.value)}
                    placeholder="Command (e.g. npx -y @mcp/server)"
                    className="h-7 text-xs"
                  />
                ) : (
                  <Input
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    placeholder="Server URL (e.g. http://localhost:3100/mcp)"
                    className="h-7 text-xs"
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs w-full"
                  disabled={!mcpName.trim()}
                  onClick={async () => {
                    await mcp.create({
                      name: mcpName.trim(),
                      transport: mcpTransport,
                      command:
                        mcpTransport === "stdio" ? mcpCommand : undefined,
                      url: mcpTransport === "http" ? mcpUrl : undefined,
                    });
                    setMcpName("");
                    setMcpCommand("");
                    setMcpUrl("");
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Server
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
