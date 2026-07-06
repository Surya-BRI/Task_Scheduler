// TEMPORARY: Production demo login support.
// Remove before public release.

/** True in development, or in production when ENABLE_PROD_DEMO_LOGINS=true. */
export function shouldShowDemoLogins(): boolean {
  const isDev = process.env.NODE_ENV !== 'production';
  const prodDemoEnabled = process.env.ENABLE_PROD_DEMO_LOGINS === 'true';
  return isDev || prodDemoEnabled;
}
