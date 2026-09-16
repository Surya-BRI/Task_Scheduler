import type { NextFunction, Request, Response } from 'express';

export interface RequestTimeoutOverride {
  /** Matched against `req.method` + `req.path` (e.g. `POST /api/v1/reallocation-requests/abc/review`). */
  test: (req: Request) => boolean;
  timeoutMs: number;
}

/**
 * Aborts long-running HTTP requests that exceed the configured timeout.
 * Does not cancel in-flight async work — only stops the client response,
 * so a request that later succeeds server-side still commits even after
 * the client sees a 503 (known correctness gap, not something this
 * middleware can fix — see TESTING_PROGRESS.md's "save-then-500" note).
 *
 * `overrides` lets specific slow-but-legitimate routes (scheduler
 * handoffs that make many sequential round-trips to the remote SQL
 * Server) get a longer budget than the rest of the API, without raising
 * the default for every route and masking genuinely hung requests.
 */
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
