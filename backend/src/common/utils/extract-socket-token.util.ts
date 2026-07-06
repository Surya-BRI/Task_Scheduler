import type { Socket } from 'socket.io';
import { extractAccessTokenFromHeaders } from './auth-cookie.util';

/** Resolve JWT from Socket.IO handshake (auth payload, Authorization header, or cookie). */
export function extractAccessTokenFromSocket(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;
  return extractAccessTokenFromHeaders(client.handshake.headers, authToken);
}
