// TEMPORARY: Production demo login support.
// Remove before public release.

/** Shown in development always; in production unless DISABLE_PROD_DEMO_LOGINS=true. */
export function shouldShowDemoLogins(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.DISABLE_PROD_DEMO_LOGINS !== 'true';
}
