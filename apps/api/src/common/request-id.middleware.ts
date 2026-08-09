import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export class RequestIdMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const requestId = req.header('x-request-id')?.slice(0, 128) || randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
