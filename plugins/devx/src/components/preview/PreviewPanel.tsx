import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Code, AlertTriangle, GitBranch, ClipboardList, Package, Bot } from "lucide-react";
import { PreviewTab } from "./PreviewTab";
import { CodeTab } from "./CodeTab";
import { ProblemsTab } from "./ProblemsTab";
import { AgentsTab } from "./AgentsTab";
import { GitTab } from "./GitTab";
import { PlanTab } from "./PlanTab";
import { PublishTab } from "./PublishTab";
import { useFileTree } from "@/hooks/useFileTree";
import { useDevServer } from "@/hooks/useDevServer";
import { useGit } from "@/hooks/useGit";
import { useReviewAgents } from "@/hooks/useReviewAgents";
import { useAgentRuns } from "@/hooks/useAgentRuns";
import type { App } from "@/lib/types";
import * as api from "@/lib/api";

interface PreviewPanelProps {
  appId: string | null;
  planContent?: string | null;
  chatMode?: string;
  onEditWithAI?: (element: import("@/lib/visual-editing-types").SelectedElement) => void;
  onComponentsSelected?: (components: import("@/lib/visual-editing-types").SelectedComponent[]) => void;
  refreshSignal?: number;
  onFixPrompt?: (prompt: string) => void;
}

export function PreviewPanel({ appId, planContent, chatMode: _chatMode, onEditWithAI, onComponentsSelected, refreshSignal, onFixPrompt }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState("plan");
  const [app, setApp] = useState<App | null>(null);
  const [configRefresh, setConfigRefresh] = useState(0);
  const fileTree = useFileTree(appId);
  const devServer = useDevServer(appId);
  const git = useGit(appId);
  const reviewAgents = useReviewAgents(appId || "");
  const agentRuns = useAgentRuns(appId);

  useEffect(() => {
    if (appId) {
      api.getApp(appId).then(setApp).catch(() => {});
    } else {
      setApp(null);
    }
  }, [appId]);

  const handleConfigChanged = useCallback(() => {
    // Refresh the app data and trigger a preview refresh
    if (appId) {
      api.getApp(appId).then(setApp).catch(() => {});
    }
    setConfigRefresh((n) => n + 1);
  }, [appId]);

  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      fileTree.refresh();
      fileTree.reloadSelectedFile();
    }
  }, [refreshSignal]);

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-2 h-9 shrink-0">
          <TabsTrigger value="plan" className="gap-1.5 text-xs">
            <ClipboardList className="h-3.5 w-3.5" />
            Plans
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5 text-xs">
            <Monitor className="h-3.5 w-3.5" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-1.5 text-xs">
            <Code className="h-3.5 w-3.5" />
            Code
          </TabsTrigger>
          <TabsTrigger value="problems" className="gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            Checks
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 text-xs">
            <Bot className="h-3.5 w-3.5" />
            Agents
            {reviewAgents.runningCount > 0 && (
              <span className="ml-1 text-[10px] bg-blue-500/20 text-blue-600 px-1 rounded-full min-w-[16px] text-center">
                {reviewAgents.runningCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-1.5 text-xs">
            <GitBranch className="h-3.5 w-3.5" />
            Git
            {git.status.length > 0 && (
              <span className="ml-1 text-[10px] bg-yellow-500/20 text-yellow-600 px-1 rounded">
                {git.status.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="publish" className="gap-1.5 text-xs">
            <Package className="h-3.5 w-3.5" />
            Export
          </TabsTrigger>
        </TabsList>

        {appId && (
          <>
            <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
              <PreviewTab appId={appId} app={app} devServer={devServer} onEditWithAI={onEditWithAI} onComponentsSelected={onComponentsSelected} refreshSignal={(refreshSignal || 0) + configRefresh} appConfig={app?.config} onConfigChanged={handleConfigChanged} onOpenFile={(path) => { fileTree.selectFile(path); setActiveTab("code"); }} />
            </TabsContent>
            <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
              <CodeTab appId={appId} fileTree={fileTree} onFixPrompt={onFixPrompt} />
            </TabsContent>
            <TabsContent value="problems" className="flex-1 m-0 overflow-hidden">
              <ProblemsTab
                appId={appId}
                onOpenFile={(path) => {
                  fileTree.selectFile(path);
                  setActiveTab("code");
                }}
                onFixPrompt={onFixPrompt}
                reviewAgents={reviewAgents}
              />
            </TabsContent>
            <TabsContent value="agents" className="flex-1 m-0 overflow-hidden">
              <AgentsTab
                agents={reviewAgents.agents}
                onStop={reviewAgents.stopAgent}
                agentRuns={agentRuns.runStates}
                onExpandRun={agentRuns.loadMessages}
                onStopRun={agentRuns.stopRun}
              />
            </TabsContent>
            <TabsContent value="git" className="flex-1 m-0 overflow-hidden">
              <GitTab git={git} appId={appId} />
            </TabsContent>
            <TabsContent value="plan" className="flex-1 m-0 overflow-hidden">
              <PlanTab appId={appId} livePlanContent={planContent} onFixPrompt={onFixPrompt} />
            </TabsContent>
            <TabsContent value="publish" className="flex-1 m-0 overflow-hidden">
              <PublishTab appId={appId} />
            </TabsContent>
          </>
        )}
        {!appId && (
          <TabsContent value="plan" className="flex-1 m-0 overflow-hidden">
            <PlanTab appId={null} livePlanContent={planContent} onFixPrompt={onFixPrompt} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
