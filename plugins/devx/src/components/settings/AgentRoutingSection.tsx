import { toast } from "sonner";
import { useAgentModelSelection } from "@/hooks/useAgentModelSelection";
import { useProviderConfigs } from "@/hooks/useProviderConfigs";
import type { AgentName } from "@/lib/types";

const AGENTS: { id: AgentName; label: string; description: string }[] = [
  { id: "devx", label: "devx", description: "This coding workbench, when not running the built-in Claude Code engine." },
  { id: "claw", label: "claw", description: "The Discord facilitator bot." },
  { id: "d2esupport", label: "d2esupport", description: "The Slack support triage bot." },
];

export function AgentRoutingSection() {
  const { configs, loading: configsLoading } = useProviderConfigs();
  const { selections, loading: selectionsLoading, setSelection } = useAgentModelSelection();

  if (configsLoading || selectionsLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const handleChange = async (agent: AgentName, providerConfigId: string) => {
    if (!providerConfigId) return;
    try {
      await setSelection(agent, providerConfigId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update assignment");
    }
  };

  return (
    <section>
      <h3 className="text-base font-medium mb-1">Agent model assignment</h3>
      <p className="text-sm text-muted-foreground mb-3">
        Pick which stored provider config each agent runs on. Claude Code is only available to devx.
      </p>
      <div className="space-y-3">
        {AGENTS.map(({ id, label, description }) => {
          const options = configs.filter((c) => id === "devx" || c.provider !== "claude-code");
          const current = selections[id]?.providerConfigId ?? "";
          return (
            <div key={id} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{description}</div>
              </div>
              <select
                className="flex-1 h-9 rounded-md border bg-background px-2 text-sm"
                value={current}
                onChange={(e) => handleChange(id, e.target.value)}
              >
                <option value="" disabled>Select a provider config…</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || `${c.provider} / ${c.model}`}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
