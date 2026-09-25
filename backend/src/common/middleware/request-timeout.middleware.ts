import type { NextFunction, Request, Response } from 'express';

export interface RequestTimeoutOverride {
  /** Matched against `req.method` + `req.path` (e.g. `POST /api/v1/reallocation-requests/abc/review`). */
  test: (req: Request) => boolean;
  timeoutMs: number;
}

export function requestTimeoutMiddleware(timeoutMs: number, overrides: RequestTimeoutOverride[] = []) {
  const safeTimeout = Math.max(1_000, timeoutMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const override = overrides.find((o) => o.test(req));
    const effectiveTimeout = Math.max(1_000, override?.timeoutMs ?? safeTimeout);

    const timer = setTimeout(() => {
      if (res.headersSent) return;
      res.status(503).json({
        statusCode: 503,
        message: 'Request timeout',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }, effectiveTimeout);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
}
