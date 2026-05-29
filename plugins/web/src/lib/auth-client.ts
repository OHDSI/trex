import { useState, useEffect, useSyncExternalStore } from "react";
import { BASE_PATH, UI_BASE_PATH } from "./config";

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
const AUTH_URL = `${API_URL}${BASE_PATH}/auth/v1`;
const STORAGE_KEY = "trex.auth.session";

interface GoTrueUser {
  id: string;
  aud: string;
  role: string;
  email: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: {
    provider: string;
    providers: string[];
    trex_role: string;
    [key: string]: unknown;
  };
  user_metadata: {
    name?: string;
    image?: string | null;
    must_change_password?: boolean;
    [key: string]: unknown;
  };
  identities: unknown[];
  created_at: string;
  updated_at: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: GoTrueUser;
}

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: GoTrueUser;
}

export interface TrexUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  mustChangePassword: boolean;
  emailVerified: boolean;
}

export interface TrexSessionData {
  user: TrexUser;
  session: { token: string };
}

function mapUser(u: GoTrueUser): TrexUser {
  return {
    id: u.id,
    name: u.user_metadata?.name || u.email?.split("@")[0] || "",
    email: u.email,
    image: (u.user_metadata?.image as string) || null,
    role: u.app_metadata?.trex_role || "user",
    mustChangePassword: u.user_metadata?.must_change_password === true,
    emailVerified: !!u.email_confirmed_at,
  };
}

let _session: StoredSession | null = null;
let _initialized = false;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

function saveSession(tokenResponse: TokenResponse) {
  _session = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: tokenResponse.expires_at,
    user: tokenResponse.user,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_session));
  } catch {
    // localStorage may be unavailable
  }
  notify();
}

function clearSession() {
  _session = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
  notify();
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    // Check if token is expired (with 60s buffer)
    if (session.expires_at < Math.floor(Date.now() / 1000) + 60) {
      return session; // Still return — we'll try to refresh
    }
    return session;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_session?.access_token) {
    headers["Authorization"] = `Bearer ${_session.access_token}`;
  }
  return headers;
}

async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = { ...authHeaders(), ...(options.headers as Record<string, string> || {}) };
  return fetch(`${AUTH_URL}${path}`, { ...options, headers });
}

let _refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!_session?.refresh_token) return false;

  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: _session!.refresh_token }),
      });

      if (!res.ok) {
        clearSession();
        return false;
      }

      const data: TokenResponse = await res.json();
      saveSession(data);
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer);
  if (!_session) return;

  // Refresh 5 minutes before expiry
  const msUntilExpiry = (_session.expires_at - Math.floor(Date.now() / 1000)) * 1000;
  const refreshIn = Math.max(msUntilExpiry - 5 * 60 * 1000, 1000);

  _refreshTimer = setTimeout(async () => {
    await refreshSession();
    scheduleRefresh();
  }, refreshIn);
}

async function initialize() {
  if (_initialized) return;

  const stored = loadSession();
  if (stored) {
    _session = stored;
    notify();

    if (stored.expires_at < Math.floor(Date.now() / 1000) + 60) {
      await refreshSession();
    }

    if (_session) {
      try {
        const res = await authFetch("/user");
        if (res.ok) {
          const user: GoTrueUser = await res.json();
          _session = { ..._session!, user };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_session));
          } catch { /* ignore */ }
          notify();
        } else if (res.status === 401) {
          // Token invalid — try refresh
          const ok = await refreshSession();
          if (!ok) clearSession();
        }
      } catch {
        // Network error — keep cached session
      }
    }

    scheduleRefresh();
  }

  _initialized = true;
}

initialize();

