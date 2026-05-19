import { Monitor } from "lucide-react";

export function PreviewPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20">
      <div className="text-center text-muted-foreground">
        <Monitor className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Preview Panel</p>
        <p className="text-xs mt-1">Coming in Phase 5</p>
      </div>
    </div>
  );
}
