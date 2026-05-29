import { useState, useEffect, useCallback, useRef } from "react";
import { Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { App } from "@/lib/types";
import { TEMPLATE_CONFIG_FIELDS } from "@/lib/types";
import * as api from "@/lib/api";

interface PreviewConfigBarProps {
  app: App;
  onConfigChanged: (config: Record<string, string>) => void;
}

export function PreviewConfigBar({ app, onConfigChanged }: PreviewConfigBarProps) {
  const fields = TEMPLATE_CONFIG_FIELDS[app.tech_stack || ""] || [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = (app.config as Record<string, string>)?.[field.key] || "";
    }
    setValues(initial);
    setDirty(false);
  }, [app.id, app.config]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = useCallback(async () => {
    try {
      await api.updateApp(app.id, { config: values } as Partial<App>);
      setDirty(false);
      setOpen(false);
      // Restart dev server so it picks up the new .env values
      try {
        await api.restartDevServer(app.id);
      } catch { /* server may not be running */ }
      onConfigChanged(values);
    } catch (err) {
      console.error("Failed to save config:", err);
    }
  }, [app.id, values, onConfigChanged]);

  if (fields.length === 0) return null;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant={open ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(!open)}
        title="Preview settings"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-80 rounded-md border bg-popover p-3 shadow-md space-y-3">
          <p className="text-xs font-medium">Preview Settings</p>
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{field.label}</Label>
              <Input
                type={field.type || "text"}
                placeholder={field.placeholder}
                value={values[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="h-7 text-xs"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 text-xs" onClick={handleSave} disabled={!dirty}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
