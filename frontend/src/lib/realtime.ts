import { io, type Socket } from 'socket.io-client';
import { env } from './env';

/**
 * Fetches a short-lived Socket.IO auth token via the same-origin BFF route
 * (which holds the httpOnly session cookie). Needed because the socket
 * connects directly to the backend origin (NEXT_PUBLIC_WS_ORIGIN) when the
 * frontend is deployed somewhere that can't proxy the WS upgrade same-origin
 * (e.g. Vercel) — the session cookie itself never reaches that origin.
 */
let cachedWsToken: { token: string; expiresAt: number } | null = null;
/** Reuse ws-token within its TTL window to avoid auth storms on reconnect. */
const WS_TOKEN_CACHE_MS = 90_000;
/** Keep socket briefly after last subscriber leaves (Strict Mode remount churn). */
const IDLE_TEARDOWN_MS = 2_500;

async function fetchWsToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedWsToken && cachedWsToken.expiresAt > now) {
    return cachedWsToken.token;
  }
  try {
    const response = await fetch('/api/auth/ws-token', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const token = typeof data?.token === 'string' ? data.token : null;
    if (token) {
      cachedWsToken = { token, expiresAt: now + WS_TOKEN_CACHE_MS };
    }
    return token;
  } catch {
    return null;
  }
}

function getSocketOrigin(): string {
  if (env.apiBaseUrl.startsWith('/')) {
    const wsOrigin = process.env.NEXT_PUBLIC_WS_ORIGIN?.trim();
    if (wsOrigin) {
      return wsOrigin.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  }
  return env.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
}

export type ChatterRefreshPayload = {
  event: 'chatter_post_created' | 'chatter_post_updated' | 'chatter_post_deleted' | 'chatter_comment_created' | 'chatter_comment_deleted';
  postId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  at: string;
};

export type TimerPausedPayload = {
  taskId: string;
  sessionClosed?: boolean;
  at?: string;
  accumulatedSeconds?: number;
  runStartedAt?: string | null;
  handedOff?: boolean;
  locked?: boolean;
};

export type TimerUpdatedPayload = {
  taskId: string;
  accumulatedSeconds: number;
  runStartedAt: string | null;
  /** Present on submit/close so open task pages can refresh status without extra channels. */
  taskStatus?: string | null;
  handedOff?: boolean;
  locked?: boolean;
  sessionClosed?: boolean;
  at: string;
};

export type DashboardRefreshPayload = {
  event: string;
  at: string;
  weekStart?: string;
  version?: number;
  updatedBy?: string | null;
  changedTaskIds?: string[];
  affectedWeekStarts?: string[];
  taskId?: string;
  status?: string;
  designerId?: string;
  date?: string;
};

export type DashboardRealtimeHandlers = {
  onDashboardRefresh?: (payload?: DashboardRefreshPayload) => void;
  onNotificationsRefresh?: () => void;
  onChatterRefresh?: (payload: ChatterRefreshPayload) => void;
  onTimerPaused?: (payload: TimerPausedPayload) => void;
  onTimerUpdated?: (payload: TimerUpdatedPayload) => void;
};

type Subscriber = {
  handlers: DashboardRealtimeHandlers;
};

/** One shared /dashboard socket for the whole tab — avoids Navbar + page each fetching ws-token. */
let sharedSocket: Socket | null = null;
let sharedRetryTimer: ReturnType<typeof setTimeout> | null = null;
let idleTeardownTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<Subscriber>();

function broadcastDashboardRefresh(payload: DashboardRefreshPayload) {
  for (const sub of subscribers) sub.handlers.onDashboardRefresh?.(payload);
}
function broadcastNotificationsRefresh() {
  for (const sub of subscribers) sub.handlers.onNotificationsRefresh?.();
}
function broadcastChatterRefresh(payload: ChatterRefreshPayload) {
  for (const sub of subscribers) sub.handlers.onChatterRefresh?.(payload);
}
function broadcastTimerPaused(payload: TimerPausedPayload) {
  if (!payload?.taskId) return;
  for (const sub of subscribers) sub.handlers.onTimerPaused?.(payload);
}
function broadcastTimerUpdated(payload: TimerUpdatedPayload) {
  if (!payload?.taskId) return;
  for (const sub of subscribers) sub.handlers.onTimerUpdated?.(payload);
}

function ensureSharedSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (sharedSocket) return sharedSocket;

  try {
    sharedSocket = io(`${getSocketOrigin()}/dashboard`, {
      path: '/socket.io',
      // true (the library default) so requests hit `/socket.io/` — the backend's
      // nginx reverse proxy 301-redirects the bare `/socket.io` path to add the
      // slash, and browsers refuse to follow a redirect during a WS handshake.
      // Safe for the same-origin/PM2 rewrite path too: next.config.ts's
      // skipTrailingSlashRedirect already makes Next.js indifferent to either form.
      addTrailingSlash: true,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      // Function form re-fetches a fresh token before every connection attempt
      // (initial + each reconnect), since the token is short-lived (2m).
      auth: (cb) => {
        fetchWsToken().then((token) => cb(token ? { token } : {}));
      },
    });

    sharedSocket.on('dashboard:refresh', (payload: DashboardRefreshPayload) => {
      broadcastDashboardRefresh(payload);
    });
    sharedSocket.on('notifications:refresh', () => {
      broadcastNotificationsRefresh();
    });
    sharedSocket.on('chatter:refresh', (payload: ChatterRefreshPayload) => {
      broadcastChatterRefresh(payload);
    });
    sharedSocket.on('timer:paused', (payload: TimerPausedPayload) => {
      broadcastTimerPaused(payload);
    });
    sharedSocket.on('timer:updated', (payload: TimerUpdatedPayload) => {
      broadcastTimerUpdated(payload);
    });

    // socket.io gives up permanently after reconnectionAttempts is exhausted (e.g. a
    // prolonged backend outage) — without this, the tab silently falls back to whatever
    // polling the caller has and never becomes "realtime" again for the rest of the session.
    // Retry the whole connection cycle periodically instead of giving up forever.
    sharedSocket.io.on('reconnect_failed', () => {
      if (subscribers.size === 0) return;
      if (sharedRetryTimer) clearTimeout(sharedRetryTimer);
      sharedRetryTimer = setTimeout(() => {
        if (subscribers.size > 0) sharedSocket?.connect();
      }, 30_000);
    });
  } catch {
    sharedSocket = null;
    return null;
  }

  return sharedSocket;
}

function teardownSharedSocketIfIdle() {
  if (subscribers.size > 0) return;
  if (idleTeardownTimer) clearTimeout(idleTeardownTimer);
  idleTeardownTimer = setTimeout(() => {
    idleTeardownTimer = null;
    if (subscribers.size > 0) return;
    if (sharedRetryTimer) {
      clearTimeout(sharedRetryTimer);
      sharedRetryTimer = null;
    }
    sharedSocket?.disconnect();
    sharedSocket = null;
  }, IDLE_TEARDOWN_MS);
}

export function connectDashboardRealtime(handlers: DashboardRealtimeHandlers): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (idleTeardownTimer) {
    clearTimeout(idleTeardownTimer);
    idleTeardownTimer = null;
  }

  const subscriber: Subscriber = { handlers };
  subscribers.add(subscriber);
  ensureSharedSocket();

  return () => {
    subscribers.delete(subscriber);
    teardownSharedSocketIfIdle();
  };
}
