export type LogLevel = 'debug' | 'log' | 'warn' | 'error';

export type StructuredLogEntry = {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
};

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  log: 20,
  warn: 30,
  error: 40,
};

export function resolveMinLogLevel(value: string | undefined): LogLevel {
  const normalized = (value ?? 'debug').toLowerCase();
  if (normalized === 'info') return 'log';
  if (normalized === 'log' || normalized === 'warn' || normalized === 'error' || normalized === 'debug') {
    return normalized;
  }
  return 'debug';
}

export function shouldEmitLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[minLevel];
}

export function formatStructuredLog(
  entry: StructuredLogEntry,
  nodeEnv: string | undefined,
): string {
  if ((nodeEnv ?? 'development') === 'production') {
    return JSON.stringify(entry);
  }

  const parts = [
    entry.timestamp,
    entry.level.toUpperCase(),
    `[${entry.context}]`,
    entry.message,
  ];

  if (entry.requestId) parts.push(`req=${entry.requestId}`);
  if (entry.method && entry.path) parts.push(`${entry.method} ${entry.path}`);
  if (entry.statusCode !== undefined) parts.push(`status=${entry.statusCode}`);
  if (entry.durationMs !== undefined) parts.push(`${entry.durationMs}ms`);

  return parts.join(' ');
}

export function writeStructuredLog(
  entry: StructuredLogEntry,
  nodeEnv: string | undefined,
  minLevel: LogLevel = 'debug',
): void {
  if (!shouldEmitLog(entry.level, minLevel)) return;

  const line = formatStructuredLog(entry, nodeEnv);
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}
