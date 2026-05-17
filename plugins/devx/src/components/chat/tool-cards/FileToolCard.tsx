import type { ToolCall } from "@/lib/types";

interface FileToolCardProps {
  toolCall: ToolCall;
}

export function FileToolCard({ toolCall }: FileToolCardProps) {
  const args = toolCall.args || {};
  const filePath = (args.path ?? args.file_path) as string | undefined;
  const isWriteOp = ["write_file", "edit_file", "search_replace"].includes(toolCall.name || "");
  const writeContent = (args.content ?? args.new_str ?? args.replacement) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      {filePath && (
        <div>
          <span className="text-muted-foreground">Path: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{filePath}</code>
        </div>
      )}
      {isWriteOp && writeContent && (
        <div>
          <span className="text-muted-foreground mb-1 block">Content:</span>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
            {writeContent.split("\n").slice(0, 10).join("\n")}
            {writeContent.split("\n").length > 10 && "\n..."}
          </pre>
        </div>
      )}
      {toolCall.result && (
        <div>
          <span className="text-muted-foreground mb-1 block">Result:</span>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
            {toolCall.result.split("\n").slice(0, 10).join("\n")}
            {toolCall.result.split("\n").length > 10 && "\n..."}
          </pre>
        </div>
      )}
    </div>
  );
}
