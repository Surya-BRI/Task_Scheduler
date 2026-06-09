/**
 * Appends Prisma SQL Server pool settings when missing from the connection URL.
 * Prevents P2024 timeouts when many parallel queries run (e.g. projects overview).
 */
export function withPrismaConnectionPool(url: string | undefined): string | undefined {
  if (!url?.trim()) return url;

  const limit = process.env.DB_CONNECTION_LIMIT ?? '30';
  const timeoutSec = process.env.DB_POOL_TIMEOUT ?? '30';

  let result = url.trim();
  if (!/connection_limit=/i.test(result)) {
    result += `;connection_limit=${limit}`;
  }
  if (!/pool_timeout=/i.test(result)) {
    result += `;pool_timeout=${timeoutSec}`;
  }
  return result;
}
