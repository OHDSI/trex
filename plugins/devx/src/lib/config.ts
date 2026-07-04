const raw = import.meta.env.VITE_BASE_PATH || "/trex";
export const BASE_PATH = raw.endsWith("/") ? raw.slice(0, -1) : raw;
export const UI_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

const pluginBase = import.meta.env.VITE_PLUGIN_BASE || "/plugins/trex";
export const API_BASE = `${window.location.origin}${pluginBase}/devx-api`;

// task-u1: the eve/agents runtime's stateless UIMessage chat endpoint
// (core/server/agents/service/handler.ts's POST /chat), mounted per
// plugins/devx/package.json's trex.agents[0].name ("devx-agent") — a
// DIFFERENT plugin mount than devx-api above, not `/devx-api/...`.
// task-u2: no longer used by devx's own client (useAgentsChat.ts moved to
// AGENTS_SESSION_URL below for real needsApproval support) — kept exported
// since the route itself is still live server-side for other UIMessage-
// stream frontends (handler.ts's own comment: "for useChat frontends
// (Pythia)"), and as a documented reference point for that endpoint's URL
// shape.
export const AGENTS_CHAT_URL = `${window.location.origin}${pluginBase}/devx-agent/chat`;

// task-u2: the same agent worker's eve/v1 session API — POST here to create
// a session, POST `${AGENTS_SESSION_URL}/:id` for follow-up turns/approval
// decisions, GET `${AGENTS_SESSION_URL}/:id/stream` for the NDJSON tail, and
// POST `${AGENTS_SESSION_URL}/:id/approval` to resolve one pending request.
// Chosen over /chat for the agents loop specifically because it's the only
// endpoint that pauses mid-turn for `needsApproval` tools (input.requested)
// instead of erroring the tool call out immediately — see
// task-u2-report.md's evidence table for why this replaced /chat here.
export const AGENTS_SESSION_URL = `${window.location.origin}${pluginBase}/devx-agent/eve/v1/session`;
