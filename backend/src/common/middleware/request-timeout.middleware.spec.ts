import type { Request, Response } from 'express';
import { requestTimeoutMiddleware } from './request-timeout.middleware';

function createMockRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: undefined as unknown,
    listeners: {} as Record<string, Array<() => void>>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.headersSent = true;
      this.body = payload;
      return this;
    },
    on(event: string, handler: () => void) {
      this.listeners[event] = this.listeners[event] ?? [];
      this.listeners[event].push(handler);
      return this;
    },
    emit(event: string) {
      for (const handler of this.listeners[event] ?? []) {
        handler();
      }
    },
  } as unknown as Response & {
    body: unknown;
    emit: (event: string) => void;
  };
  return res;
}

describe('requestTimeoutMiddleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 503 when request exceeds timeout', () => {
    const middleware = requestTimeoutMiddleware(1000);
    const req = { path: '/api/v1/tasks' } as Request;
    const res = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();

    jest.advanceTimersByTime(1001);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ message: 'Request timeout' });
  });

  it('does not timeout when response finishes in time', () => {
    const middleware = requestTimeoutMiddleware(1000);
    const req = { path: '/api/v1/health' } as Request;
    const res = createMockRes();
    const next = jest.fn();

    middleware(req, res, next);
    res.emit('finish');

    jest.advanceTimersByTime(2000);
    expect(res.headersSent).toBe(false);
  });
});
