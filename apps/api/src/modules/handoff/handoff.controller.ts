import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import type { HandoffRequestResponse } from '@ai-agent/contracts';
import { extractBearerToken } from '../conversations/conversation-token.js';
import { HandoffService } from './handoff.service.js';
import { RequestHandoffDto } from './dto/request-handoff.dto.js';

@Controller('conversations/:conversationId/handoff-requests')
export class HandoffController {
  constructor(private readonly handoff: HandoffService) {}

  @Post()
  request(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RequestHandoffDto,
  ): Promise<HandoffRequestResponse> {
    const token = extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('会话凭证无效。');
    return this.handoff.request(conversationId, token, body.reasonCode);
  }

  @Get()
  getStatus(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<HandoffRequestResponse | null> {
    const token = extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('会话凭证无效。');
    return this.handoff.getStatus(conversationId, token);
  }
}
