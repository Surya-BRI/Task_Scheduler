import { io, type Socket } from 'socket.io-client';
import { env } from './env';

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
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
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
