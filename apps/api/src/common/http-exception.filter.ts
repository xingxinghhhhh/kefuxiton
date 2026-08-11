import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = this.codeFor(status, exception);
    const requestId = request.requestId ?? randomUUID();
    const message = status >= 500 ? '服务暂时不可用，请稍后重试。' : this.safeMessage(exception);

    response.status(status).json({
      error: { code, message, requestId },
    });
  }

  private codeFor(status: number, exception: unknown) {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string') {
        return payload.code;
      }
    }
    if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR';
    if (status === HttpStatus.UNAUTHORIZED) return 'CONVERSATION_ACCESS_DENIED';
    if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
    return 'INTERNAL_ERROR';
  }

  private safeMessage(exception: unknown) {
    if (!(exception instanceof HttpException)) return '请求失败。';
    const payload = exception.getResponse();
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      return Array.isArray(message) ? '请求参数不符合要求。' : String(message);
    }
    return '请求失败。';
  }
}
