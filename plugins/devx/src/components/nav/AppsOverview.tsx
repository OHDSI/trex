import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Plus, Trash2, Settings2, Search, MessageSquareDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppCreateDialog } from "@/components/AppCreateDialog";
import type { App } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AppsOverviewProps {
  apps: App[];
  loading?: boolean;
  onOpenApp: (appId: string) => void;
  onOpenFreeChat: () => void;
  onCreateApp: (name: string, opts?: { template?: string; gitUrl?: string }) => Promise<App>;
  onDeleteApp: (appId: string) => Promise<void>;
  settingsAction?: React.ReactNode;
}

export function AppsOverview({ apps, loading, onOpenApp, onOpenFreeChat, onCreateApp, onDeleteApp, settingsAction }: AppsOverviewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const filtered = apps.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            className="w-full rounded-md border bg-transparent pl-7 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New app
        </Button>
        {settingsAction}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <button
          onClick={onOpenFreeChat}
          className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent text-muted-foreground"
        >
          <MessageSquareDashed className="h-4 w-4 shrink-0" />
          Quick chat — no app
        </button>

        {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading apps…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No apps yet. Create one to get started.</p>
        )}

        {filtered.map((app) => (
          <div
            key={app.id}
            className={cn("group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-accent")}
            onClick={() => onOpenApp(app.id)}
          >
            <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{app.name}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                className="hover:text-foreground p-1"
                onClick={(e) => { e.stopPropagation(); navigate(`/apps/${app.id}`); }}
                aria-label="App settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              <button
                className="hover:text-destructive p-1"
                onClick={(e) => { e.stopPropagation(); void onDeleteApp(app.id); }}
                aria-label="Delete app"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AppCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreateApp={onCreateApp} />
    </div>
  );
}
