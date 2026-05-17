import { Button } from "@/components/ui/button";
import type { PendingChange } from "@/lib/visual-editing-types";

interface VisualEditingChangesDialogProps {
  changes: PendingChange[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function VisualEditingChangesDialog({
  changes,
  onConfirm,
  onCancel,
}: VisualEditingChangesDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-xl w-96 max-h-[80vh] overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-medium">Save Visual Changes</h3>
          <p className="text-xs text-muted-foreground mt-1">
            The following changes will be written to source files:
          </p>
        </div>

        <div className="px-4 py-3 space-y-2 max-h-[400px] overflow-y-auto">
          {changes.map((change) => (
            <div key={change.componentId} className="border rounded p-2 text-xs space-y-1">
              <div className="font-medium text-primary">
                &lt;{change.componentName}&gt;
              </div>
              <div className="text-muted-foreground">{change.filePath}:{change.line}</div>
              {change.styles.margin && (
                <div>Margin: {JSON.stringify(change.styles.margin)}</div>
              )}
              {change.styles.padding && (
                <div>Padding: {JSON.stringify(change.styles.padding)}</div>
              )}
              {change.styles.border && (
                <div>Border: {JSON.stringify(change.styles.border)}</div>
              )}
              {change.styles.backgroundColor && (
                <div>Background: {change.styles.backgroundColor}</div>
              )}
              {change.styles.text && (
                <div>Text: {JSON.stringify(change.styles.text)}</div>
              )}
              {change.textContent !== undefined && (
                <div>Text content: "{change.textContent}"</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Save to Files
          </Button>
        </div>
      </div>
    </div>
  );
}
