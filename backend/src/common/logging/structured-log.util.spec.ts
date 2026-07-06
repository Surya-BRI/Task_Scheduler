import {
  formatStructuredLog,
  resolveMinLogLevel,
  shouldEmitLog,
} from './structured-log.util';

describe('structured-log.util', () => {
  it('formats production logs as JSON', () => {
    const line = formatStructuredLog(
      {
        timestamp: '2026-07-06T10:00:00.000Z',
        level: 'log',
        context: 'HTTP',
        message: 'request completed',
        requestId: 'req-1',
        method: 'GET',
        path: '/api/v1/health',
        statusCode: 200,
        durationMs: 12,
      },
      'production',
    );

    expect(JSON.parse(line)).toMatchObject({
      level: 'log',
      context: 'HTTP',
      requestId: 'req-1',
      statusCode: 200,
    });
  });

  it('formats development logs as plain text', () => {
    const line = formatStructuredLog(
      {
        timestamp: '2026-07-06T10:00:00.000Z',
        level: 'warn',
        context: 'HttpExceptionFilter',
        message: 'Upload rejected',
        requestId: 'req-2',
      },
      'development',
    );

    expect(line).toContain('[HttpExceptionFilter]');
    expect(line).toContain('req=req-2');
  });

  it('maps info to log level', () => {
    expect(resolveMinLogLevel('info')).toBe('log');
  });

  it('filters logs below configured level', () => {
    expect(shouldEmitLog('debug', 'warn')).toBe(false);
    expect(shouldEmitLog('error', 'warn')).toBe(true);
  });
});
