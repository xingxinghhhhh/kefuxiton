import { Body, Controller, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { SendMessageDto } from './dto/send-message.dto.js';
import { extractBearerToken } from './conversation-token.js';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  createConversation() {
    return this.conversations.createConversation();
  }

  @Post(':conversationId/messages')
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SendMessageDto,
  ) {
    const token = extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('会话凭证无效。');
    return this.conversations.sendMessage(conversationId, token, body.content);
  }
}
