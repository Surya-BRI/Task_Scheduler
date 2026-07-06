import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { writeStructuredLog } from '../logging/structured-log.util';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly nodeEnv = process.env.NODE_ENV ?? 'development';

  private log(level: 'warn' | 'error', context: string, message: string, requestId?: string, error?: string): void {
    writeStructuredLog(
      {
        timestamp: new Date().toISOString(),
        level,
        context,
        message,
        requestId,
        error,
      },
      this.nodeEnv,
    );
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = (request.headers?.[REQUEST_ID_HEADER] as string | undefined) ?? undefined;
    const method = request.method as string;
    const path = request.url as string;

    let status: number;
    let message: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof MulterError) {
      status = HttpStatus.BAD_REQUEST;
      message =
        exception.code === 'LIMIT_FILE_SIZE'
          ? 'File size exceeds the 20MB limit'
          : exception.message;
      this.log('warn', 'HttpExceptionFilter', `MulterError — ${method} ${path}: ${exception.message}`, requestId);
    } else if (
      exception instanceof Error &&
      (exception.message.includes('Unsupported file type') ||
        exception.message.includes('Unexpected field'))
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      this.log('warn', 'HttpExceptionFilter', `Upload rejected — ${method} ${path}: ${exception.message}`, requestId);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Translate known Prisma error codes to meaningful HTTP responses
      switch (exception.code) {
        case 'P2002':
          // Unique constraint violation — e.g. duplicate email, duplicate taskNo
          status = HttpStatus.CONFLICT;
          message = `Duplicate value on field: ${Array.isArray(exception.meta?.target) ? (exception.meta.target as string[]).join(', ') : exception.meta?.target ?? 'unknown'}`;
          break;
        case 'P2003':
          // Foreign key constraint — referenced record does not exist
          status = HttpStatus.BAD_REQUEST;
          message = `Invalid reference: ${exception.meta?.field_name ?? 'unknown field'}`;
          break;
        case 'P2025':
          // Record not found during update/delete (Prisma throws this, not a null return)
          status = HttpStatus.NOT_FOUND;
          message = exception.meta?.cause ?? 'Record not found';
          break;
        case 'P2011':
          // Null constraint violation — required field missing
          status = HttpStatus.BAD_REQUEST;
          message = `Required field cannot be null: ${exception.meta?.constraint ?? 'unknown'}`;
          break;
        case 'P2000':
          // Value too long for column
          status = HttpStatus.BAD_REQUEST;
          message = `Value too long for field: ${exception.meta?.column_name ?? 'unknown'}`;
          break;
        default:
          // Unknown Prisma DB error — log with code for debugging
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = `Database error [${exception.code}]`;
          this.log(
            'error',
            'HttpExceptionFilter',
            `Prisma ${exception.code} — ${method} ${path}`,
            requestId,
            exception.message,
          );
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Wrong types passed to Prisma query — always a client/code bug
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data format sent to database';
      this.log('warn', 'HttpExceptionFilter', `PrismaValidationError — ${method} ${path}: ${exception.message}`, requestId);
    } else {
      // Truly unexpected — log full stack for debugging
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.log(
        'error',
        'HttpExceptionFilter',
        `${method} ${path}`,
        requestId,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }
}
