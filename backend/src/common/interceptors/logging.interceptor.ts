import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  resolveMinLogLevel,
  writeStructuredLog,
} from '../logging/structured-log.util';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  private readonly minLevel = resolveMinLogLevel(process.env.LOG_LEVEL);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method as string;
    const path = request.url as string;
    const requestId = (request.headers?.[REQUEST_ID_HEADER] as string | undefined) ?? undefined;

    return next.handle().pipe(
      tap(() => {
        writeStructuredLog(
          {
            timestamp: new Date().toISOString(),
            level: 'log',
            context: 'HTTP',
            message: 'request completed',
            requestId,
            method,
            path,
            statusCode: response.statusCode as number | undefined,
            durationMs: Date.now() - now,
          },
          this.nodeEnv,
          this.minLevel,
        );
      }),
    );
  }
}
