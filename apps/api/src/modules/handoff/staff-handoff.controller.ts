import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { StaffAuthService } from '../auth/staff-auth.service.js';
import { HandoffService } from './handoff.service.js';
import { ListStaffHandoffsDto } from './dto/list-staff-handoffs.dto.js';
import { SendStaffReplyDto } from './dto/send-staff-reply.dto.js';

@Controller('staff/handoff-requests')
export class StaffHandoffController {
  constructor(
    private readonly handoff: HandoffService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  @Get()
  list(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ListStaffHandoffsDto,
  ) {
    this.staffAuth.require(authorization, 'handoff:read');
    return this.handoff.listForStaff(query.status ?? 'requested');
  }

  @Get(':requestId')
  get(
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    this.staffAuth.require(authorization, 'handoff:read');
    return this.handoff.getForStaff(requestId);
  }

  @Post(':requestId/claim')
  claim(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:claim');
    return this.handoff.claim(requestId, principal, requestIdHeader ?? 'staff-claim');
  }

  @Post(':requestId/close')
  close(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:close');
    return this.handoff.close(requestId, principal, requestIdHeader ?? 'staff-close');
  }

  @Post(':requestId/replies')
  reply(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Body() body: SendStaffReplyDto,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:reply');
    return this.handoff.reply(requestId, principal, body.content, body.idempotencyKey, requestIdHeader ?? 'staff-reply');
  }
}
