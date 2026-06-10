import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './auth-token';
import { env } from './env';

function getSocketOrigin(): string {
  return env.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
}

export type DashboardRealtimeHandlers = {
  onDashboardRefresh?: () => void;
  onNotificationsRefresh?: () => void;
};

export function connectDashboardRealtime(handlers: DashboardRealtimeHandlers): () => void {
  const token = getAccessToken();
  if (!token || typeof window === 'undefined') {
    return () => {};
  }

  let socket: Socket | null = null;
  try {
    socket = io(`${getSocketOrigin()}/dashboard`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socket.on('dashboard:refresh', () => {
      handlers.onDashboardRefresh?.();
    });
    socket.on('notifications:refresh', () => {
      handlers.onNotificationsRefresh?.();
    });
  } catch {
    return () => {};
  }

  return () => {
    socket?.disconnect();
    socket = null;
  };
}
