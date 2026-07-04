const raw = import.meta.env.VITE_BASE_PATH || "/trex";
export const BASE_PATH = raw.endsWith("/") ? raw.slice(0, -1) : raw;
export const UI_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

const pluginBase = import.meta.env.VITE_PLUGIN_BASE || "/plugins/trex";
export const API_BASE = `${window.location.origin}${pluginBase}/devx-api`;

// task-u1: the eve/agents runtime's stateless UIMessage chat endpoint
// (core/server/agents/service/handler.ts's POST /chat), mounted per
// plugins/devx/package.json's trex.agents[0].name ("devx-agent") — a
// DIFFERENT plugin mount than devx-api above, not `/devx-api/...`.
export const AGENTS_CHAT_URL = `${window.location.origin}${pluginBase}/devx-agent/chat`;
