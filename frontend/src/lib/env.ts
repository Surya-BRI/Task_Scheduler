/**
 * Central environment config for the frontend.
 * Reads NEXT_PUBLIC_* vars at runtime so they can be swapped per-environment
 * without a code change.
 */
export const env = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'https://task-scheduler.app-brisigns.com/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'TaskScheduler',
} as const;

if (typeof window !== 'undefined') {
  console.info('[TaskScheduler] Active backend:', env.apiBaseUrl);
}
