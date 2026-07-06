/** Resolve allowed CORS origins for HTTP and WebSocket based on environment. */
export function resolveCorsOrigins(
  corsOriginConfig: string | undefined,
  nodeEnv: string | undefined,
): string[] | boolean {
  const origins = (corsOriginConfig ?? 'http://localhost:5000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (nodeEnv === 'production') {
    return origins;
  }

  // Development/test: reflect request origin when credentials are enabled.
  return true;
}
