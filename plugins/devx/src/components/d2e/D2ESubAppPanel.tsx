import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Play, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import * as api from "@/lib/api";
import type { App, D2EConfig, SubApp, SubAppType } from "@/lib/types";
import { toast } from "sonner";

interface D2ESubAppPanelProps {
  app: App;
}

const TYPE_SECTIONS: { type: SubAppType; heading: string }[] = [
  { type: "ui", heading: "UI" },
  { type: "function", heading: "Functions" },
  { type: "flow", heading: "Flows" },
];

export function D2ESubAppPanel({ app }: D2ESubAppPanelProps) {
  const [config, setConfig] = useState<D2EConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [externalApi, setExternalApi] = useState("");
  const [savingApi, setSavingApi] = useState(false);
  const [redetecting, setRedetecting] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.getD2E(app.id);
      setConfig(cfg);
      setExternalApi(cfg?.externalApiBase ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Data2Evidence config");
    } finally {
      setLoading(false);
    }
  }, [app.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = async (key: string) => {
    setSelecting(key);
    try {
      await api.selectD2ESubApp(app.id, key);
      await load();
    } catch {
      toast.error("Failed to select sub-app");
    } finally {
      setSelecting(null);
    }
  };

  const handleSaveApi = async () => {
    setSavingApi(true);
    try {
      await api.setD2EExternalApi(app.id, externalApi.trim());
      toast.success("External API saved");
      await load();
    } catch {
      toast.error("Failed to save external API");
    } finally {
      setSavingApi(false);
    }
  };

  const handleRedetect = async () => {
    setRedetecting(true);
    try {
      const fresh = await api.redetectD2E(app.id);
      setConfig(fresh);
      setExternalApi(fresh.externalApiBase ?? "");
      toast.success("Re-detected sub-apps");
    } catch {
      toast.error("Redetect failed");
    } finally {
      setRedetecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading sub-apps…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No Data2Evidence config found for this app.</p>
      </div>
    );
  }

  const renderSubApp = (sa: SubApp) => {
    const active = config.activeSubApp === sa.key;
    return (
      <div
        key={sa.key}
        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
          active ? "border-primary bg-accent/40" : "border-border"
        }`}
      >
        <input
          type="radio"
          name="d2e-active-sub-app"
          checked={active}
          disabled={selecting !== null}
          onChange={() => handleSelect(sa.key)}
          className="mt-1 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{sa.name}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{sa.framework}</Badge>
            {selecting === sa.key && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="text-xs text-muted-foreground truncate">{sa.dir}</div>
          {sa.notes && <p className="text-xs text-muted-foreground mt-1">{sa.notes}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled
          title="wired in Phase 1"
          className="shrink-0"
        >
          <Play className="h-3.5 w-3.5 mr-1.5" /> Run
        </Button>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Data2Evidence</div>
            <div className="text-xs text-muted-foreground truncate">
              {config.repo} · <span className="capitalize">{config.repoKind}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRedetect} disabled={redetecting} className="shrink-0">
          {redetecting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Redetect
        </Button>
      </div>

      {/* External API */}
      <div className="space-y-2">
        <Label htmlFor="d2e-external-api">External API base</Label>
        <div className="flex gap-2">
          <Input
            id="d2e-external-api"
            placeholder="https://localhost:41100"
            value={externalApi}
            onChange={(e) => setExternalApi(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveApi()}
          />
          <Button variant="outline" size="sm" onClick={handleSaveApi} disabled={savingApi} className="shrink-0">
            {savingApi ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          URL of a separately-running d2e stack that UIs and functions call for live data.
        </p>
      </div>

      {/* Sub-apps grouped by type */}
      {config.subApps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runnable sub-apps detected.</p>
      ) : (
        TYPE_SECTIONS.map(({ type, heading }) => {
          const items = config.subApps.filter((s) => s.type === type);
          if (items.length === 0) return null;
          return (
            <div key={type} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{heading}</h3>
              <div className="space-y-2">{items.map(renderSubApp)}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
