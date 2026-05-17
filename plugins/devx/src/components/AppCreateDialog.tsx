import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2 } from "lucide-react";
import type { App } from "@/lib/types";

const TEMPLATES = [
  { id: "react-vite", name: "React", description: "React + TypeScript + Tailwind CSS", icon: "R", category: "Frontend", color: "from-blue-500/20 to-cyan-500/20" },
  { id: "nextjs", name: "Next.js", description: "Full-stack React framework with SSR", icon: "N", category: "Full-stack", color: "from-gray-900/20 to-gray-600/20" },
  { id: "vue-vite", name: "Vue", description: "Vue 3 + TypeScript + Vite", icon: "V", category: "Frontend", color: "from-green-500/20 to-emerald-500/20" },
  { id: "d2e-researcher-plugin", name: "D2E Researcher", description: "Full-stack single-spa researcher portal plugin", icon: "R", category: "D2E", color: "from-indigo-500/20 to-blue-500/20" },
  { id: "d2e-admin-plugin", name: "D2E Admin", description: "Full-stack single-spa admin portal plugin", icon: "A", category: "D2E", color: "from-indigo-500/20 to-purple-500/20" },
  { id: "atlas-plugin", name: "Atlas Plugin", description: "OHDSI Atlas plugin with Vue 3 + Vuetify + WebAPI", icon: "A", category: "Atlas", color: "from-teal-500/20 to-blue-500/20" },
  { id: "strategus-study", name: "Strategus Study", description: "OHDSI observational study with Strategus + HADES", icon: "S", category: "OHDSI", color: "from-orange-500/20 to-red-500/20" },
  { id: "blank", name: "Blank", description: "Empty project with package.json", icon: "+", category: "Other", color: "from-gray-500/20 to-gray-400/20" },
];

interface AppCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateApp: (name: string, template?: string) => Promise<App>;
}

const CREATION_PHASES = [
  "Creating project...",
  "Setting up workspace...",
  "Scaffolding template...",
  "Configuring dev tools...",
  "Installing dependencies...",
];

export function AppCreateDialog({ open, onOpenChange, onCreateApp }: AppCreateDialogProps) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("react-vite");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  // Cycle through phases while creating
  useEffect(() => {
    if (creating) {
      setPhase(0);
      phaseTimer.current = setInterval(() => {
        setPhase((p) => Math.min(p + 1, CREATION_PHASES.length - 1));
      }, 600);
    } else {
      clearInterval(phaseTimer.current);
    }
    return () => clearInterval(phaseTimer.current);
  }, [creating]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setDone(false);
    setError(null);
    try {
      await onCreateApp(name.trim(), template);
      setDone(true);
      // Brief success state before closing
      setTimeout(() => {
        setName("");
        setTemplate("react-vite");
        setDone(false);
        onOpenChange(false);
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create app";
      setError(msg.includes("401") ? "Not authenticated. Please sign in and try again." : msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New App</DialogTitle>
          <DialogDescription>Choose a name and template for your new app.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">App Name</Label>
            <Input
              id="app-name"
              placeholder="My App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`relative flex flex-col items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                    template === t.id
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary bg-gradient-to-br"
                      : "border-border hover:border-primary/50 bg-gradient-to-br"
                  } ${t.color}`}
                >
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {t.category}
                    </Badge>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-background/80 flex items-center justify-center text-sm font-bold shrink-0">
                    {t.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {(creating || done) && (
            <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-muted/50 border">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              )}
              <span className="text-sm text-muted-foreground">
                {done ? "App created successfully!" : CREATION_PHASES[phase]}
              </span>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={!name.trim() || creating || done}
          >
            {creating ? "Creating..." : done ? "Done" : "Create App"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
