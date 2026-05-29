import { Bot, ShieldCheck, Check, Ban, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConsentRequest } from "@/lib/types";

interface AgentConsentBannerProps {
  consent: ConsentRequest;
  error?: string | null;
  onDecision: (decision: "allow" | "deny" | "always") => void;
}

export function AgentConsentBanner({ consent, error, onDecision }: AgentConsentBannerProps) {
  return (
    <div className="mx-3 mb-2 rounded-lg border bg-muted/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          Agent wants to use: <strong>{consent.toolName}</strong>
        </span>
      </div>
      {consent.inputPreview && (
        <pre className="text-xs text-muted-foreground bg-background rounded p-2 mb-2 overflow-x-auto max-h-24 overflow-y-auto">
          {consent.inputPreview}
        </pre>
      )}
      {error && (
        <div className="flex items-center gap-2 mb-2 rounded bg-destructive/10 border border-destructive/20 px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onDecision("always")}
        >
          <ShieldCheck className="h-3 w-3 mr-1" />
          Always allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onDecision("allow")}
        >
          <Check className="h-3 w-3 mr-1" />
          Allow once
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-destructive"
          onClick={() => onDecision("deny")}
        >
          <Ban className="h-3 w-3 mr-1" />
          Decline
        </Button>
      </div>
    </div>
  );
}
