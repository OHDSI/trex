import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Plus, ChevronDown, Trash2, Settings2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { App } from "@/lib/types";
import { AppCreateDialog } from "./AppCreateDialog";

interface AppSelectorProps {
  apps: App[];
  loading?: boolean;
  activeAppId: string | null;
  onSelectApp: (appId: string | null) => void;
  onCreateApp: (name: string, template?: string) => Promise<App>;
  onDeleteApp: (appId: string) => Promise<void>;
}

export function AppSelector({
  apps,
  loading,
  activeAppId,
  onSelectApp,
  onCreateApp,
  onDeleteApp,
}: AppSelectorProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const activeApp = apps.find((a) => a.id === activeAppId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 max-w-48" disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Box className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{loading ? "Loading apps..." : activeApp ? activeApp.name : "No app"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => onSelectApp(null)}>
            <span className="opacity-60">No app (free chat)</span>
          </DropdownMenuItem>
          {apps.length > 0 && <DropdownMenuSeparator />}
          {apps.map((app) => (
            <DropdownMenuItem
              key={app.id}
              className="flex items-center justify-between group"
              onClick={() => onSelectApp(app.id)}
            >
              <span className="truncate">{app.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  className="hover:text-foreground p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/apps/${app.id}`);
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  className="hover:text-destructive p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteApp(app.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            New App
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AppCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateApp={onCreateApp}
      />
    </>
  );
}
