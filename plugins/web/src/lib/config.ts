const raw = import.meta.env.VITE_BASE_PATH || "/trex";
export const BASE_PATH = raw.endsWith("/") ? raw.slice(0, -1) : raw;
export const UI_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
