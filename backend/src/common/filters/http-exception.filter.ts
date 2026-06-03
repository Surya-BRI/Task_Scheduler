import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

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
      this.logger.warn(`MulterError — ${request.method} ${request.url}: ${exception.message}`);
    } else if (
      exception instanceof Error &&
      (exception.message.includes('Unsupported file type') ||
        exception.message.includes('Unexpected field'))
    ) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      this.logger.warn(`Upload rejected — ${request.method} ${request.url}: ${exception.message}`);
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
          this.logger.error(
            `Prisma ${exception.code} — ${request.method} ${request.url}`,
            exception.message,
          );
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Wrong types passed to Prisma query — always a client/code bug
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data format sent to database';
      this.logger.warn(`PrismaValidationError — ${request.method} ${request.url}: ${exception.message}`);
    } else {
      // Truly unexpected — log full stack for debugging
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
