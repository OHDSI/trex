import type { ToolCall } from "@/lib/types";

interface SearchToolCardProps {
  toolCall: ToolCall;
}

export function SearchToolCard({ toolCall }: SearchToolCardProps) {
  const args = toolCall.args || {};
  const pattern = (args.pattern ?? args.query ?? args.regex) as string | undefined;
  const directory = (args.path ?? args.directory) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      {pattern && (
        <div>
          <span className="text-muted-foreground">Pattern: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{pattern}</code>
        </div>
      )}
      {directory && (
        <div>
          <span className="text-muted-foreground">Directory: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{directory}</code>
        </div>
      )}
      {toolCall.result && (
        <div>
          <span className="text-muted-foreground mb-1 block">Results:</span>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
            {toolCall.result.split("\n").slice(0, 15).join("\n")}
            {toolCall.result.split("\n").length > 15 && "\n..."}
          </pre>
        </div>
      )}
    </div>
  );
}
