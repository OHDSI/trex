import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SupabaseStatus,
  SupabaseDeployConfig,
  SupabaseProject,
  Deployment,
  DeployStep,
} from "@/lib/types";
import * as api from "@/lib/api";

export function useSupabaseDeploy(appId: string | null) {
  const [status, setStatus] = useState<SupabaseStatus>({ connected: false });
  const [config, setConfig] = useState<SupabaseDeployConfig>({ target: "local", project_id: null });
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getSupabaseStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    if (!appId) return;
    try {
      const c = await api.getDeployConfig(appId);
      setConfig(c);
    } catch {
      setConfig({ target: "local", project_id: null });
    }
  }, [appId]);

  const refreshDeployments = useCallback(async () => {
    if (!appId) return;
    try {
      const d = await api.listDeployments(appId);
      setDeployments(d);
    } catch {
      setDeployments([]);
    }
  }, [appId]);

  const refreshProjects = useCallback(async () => {
    try {
      const p = await api.listSupabaseProjects();
      setProjects(p);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    refreshConfig();
    refreshDeployments();
  }, [refreshConfig, refreshDeployments]);

  const connectCloud = useCallback(async (accessToken: string) => {
    await api.connectSupabase(accessToken);
    setStatus({ connected: true });
    await refreshProjects();
  }, [refreshProjects]);

  const disconnectCloud = useCallback(async () => {
    await api.disconnectSupabase();
    setStatus({ connected: false });
    setProjects([]);
  }, []);

  const saveConfig = useCallback(async (newConfig: SupabaseDeployConfig) => {
    if (!appId) return;
    await api.saveDeployConfig(appId, newConfig);
    setConfig(newConfig);
  }, [appId]);

  const deploy = useCallback(() => {
    if (!appId || isDeploying) return;
    setIsDeploying(true);
    setSteps([]);
    setLogs([]);

    controllerRef.current = api.streamDeploy(appId, {
      onStep: (step) => {
        setSteps((prev) => {
          const existing = prev.findIndex((s) => s.name === step.name);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = step;
            return updated;
          }
          return [...prev, step];
        });
      },
      onLog: (message) => {
        setLogs((prev) => [...prev, message]);
      },
      onDone: (result) => {
        setIsDeploying(false);
        controllerRef.current = null;
        if (result.steps?.length) {
          setSteps(result.steps);
        }
        refreshDeployments();
      },
    });
  }, [appId, isDeploying, refreshDeployments]);

  const cancelDeploy = useCallback(() => {
    controllerRef.current?.abort();
    setIsDeploying(false);
  }, []);

  return {
    status,
    config,
    projects,
    deployments,
    isDeploying,
    steps,
    logs,
    refreshStatus,
    refreshProjects,
    connectCloud,
    disconnectCloud,
    saveConfig,
    deploy,
    cancelDeploy,
    refreshDeployments,
  };
}
