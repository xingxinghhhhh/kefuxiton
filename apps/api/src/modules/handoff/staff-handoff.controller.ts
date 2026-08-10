import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { StaffAuthService } from '../auth/staff-auth.service.js';
import { HandoffService } from './handoff.service.js';
import { ListStaffHandoffsDto } from './dto/list-staff-handoffs.dto.js';
import { SendStaffReplyDto } from './dto/send-staff-reply.dto.js';
import { CreateInternalNoteDto } from './dto/create-internal-note.dto.js';
import { INTERNAL_TAGS, UpdateInternalTagDto } from './dto/update-internal-tag.dto.js';

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

  @Get(':requestId/internal-context')
  internalContext(
    @Headers('authorization') authorization: string | undefined,
    @Param('requestId') requestId: string,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:context');
    return this.handoff.getInternalContext(requestId, principal);
  }

  @Post(':requestId/notes')
  addNote(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Body() body: CreateInternalNoteDto,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:context');
    return this.handoff.addInternalNote(requestId, principal, body.content, this.requireIdempotencyKey(idempotencyKey), requestIdHeader ?? 'internal-note');
  }

  @Post(':requestId/tags')
  addTag(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Body() body: UpdateInternalTagDto,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:context');
    return this.handoff.addInternalTag(requestId, principal, body.tag, this.requireIdempotencyKey(idempotencyKey), requestIdHeader ?? 'internal-tag-add');
  }

  @Delete(':requestId/tags/:tag')
  removeTag(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Param('requestId') requestId: string,
    @Param('tag') tag: string,
  ) {
    const principal = this.staffAuth.require(authorization, 'handoff:context');
    if (!INTERNAL_TAGS.includes(tag as UpdateInternalTagDto['tag'])) throw new BadRequestException('tag is not allowed');
    return this.handoff.removeInternalTag(requestId, principal, tag as UpdateInternalTagDto['tag'], this.requireIdempotencyKey(idempotencyKey), requestIdHeader ?? 'internal-tag-remove');
  }

  private requireIdempotencyKey(value: string | undefined) {
    if (!value || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) throw new BadRequestException('idempotency key is invalid');
    return value;
  }
}