export const authClient = {
  signIn: {
    async email({ email, password }: { email: string; password: string }) {
      try {
        const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: { message: data.error_description || data.error || "Invalid email or password." } };
        }

        const data: TokenResponse = await res.json();
        saveSession(data);
        scheduleRefresh();
        return { data, error: null };
      } catch (_err) {
        return { error: { message: "An unexpected error occurred." } };
      }
    },

    async social({ provider, callbackURL }: { provider: string; callbackURL: string }) {
      const params = new URLSearchParams({
        provider,
        redirect_to: callbackURL,
      });
      window.location.href = `${AUTH_URL}/authorize?${params}`;
    },
  },

  signUp: {
    async email({ name, email, password }: { name: string; email: string; password: string }) {
      try {
        const res = await fetch(`${AUTH_URL}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, data: { name } }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: { message: data.error_description || data.error || "Registration failed." } };
        }

        const data: TokenResponse = await res.json();
        saveSession(data);
        scheduleRefresh();
        return { data, error: null };
      } catch {
        return { error: { message: "An unexpected error occurred." } };
      }
    },
  },

  async signOut() {
    try {
      await authFetch("/logout", { method: "POST" });
    } catch {
      // Always clear local session even if server call fails
    }
    if (_refreshTimer) clearTimeout(_refreshTimer);
    // Clear session and redirect in one step — redirect first to avoid
    // React re-render race (Layout's <Navigate> fires before href assignment)
    const target = `${UI_BASE_PATH}/login`;
    _session = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    window.location.href = target;
  },

  async updateUser(updates: { name?: string; image?: string }) {
    try {
      const res = await authFetch("/user", {
        method: "PUT",
        body: JSON.stringify({ data: updates }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: { message: data.error_description || "Failed to update profile." } };
      }

      const user: GoTrueUser = await res.json();
      if (_session) {
        _session = { ..._session, user };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(_session));
        } catch { /* ignore */ }
        notify();
      }
      return { data: user, error: null };
    } catch {
      return { error: { message: "An unexpected error occurred." } };
    }
  },

  async changePassword({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) {
    try {
      const res = await authFetch("/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: { message: data.error || "Failed to change password." } };
      }

      return { data: await res.json(), error: null };
    } catch {
      return { error: { message: "An unexpected error occurred." } };
    }
  },

  async forgetPassword({ email }: { email: string; redirectTo?: string }) {
    try {
      const res = await fetch(`${AUTH_URL}/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: { message: data.error_description || "Failed to send reset email." } };
      }

      return { data: {}, error: null };
    } catch {
      return { error: { message: "An unexpected error occurred." } };
    }
  },

  async resetPassword({ newPassword, token }: { newPassword: string; token: string }) {
    // For now, this is a placeholder — full reset flow requires email tokens
    try {
      const res = await fetch(`${AUTH_URL}/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: { message: data.error_description || "Failed to reset password." } };
      }

      return { data: {}, error: null };
    } catch {
      return { error: { message: "An unexpected error occurred." } };
    }
  },

  async verifyEmail(_opts: { query: { token: string } }) {
    // Email verification is auto-confirmed in current setup
    return { data: {}, error: null as { message: string } | null };
  },

  async listSessions() {
    try {
      const res = await authFetch("/sessions");
      if (!res.ok) {
        return { data: null, error: { message: "Failed to load sessions." } };
      }
      const data = await res.json();
      return { data, error: null };
    } catch {
      return { data: null, error: { message: "Failed to load sessions." } };
    }
  },

  async revokeSession({ token: sessionId }: { token: string }) {
    try {
      const res = await authFetch("/revoke-session", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) {
        return { error: { message: "Failed to revoke session." } };
      }
      return { data: {}, error: null };
    } catch {
      return { error: { message: "Failed to revoke session." } };
    }
  },

  async listAccounts() {
    try {
      const res = await authFetch("/accounts");
      if (!res.ok) {
        return { data: null, error: { message: "Failed to load accounts." } };
      }
      const data = await res.json();
      return { data, error: null };
    } catch {
      return { data: null, error: { message: "Failed to load accounts." } };
    }
  },

  async unlinkAccount(_opts: { providerId: string }) {
    // Placeholder — social account unlinking requires OAuth support
    return { error: { message: "Account unlinking is not yet supported." } };
  },

  /** Get the stored access token for use in other API calls */
  getAccessToken(): string | null {
    return _session?.access_token || null;
  },
};

export function useSession(): { data: TrexSessionData | null; isPending: boolean } {
  const [pending, setPending] = useState(!_initialized);

  const session = useSyncExternalStore(
    (cb) => {
      _listeners.add(cb);
      return () => {
        _listeners.delete(cb);
      };
    },
    () => _session,
  );

  useEffect(() => {
    if (!_initialized) {
      initialize().then(() => setPending(false));
    }
  }, []);

  if (pending || !session) {
    return { data: null, isPending: pending };
  }

  return {
    data: {
      user: mapUser(session.user),
      session: { token: session.access_token },
    },
    isPending: false,
  };
}
