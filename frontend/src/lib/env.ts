import { config } from '../config/config';

export const env = {
  apiBaseUrl: config.apiBaseUrl,
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'TaskScheduler',
};

if (typeof window !== 'undefined') {
  console.info('[TaskScheduler] Active backend:', env.apiBaseUrl);
}
