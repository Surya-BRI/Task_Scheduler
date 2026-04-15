import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const method = request.method as string;
    const path = request.url as string;

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${method} ${path} - ${Date.now() - now}ms`);
      }),
    );
  }
}
