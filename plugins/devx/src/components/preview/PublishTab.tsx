import { useState } from "react";
import {
  Download,
  Package,
  Rocket,
  Server,
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
  ChevronDown,
  ChevronRight,
  Key,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSupabaseDeploy } from "@/hooks/useSupabaseDeploy";
import type { DeployStep } from "@/lib/types";
import { toast } from "sonner";

interface PublishTabProps {
  appId: string;
}

function StepIcon({ status }: { status: DeployStep["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />;
  }
}

const STEP_LABELS: Record<string, string> = {
  resolve: "Resolve Target",
  edge_functions: "Edge Functions",
  migrations: "Database Migrations",
  build: "Build Static Site",
  upload: "Upload to Storage",
  config: "Client Config",
};

export function PublishTab({ appId }: PublishTabProps) {
  const {
    status,
    config,
    projects,
    deployments,
    isDeploying,
    steps,
    logs,
    connectCloud,
    disconnectCloud,
    saveConfig,
    deploy,
    cancelDeploy,
    refreshProjects: _refreshProjects,
  } = useSupabaseDeploy(appId);

  const [accessToken, setAccessToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const handleConnect = async () => {
    if (!accessToken.trim()) return;
    setConnecting(true);
    try {
      await connectCloud(accessToken.trim());
      setAccessToken("");
      toast.success("Connected to Supabase");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectCloud();
    if (config.target === "cloud") {
      await saveConfig({ target: "local", project_id: null });
    }
    toast.success("Disconnected from Supabase");
  };

  const handleTargetChange = async (target: "local" | "cloud") => {
    await saveConfig({ ...config, target, project_id: target === "local" ? null : config.project_id });
  };

  const handleProjectChange = async (projectId: string) => {
    await saveConfig({ ...config, project_id: projectId });
  };

  const handleDeploy = () => {
    if (config.target === "cloud" && !config.project_id) {
      toast.error("Select a Supabase project first");
      return;
    }
    deploy();
  };

  const handleExportZip = () => {
    window.open(`/api/apps/${appId}/export`, "_blank");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 text-xs font-medium">
        <Package className="h-3.5 w-3.5" />
        Export & Deploy
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Deploy Target */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Deploy Target</h3>
          <div className="flex gap-2">
            <Button
              variant={config.target === "local" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 flex-1"
              onClick={() => handleTargetChange("local")}
            >
              <Server className="h-3.5 w-3.5" />
              Local (TrexSQL)
            </Button>
            <Button
              variant={config.target === "cloud" ? "default" : "outline"}
              size="sm"
              className="gap-1.5 flex-1"
              onClick={() => handleTargetChange("cloud")}
            >
              <Cloud className="h-3.5 w-3.5" />
              Supabase Cloud
            </Button>
          </div>

          {config.target === "local" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <Server className="h-3 w-3 shrink-0" />
              <span>Deploying to the local TrexSQL instance. No additional configuration needed.</span>
              <Badge variant="outline" className="ml-auto text-green-600 border-green-600/30 shrink-0">
                Ready
              </Badge>
            </div>
          )}

          {config.target === "cloud" && (
            <div className="space-y-2">
              {!status.connected ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Enter your Supabase access token to connect. Generate one at{" "}
                    <span className="font-mono text-foreground">supabase.com/dashboard/account/tokens</span>
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="sbp_..."
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="text-xs h-8"
                      onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    />
                    <Button size="sm" className="gap-1.5 shrink-0" onClick={handleConnect} disabled={connecting || !accessToken.trim()}>
                      {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                      Connect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-green-600 border-green-600/30">Connected</Badge>
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs ml-auto" onClick={handleDisconnect}>
                      <Unplug className="h-3 w-3" />
                      Disconnect
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Project</Label>
                    <select
                      className="w-full h-8 text-xs rounded-md border bg-background px-2"
                      value={config.project_id || ""}
                      onChange={(e) => handleProjectChange(e.target.value)}
                    >
                      <option value="">Select a project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.region})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Deploy Button */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              className="gap-2 flex-1"
              onClick={handleDeploy}
              disabled={isDeploying || (config.target === "cloud" && !config.project_id)}
            >
              {isDeploying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {isDeploying ? "Deploying..." : "Deploy"}
            </Button>
            {isDeploying && (
              <Button variant="outline" onClick={cancelDeploy}>
                Cancel
              </Button>
            )}
          </div>

          {/* Step Progress */}
          {steps.length > 0 && (
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div key={step.name} className="flex items-start gap-2 text-xs">
                  <StepIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{STEP_LABELS[step.name] || step.name}</span>
                    {step.message && (
                      <p className="text-muted-foreground truncate">{step.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deploy Logs */}
          {logs.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowLogs(!showLogs)}
              >
                {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Logs ({logs.length})
              </button>
              {showLogs && (
                <div className="mt-1 bg-muted rounded-md p-2 text-xs font-mono max-h-32 overflow-auto space-y-0.5">
                  {logs.map((log, i) => (
                    <p key={i} className="text-muted-foreground">{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Deployment History */}
        <div className="space-y-2">
          <button
            className="flex items-center gap-1 text-sm font-medium hover:text-foreground"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            History
            {deployments.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{deployments.length}</Badge>
            )}
          </button>
          {showHistory && (
            <div className="space-y-1.5">
              {deployments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No deployments yet</p>
              ) : (
                deployments.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2 py-1.5">
                    <Badge
                      variant="outline"
                      className={
                        d.status === "success"
                          ? "text-green-600 border-green-600/30"
                          : d.status === "failed"
                            ? "text-red-600 border-red-600/30"
                            : "text-yellow-600 border-yellow-600/30"
                      }
                    >
                      {d.status}
                    </Badge>
                    <span className="text-muted-foreground capitalize">{d.target}</span>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Export */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Export</h3>
          <p className="text-xs text-muted-foreground">Download your project as a zip archive.</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportZip}>
            <Download className="h-3.5 w-3.5" />
            Export as ZIP
          </Button>
        </div>
      </div>
    </div>
  );
}
