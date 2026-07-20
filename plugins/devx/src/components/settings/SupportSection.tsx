import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSupportSettings } from "@/hooks/useSupportSettings";

export function SupportSection() {
  const { userMap, allowlist, loading, saveMapping, removeMapping, addAllowed, removeAllowed } = useSupportSettings();
  const [github, setGithub] = useState("");
  const [discord, setDiscord] = useState("");
  const [slackId, setSlackId] = useState("");
  const [slackNote, setSlackNote] = useState("");

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const addMapping = async () => {
    if (!github.trim() || !discord.trim()) return;
    try {
      await saveMapping({ github_login: github.trim(), discord_user_id: discord.trim() });
      setGithub("");
      setDiscord("");
    } catch {
      toast.error("Failed to save mapping");
    }
  };

  const addSlack = async () => {
    if (!slackId.trim()) return;
    try {
      await addAllowed({ slack_user_id: slackId.trim(), note: slackNote.trim() || undefined });
      setSlackId("");
      setSlackNote("");
    } catch {
      toast.error("Failed to add Slack user");
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-medium mb-1">Developer mapping</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Maps GitHub logins (from git blame) to Discord user ids so support tasks can ping the right developers.
        </p>
        <div className="space-y-2">
          {userMap.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-48 truncate font-mono">{e.github_login}</span>
              <span className="w-48 truncate font-mono text-muted-foreground">{e.discord_user_id}</span>
              <Button variant="ghost" size="icon" onClick={() => removeMapping(e.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="github login" value={github} onChange={(e) => setGithub(e.target.value)} className="w-48" />
            <Input placeholder="discord user id" value={discord} onChange={(e) => setDiscord(e.target.value)} className="w-48" />
            <Button onClick={addMapping}>Add</Button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-medium mb-1">Slack allowlist</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Slack users allowed to file data2evidence support requests. An empty list blocks everyone.
        </p>
        <div className="space-y-2">
          {allowlist.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-48 truncate font-mono">{e.slack_user_id}</span>
              <span className="flex-1 truncate text-muted-foreground">{e.note}</span>
              <Button variant="ghost" size="icon" onClick={() => removeAllowed(e.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="slack user id (U…)" value={slackId} onChange={(e) => setSlackId(e.target.value)} className="w-48" />
            <Input placeholder="note (optional)" value={slackNote} onChange={(e) => setSlackNote(e.target.value)} className="flex-1" />
            <Button onClick={addSlack}>Add</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
