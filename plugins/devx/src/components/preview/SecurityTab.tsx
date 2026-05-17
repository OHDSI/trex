import { useState } from "react";
import { Shield, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as api from "@/lib/api";

interface SecurityFinding {
  severity: "critical" | "high" | "moderate" | "low" | "info";
  title: string;
  description: string;
  file?: string;
}

interface SecurityTabProps {
  appId: string;
}

export function SecurityTab({ appId }: SecurityTabProps) {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await api.securityScan(appId);
      setFindings((result.findings || []) as SecurityFinding[]);
      setScanned(true);
    } catch (err) {
      console.error("Security scan failed:", err);
    } finally {
      setScanning(false);
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "moderate": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Shield className="h-3.5 w-3.5" />
          Security Review
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleScan} disabled={scanning}>
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
          {scanning ? "Scanning..." : "Run Scan"}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {!scanned ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <Shield className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">Run a security scan to check for vulnerabilities</p>
              <Button size="sm" onClick={handleScan} disabled={scanning}>Run Security Scan</Button>
            </div>
          </div>
        ) : findings.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 opacity-60" />
              <p className="text-sm">No security issues found</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {findings.map((f, i) => (
              <div key={i} className="px-3 py-2 hover:bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2 w-2 rounded-full ${severityColor(f.severity)}`} />
                  <Badge variant="outline" className="text-[10px] h-4">{f.severity}</Badge>
                  <span className="text-xs font-medium">{f.title}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-4">{f.description}</p>
                {f.file && <p className="text-xs text-muted-foreground ml-4 font-mono">{f.file}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
