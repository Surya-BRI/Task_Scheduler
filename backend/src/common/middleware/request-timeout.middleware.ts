import type { NextFunction, Request, Response } from 'express';

/**
 * Aborts long-running HTTP requests that exceed the configured timeout.
 * Does not cancel in-flight async work — only stops the client response.
 */
export function requestTimeoutMiddleware(timeoutMs: number) {
  const safeTimeout = Math.max(1_000, timeoutMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      res.status(503).json({
        statusCode: 503,
        message: 'Request timeout',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }, safeTimeout);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
}
