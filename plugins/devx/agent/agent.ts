// V1 skeleton (task-v1-brief.md): static config only. Per-request mode
// selection (ask/plan/build), AI_RULES injection, and tool filtering all
// depend on workspace/request state and are deferred to the
// resolveModel/buildInstructions/filterTools hooks wired in V3 — see
// core/server/agents/README.md's "Runtime hooks" section.
import { defineAgent } from "eve";

export default defineAgent({ maxSteps: 25 });
