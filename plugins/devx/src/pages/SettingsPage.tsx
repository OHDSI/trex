import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Sparkles,
  Cpu,
  Plug,
  Github,
  GitBranch,
  Terminal,
  Check,
  Copy,
  X,
  Trash2,
  Plus,
  ExternalLink,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SupportSection } from "@/components/settings/SupportSection";
import { FigmaSection } from "@/components/settings/FigmaSection";
import { useSettings } from "@/hooks/useSettings";
import { useGitHub } from "@/hooks/useGitHub";
import { useGitSigning } from "@/hooks/useGitSigning";
import { useClaudeCode } from "@/hooks/useClaudeCode";
import { useClaudeCodeModels } from "@/hooks/useClaudeCodeModels";
import { useProviderConfigs } from "@/hooks/useProviderConfigs";
import { useMcpServers } from "@/hooks/useMcpServers";
import { useTheme } from "@/hooks/useTheme";
import {
  PROVIDERS,
  CHAT_MODES,
  type Provider,
  type ChatMode,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLanguage, setLanguage, getAvailableLanguages } from "@/lib/i18n";

type Section = "general" | "ai" | "agent" | "integrations" | "support";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "agent", label: "Agent", icon: Sparkles },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "support", label: "Support", icon: LifeBuoy },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, save, refresh: refreshSettings } = useSettings();
  const github = useGitHub();
  const gitSigning = useGitSigning();
  const claudeCode = useClaudeCode();
  const claudeCodeModels = useClaudeCodeModels();
  const providerConfigs = useProviderConfigs();
  const mcp = useMcpServers();
  const { theme, setTheme } = useTheme();

  const [activeSection, setActiveSection] = useState<Section>("general");
  const [saving, setSaving] = useState(false);
  const [claudeLoginCode, setClaudeLoginCode] = useState("");

  // AI fields. No api_key state: GET /settings returns the legacy row's key
  // masked, and this page has no field to enter a new one — the per-provider
  // key editor below (provider_configs) is the only place a credential is
  // set. Holding the mask in state is how it used to get posted straight back
  // over the real key on save.
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("");
  // base_url doubles as the AWS region for the bedrock provider. Loaded and
  // echoed back unchanged — there is no field for it here either.
  const [baseUrl, setBaseUrl] = useState("");
  const [aiRules, setAiRules] = useState("");

  // Agent fields
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxSteps, setMaxSteps] = useState(100);
  const [maxToolSteps, setMaxToolSteps] = useState(10);
  const [autoFixProblems, setAutoFixProblems] = useState(false);

  // General fields
  const [defaultChatMode, setDefaultChatMode] = useState<ChatMode>("agent");
  const [loop, setLoop] = useState<"legacy" | "agents">("legacy");
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
  const [encryptingKeys, setEncryptingKeys] = useState(false);

  // Git identity + signing fields
  const [gitAuthorName, setGitAuthorName] = useState("");
  const [gitAuthorEmail, setGitAuthorEmail] = useState("");
  const [showImportKey, setShowImportKey] = useState(false);
  const [importKeyText, setImportKeyText] = useState("");

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
      setLoop(settings.loop ?? "legacy");
      setGitAuthorName(settings.git_author_name || "");
      setGitAuthorEmail(settings.git_author_email || "");
    }
  }, [settings]);

  // Refresh SDK auth status when provider changes to a subscription provider
  useEffect(() => {
    if (provider === "claude-code") claudeCode.refreshStatus();
  }, [provider]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // api_key is deliberately absent from this payload, and PUT /settings
      // leaves the stored credential untouched when the field is omitted. The
      // value this page loads is the server's mask, not a key, so sending it
      // back would overwrite the real credential with its own mask — and once
      // DEVX_ENCRYPTION_KEY is configured that mask gets encrypted and the
      // damage becomes indistinguishable from a genuine key.
      //
      // base_url round-trips as loaded (for bedrock it carries the region);
      // this page has no field for it either, so it is echoed, not composed
      // from defaults.
      await save({
        provider,
        model,
        base_url: baseUrl,
        ai_rules: aiRules || undefined,
        auto_approve: autoApprove,
        max_steps: maxSteps,
        max_tool_steps: maxToolSteps,
        auto_fix_problems: autoFixProblems,
        loop,
        git_author_name: gitAuthorName || undefined,
        git_author_email: gitAuthorEmail || undefined,
      });
      toast.success("Settings saved");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Backfill: the only way stored plaintext keys actually become encrypted
  // (new writes are encrypted going forward, but existing rows aren't touched
  // until this runs). Covers both stores — the provider configs above and the
  // legacy settings row behind them — so the counts reported here are totals;
  // which table a key sits in isn't something a user should have to reason
  // about. See routes/provider_config_routes.ts's
  // POST /provider-configs/encrypt-existing.
  const handleEncryptExistingKeys = async () => {
    setEncryptingKeys(true);
    try {
      const result = await providerConfigs.encryptExisting();
      // The settings row's own is_plaintext flag drives half of this button's
      // visibility, and it only changes on a settings refetch — encryptExisting
      // refreshes the provider configs but knows nothing about this hook.
      await refreshSettings();
      if (!result.encryptionConfigured) {
        toast.error("Server has no encryption key configured — keys were not migrated.");
      } else if (result.migrated > 0) {
        toast.success(`Encrypted ${result.migrated} stored key${result.migrated === 1 ? "" : "s"}.`);
      } else {
        toast.success("Nothing to migrate — all stored keys are already encrypted.");
      }
    } catch (err) {
      console.error("Failed to encrypt existing keys:", err);
      toast.error("Failed to encrypt existing keys");
    } finally {
      setEncryptingKeys(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
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

              {/* task-u1: devx.settings.loop coexistence flag — 'legacy' is
                  the hand-rolled SSE loop (functions/agent.ts), 'agents' is
                  the ported eve/agents runtime (plugins/devx/agent/). Forced
                  back to legacy regardless of this setting when the active
                  provider is claude-code (see useEffectiveLoop.ts) -
                  noted inline since the toggle would otherwise look like a
                  no-op for those users. */}
              <div className="space-y-2">
                <Label>Chat Engine (experimental)</Label>
                <select
                  value={loop}
                  onChange={(e) => setLoop(e.target.value as "legacy" | "agents")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="legacy">Legacy</option>
                  <option value="agents">Agents (experimental)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Agents mode is forced back to Legacy for the Claude Code provider.
                  Takes effect on your next chat open.
                </p>
              </div>
            </div>
          )}

          {activeSection === "ai" && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold mb-1">AI Providers</h2>
                  <p className="text-sm text-muted-foreground">
                    Configure multiple AI providers. Click to activate.
                  </p>
                </div>
                {/* Only new writes are encrypted automatically — existing
                    plaintext rows need this backfill to actually become
                    encrypted. Shown only when there's something to migrate,
                    which includes the legacy settings row: a user who predates
                    the multi-provider UI can have their only plaintext key
                    there, with no provider config to raise the flag. */}
                {(providerConfigs.configs.some((c) => c.is_plaintext) || settings?.is_plaintext) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={encryptingKeys}
                    onClick={handleEncryptExistingKeys}
                  >
                    {encryptingKeys ? "Encrypting..." : "Encrypt stored keys"}
                  </Button>
                )}
              </div>
              <Separator />

              {/* The legacy settings row holds an encrypted credential the
                  server can't currently open (rotated or missing encryption
                  key). It shows up nowhere else on this page — the provider
                  list below is a different store — so without this the user
                  sees a perfectly healthy Settings page while every turn that
                  falls back to that key fails with "Invalid API key".
                  The wording deliberately stops short of promising that adding
                  a provider fixes this for everyone: bedrock is declared
                  requiresApiKey: false (lib/types.ts), which gates both the
                  add-form key input and the inline editor's pencil, so a
                  bedrock user has no field to enter a replacement in anywhere
                  on this page. */}
              {settings?.key_status === "undecryptable" && (
                <p className="text-xs text-yellow-600">
                  A previously stored API key can't be decrypted — the server's
                  encryption key may have changed, so any request that falls back
                  to it will fail. For providers with an API key field below,
                  adding one with a fresh key replaces it. AWS Bedrock
                  credentials have no entry field here yet, and can only be
                  recovered by restoring the server's previous encryption key.
                </p>
              )}

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
                      {/* An undecryptable row (server has an encrypted credential it
                          can't currently open — usually a rotated or missing
                          DEVX_ENCRYPTION_KEY) shows no api_key above, which looks
                          identical to "never had a key" while turns using this
                          provider fail with "Invalid API key". Name the real cause
                          and the fix so this isn't a silent dead end. */}
                      {cfg.key_status === "undecryptable" && (
                        <p className="text-xs text-yellow-600 mt-1 ml-5">
                          Stored key can't be decrypted — the server's encryption key
                          may have changed. Re-enter the API key below to fix it.
                        </p>
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
                    const isClaudeCode = newProvider === "claude-code";
                    const dynamicOptions = claudeCodeModels.models; // ModelInfo[]
                    return (
                      <>
                        {isClaudeCode ? (
                          claudeCodeModels.loading ? (
                            <select disabled className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                              <option>Loading models…</option>
                            </select>
                          ) : (
                            <select value={newModel} onChange={(e) => setNewModel(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                              {dynamicOptions.map((m) => <option key={m.value} value={m.value}>{m.displayName}</option>)}
                            </select>
                          )
                        ) : pc && pc.models.length > 0 ? (
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

              <FigmaSection />
              <Separator />

              {/* GitHub — two independent credentials, see the copy below */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  <Label className="text-base">GitHub</Label>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Account connection</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Authorizes devx itself to clone, pull and push your repositories and to
                      create a repo for an app. The token is stored encrypted in this deployment.
                    </p>
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

                {/* The container's `gh` binary — a different credential store
                    (~/.config/gh) from the account connection above. */}
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-sm">
                      Command line (<code className="font-mono text-xs">gh</code>)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Signs in the GitHub CLI installed in this container. The coder shells out
                      to it to open pull requests and read review threads, and derives the commit
                      identity for the branches it pushes from it. This is a separate credential
                      from the account connection above — authorizing one does not authorize the
                      other, and both are usually wanted.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Unlike the account connection, which is yours alone, this one is shared by
                      everyone on this deployment: there is a single{" "}
                      <code className="font-mono text-xs">gh</code> installation, so whoever signs
                      in last is the account all coder pull requests and pushes are attributed to,
                      and signing out signs everyone out. A coder that is already running keeps its
                      old commit identity until it is restarted.
                    </p>
                  </div>

                  {!github.cliChecked ? (
                    <p className="text-sm text-muted-foreground">Checking...</p>
                  ) : !github.cliStatus.installed ? (
                    <div className="space-y-2">
                      {/* installed:false is also what a broken shell bridge
                          looks like, so say which one this is. */}
                      {github.cliStatus.error ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Could not check the <code className="font-mono text-xs">gh</code> CLI,
                            so its state is unknown.
                          </p>
                          <p className="text-xs text-destructive break-all">
                            {github.cliStatus.error}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          The <code className="font-mono text-xs">gh</code> CLI is not available in
                          this container, so pull-request tooling will not work here.
                        </p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={github.refreshCliStatus}
                      >
                        Check again
                      </Button>
                    </div>
                  ) : github.cliStatus.authenticated ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5 text-green-500" />
                          Signed in as {github.cliStatus.account || "an unknown account"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={github.cliBusy}
                          onClick={github.signOutCli}
                        >
                          Sign out
                        </Button>
                      </div>
                      {github.cliStatus.scopes && (
                        <p className="text-xs text-muted-foreground">
                          Scopes: {github.cliStatus.scopes}
                        </p>
                      )}
                      {/* A refused sign-out leaves us in this branch, so the
                          reason has to render here too — the error branch
                          below is unreachable while still authenticated. */}
                      {github.cliLogin?.status === "error" && github.cliLogin.message && (
                        <p className="text-xs text-destructive">{github.cliLogin.message}</p>
                      )}
                    </div>
                  ) : github.cliLogin?.status === "pending" ? (
                    <div className="space-y-2 text-sm">
                      {github.cliLogin.user_code ? (
                        <>
                          <p>Enter this code at GitHub to authorize the CLI:</p>
                          <div className="flex items-center gap-2">
                            <code className="px-3 py-1.5 bg-muted rounded font-mono text-lg tracking-wider">
                              {github.cliLogin.user_code}
                            </code>
                            <a
                              href={github.cliLogin.login_url || "https://github.com/login/device"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary underline"
                            >
                              Open GitHub
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={github.cancelCliAuth}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        // The URL parsed but the code did not. Sending the user
                        // to GitHub with a placeholder in the code box would be
                        // worse than telling them the code is on the far side.
                        <div className="flex items-center gap-2">
                          <a
                            href={github.cliLogin.login_url || "https://github.com/login/device"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            Open GitHub to authorize the CLI
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={github.cancelCliAuth}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Waiting for authorization...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {github.cliLogin?.message && (
                        <p className="text-xs text-destructive">{github.cliLogin.message}</p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={github.cliBusy}
                        onClick={github.startCliAuth}
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        {github.cliBusy ? "Starting..." : "Authenticate gh CLI"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Git — author identity + commit signing */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  <Label className="text-base">Git</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Author identity and SSH commit signing for every commit devx makes in your apps.
                  Saved with the Save button above; the signing key applies immediately.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="git-author-name" className="text-xs">Author name</Label>
                    <Input
                      id="git-author-name"
                      placeholder="Jane Doe"
                      value={gitAuthorName}
                      onChange={(e) => setGitAuthorName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="git-author-email" className="text-xs">Author email</Label>
                    <Input
                      id="git-author-email"
                      type="email"
                      placeholder="jane@example.com"
                      value={gitAuthorEmail}
                      onChange={(e) => setGitAuthorEmail(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  For a Verified badge on GitHub, the email must belong to the account that registers the signing key.
                </p>

                {gitSigning.status.configured ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      Signing key configured
                      {gitSigning.status.source && <span className="text-xs">({gitSigning.status.source})</span>}
                    </div>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 px-2 py-1.5 bg-muted rounded font-mono text-[11px] break-all">
                        {gitSigning.status.public_key}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Copy public key"
                        onClick={() => {
                          navigator.clipboard.writeText(gitSigning.status.public_key || "");
                          toast.success("Public key copied");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {gitSigning.status.fingerprint && (
                      <p className="text-xs text-muted-foreground font-mono">{gitSigning.status.fingerprint}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Register this as a <strong>Signing Key</strong> on{" "}
                      <a
                        href="https://github.com/settings/ssh/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline inline-flex items-center gap-0.5"
                      >
                        GitHub → SSH and GPG keys <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      so your commits show as Verified.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={gitSigning.busy}
                        onClick={() => {
                          if (confirm("Rotate the signing key? The current key stops signing and must be replaced on GitHub.")) {
                            gitSigning.generate();
                          }
                        }}
                      >
                        Rotate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-700"
                        disabled={gitSigning.busy}
                        onClick={() => {
                          if (confirm("Remove the signing key? New commits will no longer be signed.")) {
                            gitSigning.remove();
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={gitSigning.busy}
                        onClick={gitSigning.generate}
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        {gitSigning.busy ? "Working..." : "Generate signing key"}
                      </Button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setShowImportKey((v) => !v)}
                      >
                        {showImportKey ? "cancel" : "paste an existing key instead"}
                      </button>
                    </div>
                    {showImportKey && (
                      <div className="space-y-2">
                        <textarea
                          className="w-full h-28 px-3 py-2 text-xs font-mono rounded-md border bg-background"
                          placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n(unencrypted ed25519 key)\n-----END OPENSSH PRIVATE KEY-----"}
                          value={importKeyText}
                          onChange={(e) => setImportKeyText(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={gitSigning.busy || !importKeyText.trim()}
                          onClick={async () => {
                            await gitSigning.importKey(importKeyText);
                            setImportKeyText("");
                            setShowImportKey(false);
                          }}
                        >
                          Import key
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {gitSigning.warning && (
                  <p className="text-xs text-yellow-600">{gitSigning.warning}</p>
                )}
                {gitSigning.error && (
                  <p className="text-xs text-red-500">{gitSigning.error}</p>
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

          {activeSection === "support" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Support</h2>
                <p className="text-sm text-muted-foreground">
                  GitHub/Discord developer mapping and the Slack allowlist for data2evidence support requests.
                </p>
              </div>
              <Separator />
              <SupportSection />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
