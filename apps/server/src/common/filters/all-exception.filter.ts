import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/generated/client';
import { Request, Response } from 'express';

/** Prisma 错误码到 HTTP 状态码的映射 */
const PRISMA_ERROR_MAP: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.BAD_REQUEST,
  P2025: HttpStatus.NOT_FOUND,
};

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const statusCode = this.getStatusCode(exception);
    const error = this.getErrorMessage(exception);

    this.logException(exception, request);

    httpAdapter.reply(
      response,
      {
        statusCode,
        error,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
      statusCode,
    );
  }

  private formatPrismaMessage(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    const idx = error.message.indexOf('→');
    if (idx !== -1) {
      const detail = error.message
        .slice(Math.max(0, idx + 1))
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
      return `[${error.code}] ${detail}`;
    }
    return `[${error.code}] Database operation failed`;
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      const msg = (response as any).message;
      return Array.isArray(msg) ? msg.join(', ') : msg || exception.message;
    }
    if (this.isPrismaKnownError(exception)) {
      return this.formatPrismaMessage(exception);
    }
    if (this.isPrismaValidationError(exception)) {
      const parts = exception.message.split('\n\n');
      return parts[parts.length - 1]?.trim() || 'Validation Error';
    }
    if (exception instanceof Error) {
      return exception.message || 'Internal Server Error';
    }
    return 'Internal Server Error';
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (this.isPrismaKnownError(exception)) {
      return (
        PRISMA_ERROR_MAP[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private isPrismaKnownError(
    e: unknown,
  ): e is Prisma.PrismaClientKnownRequestError {
    return e instanceof Error && e.name === 'PrismaClientKnownRequestError';
  }

  private isPrismaValidationError(
    e: unknown,
  ): e is Prisma.PrismaClientValidationError {
    return e instanceof Error && e.name === 'PrismaClientValidationError';
  }

  private logException(exception: unknown, request: Request): void {
    const context = {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      body: request.body,
    };

    if (exception instanceof Error) {
      this.logger.error(
        `${exception.name}: ${exception.message}`,
        JSON.stringify({ context, stack: exception.stack }),
      );
    } else {
      this.logger.error(
        `Unknown error: ${String(exception)}`,
        JSON.stringify({ context }),
      );
    }
  }
}
