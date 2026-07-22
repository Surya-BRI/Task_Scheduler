import { io, type Socket } from 'socket.io-client';
import { env } from './env';

/**
 * Fetches a short-lived Socket.IO auth token via the same-origin BFF route
 * (which holds the httpOnly session cookie). Needed because the socket
 * connects directly to the backend origin (NEXT_PUBLIC_WS_ORIGIN) when the
 * frontend is deployed somewhere that can't proxy the WS upgrade same-origin
 * (e.g. Vercel) — the session cookie itself never reaches that origin.
 */
async function fetchWsToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/ws-token', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.token === 'string' ? data.token : null;
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
};

export type DashboardRealtimeHandlers = {
  onDashboardRefresh?: (payload?: DashboardRefreshPayload) => void;
  onNotificationsRefresh?: () => void;
  onChatterRefresh?: (payload: ChatterRefreshPayload) => void;
  onTimerPaused?: (payload: TimerPausedPayload) => void;
};

export function connectDashboardRealtime(handlers: DashboardRealtimeHandlers): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let socket: Socket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  try {
    socket = io(`${getSocketOrigin()}/dashboard`, {
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

    socket.on('dashboard:refresh', (payload: DashboardRefreshPayload) => {
      handlers.onDashboardRefresh?.(payload);
    });
    socket.on('notifications:refresh', () => {
      handlers.onNotificationsRefresh?.();
    });
    socket.on('chatter:refresh', (payload: ChatterRefreshPayload) => {
      handlers.onChatterRefresh?.(payload);
    });
    socket.on('timer:paused', (payload: TimerPausedPayload) => {
      if (payload?.taskId) handlers.onTimerPaused?.(payload);
    });

    // socket.io gives up permanently after reconnectionAttempts is exhausted (e.g. a
    // prolonged backend outage) — without this, the tab silently falls back to whatever
    // polling the caller has and never becomes "realtime" again for the rest of the session.
    // Retry the whole connection cycle periodically instead of giving up forever.
    socket.io.on('reconnect_failed', () => {
      if (disposed) return;
      retryTimer = setTimeout(() => {
        if (!disposed) socket?.connect();
      }, 30_000);
    });
  } catch {
    return () => {};
  }

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.disconnect();
    socket = null;
  };
}
