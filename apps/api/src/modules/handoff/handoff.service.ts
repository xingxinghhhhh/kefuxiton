import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { HandoffRequestStatus, Prisma } from '@prisma/client';
import type {
  HandoffActionResponse,
  StaffCloseResponse,
  HandoffRequestResponse,
  HandoffRequestStatus as ContractHandoffRequestStatus,
  InternalTag,
  StaffAuditTimelineResponse,
  TimelineAction,
  TimelineResult,
  TimelineSubjectType,
  StaffInternalContextResponse,
  MessageSenderType,
  ResponseType,
  StaffHandoffListResponse,
  StaffHandoffRequest,
  StaffReplyResponse,
  StoredCloseReason,
  StoredResolutionCode,
} from '@ai-agent/contracts';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashConversationToken } from '../conversations/conversation-token.js';
import type { StaffPrincipal } from '../auth/staff-identity.port.js';
import { isStoredCloseReason, isStoredResolutionCode, parseCloseOutcome } from './close-outcome.js';

const SUPPRESSING_STATUSES: HandoffRequestStatus[] = [
  HandoffRequestStatus.requested,
  HandoffRequestStatus.claimed,
  HandoffRequestStatus.closed,
];

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async request(conversationId: string, accessToken: string, reasonCode: 'customer_requested'): Promise<HandoffRequestResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.authorizeConversation(tx, conversationId, accessToken);
        const existing = await tx.handoffRequest.findFirst({ where: { conversationId }, orderBy: { requestedAt: 'desc' } });
        if (existing) {
          if (existing.status === HandoffRequestStatus.closed) throw new ConflictException('handoff request is closed');
          await this.recordReplay(tx, existing, reasonCode);
          return this.toCustomerResponse(existing, true);
        }

        const request = await tx.handoffRequest.create({
          data: { conversationId, reasonCode, activeKey: conversationId },
        });
        await this.audit.record(tx, {
          conversationId,
          handoffRequestId: request.id,
          actorType: 'customer',
          action: 'handoff_requested',
          outcome: 'created',
          metadata: { reasonCode },
        });
        return this.toCustomerResponse(request, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.handoffRequest.findFirst({
        where: { conversationId, status: { in: [HandoffRequestStatus.requested, HandoffRequestStatus.claimed] } },
        orderBy: { requestedAt: 'desc' },
      });
      if (!existing) throw error;
      await this.prisma.$transaction((tx) => this.recordReplay(tx, existing, reasonCode));
      return this.toCustomerResponse(existing, true);
    }
  }

  async getStatus(conversationId: string, accessToken: string): Promise<HandoffRequestResponse | null> {
    await this.authorizeConversation(this.prisma, conversationId, accessToken);
    const request = await this.getConversationRequest(conversationId);
    return request ? this.toCustomerResponse(request, false) : null;
  }

  async getConversationRequest(conversationId: string) {
    return this.prisma.handoffRequest.findFirst({
      where: { conversationId, status: { in: SUPPRESSING_STATUSES } },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async listForStaff(status?: HandoffRequestStatus): Promise<StaffHandoffListResponse> {
    const requests = await this.prisma.handoffRequest.findMany({
      where: status ? { status } : undefined,
      include: { conversation: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
      orderBy: { requestedAt: 'asc' },
    });
    return { items: requests.map((request) => this.toStaffResponse(request)) };
  }

  async getForStaff(requestId: string): Promise<StaffHandoffRequest> {
    const request = await this.prisma.handoffRequest.findUnique({
      where: { id: requestId },
      include: { conversation: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } } } },
    });
    if (!request) throw new NotFoundException('handoff request not found');
    return this.toStaffResponse(request);
  }

  async claim(requestId: string, principal: StaffPrincipal, correlationId: string): Promise<HandoffActionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new NotFoundException('handoff request not found');
      if (current.status === HandoffRequestStatus.closed) throw new ConflictException('closed handoff cannot be claimed');
      if (current.status === HandoffRequestStatus.claimed) {
        await this.audit.record(tx, {
          conversationId: current.conversationId,
          handoffRequestId: current.id,
          actorType: 'staff',
          actorId: principal.staffId,
          action: 'handoff_claim_replayed',
          outcome: 'replayed',
          metadata: { requestId: correlationId },
        });
        return { requestId: current.id, status: 'claimed' as const, idempotent: true };
      }

      const result = await tx.handoffRequest.updateMany({
        where: { id: requestId, status: HandoffRequestStatus.requested },
        data: { status: HandoffRequestStatus.claimed, claimedBy: principal.staffId, claimedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('handoff state changed; retry after refresh');
      await this.audit.record(tx, {
        conversationId: current.conversationId,
        handoffRequestId: current.id,
        actorType: 'staff',
        actorId: principal.staffId,
        action: 'handoff_claimed',
        outcome: 'claimed',
        metadata: { requestId: correlationId },
      });
      return { requestId: current.id, status: 'claimed' as const, idempotent: false };
    });
  }

  async close(
    requestId: string,
    principal: StaffPrincipal,
    correlationId: string,
    closeReason?: unknown,
    resolutionCode?: unknown,
  ): Promise<StaffCloseResponse> {
    const parsed = parseCloseOutcome(closeReason, resolutionCode);
    if (parsed.kind === 'invalid') {
      throw new BadRequestException(
        parsed.reason === 'both_fields_required'
          ? 'closeReason and resolutionCode must be provided together'
          : 'closeReason or resolutionCode is not allowed',
      );
    }
    const requestedOutcome = parsed.value;
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new NotFoundException('handoff request not found');
      if (current.status === HandoffRequestStatus.closed) {
        if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can close');
        const storedOutcome = this.readStoredCloseOutcome(current.closeReason, current.resolutionCode);
        if (!this.closeOutcomeMatches(storedOutcome, requestedOutcome)) {
          throw new ConflictException('closed handoff outcome cannot be changed');
        }
        await this.audit.record(tx, {
          conversationId: current.conversationId,
          handoffRequestId: current.id,
          actorType: 'staff',
          actorId: principal.staffId,
          action: 'handoff_close_replayed',
          outcome: 'replayed',
          metadata: { requestId: correlationId },
        });
        return this.toCloseResponse(current.id, storedOutcome.closeReason, storedOutcome.resolutionCode, true);
      }
      if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('handoff must be claimed before closing');
      if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can close');

      const result = await tx.handoffRequest.updateMany({
        where: { id: requestId, status: HandoffRequestStatus.claimed },
        data: {
          status: HandoffRequestStatus.closed,
          activeKey: null,
          closedAt: new Date(),
          closeReason: requestedOutcome.closeReason,
          resolutionCode: requestedOutcome.resolutionCode,
        },
      });
      if (result.count !== 1) throw new ConflictException('handoff state changed; retry after refresh');
      await this.audit.record(tx, {
        conversationId: current.conversationId,
        handoffRequestId: current.id,
        actorType: 'staff',
        actorId: principal.staffId,
        action: 'handoff_closed',
        outcome: 'closed',
        metadata: {
          requestId: correlationId,
          closeReason: requestedOutcome.closeReason,
          resolutionCode: requestedOutcome.resolutionCode,
        },
      });
      return this.toCloseResponse(current.id, requestedOutcome.closeReason, requestedOutcome.resolutionCode, false);
    });
  }

  async reply(
    requestId: string,
    principal: StaffPrincipal,
    content: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<StaffReplyResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.handoffRequest.findUnique({ where: { id: requestId } });
        if (!current) throw new NotFoundException('handoff request not found');
        if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('only claimed handoffs accept replies');
        if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can reply');

        const existing = await tx.operatorReply.findUnique({
          where: { handoffRequestId_idempotencyKey: { handoffRequestId: requestId, idempotencyKey } },
          include: { message: true },
        });
        if (existing) {
          await this.recordReplyAudit(tx, current, principal, existing.id, existing.message.id, correlationId, true);
          return this.toReplyResponse(requestId, existing.id, existing.message, true);
        }

        const message = await tx.message.create({
          data: {
            conversationId: current.conversationId,
            role: 'agent',
            content,
            senderType: 'human_operator',
            responseType: 'human_reply',
            agentMode: 'human_operator',
            citations: [],
          },
        });
        const reply = await tx.operatorReply.create({
          data: { handoffRequestId: current.id, messageId: message.id, operatorId: principal.staffId, idempotencyKey },
        });
        await this.recordReplyAudit(tx, current, principal, reply.id, message.id, correlationId, false);
        return this.toReplyResponse(requestId, reply.id, message, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const current = await this.prisma.handoffRequest.findUnique({ where: { id: requestId } });
      if (!current) throw error;
      if (current.status !== HandoffRequestStatus.claimed) throw new ConflictException('handoff state changed; retry after refresh');
      if (current.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can reply');
      const existing = await this.prisma.operatorReply.findUnique({
        where: { handoffRequestId_idempotencyKey: { handoffRequestId: requestId, idempotencyKey } },
        include: { message: true },
      });
      if (!existing) throw error;
      await this.prisma.$transaction((tx) => this.recordReplyAudit(tx, current, principal, existing.id, existing.message.id, correlationId, true));
      return this.toReplyResponse(requestId, existing.id, existing.message, true);
    }
  }

  async getInternalContext(requestId: string, principal: StaffPrincipal): Promise<StaffInternalContextResponse> {
    const request = await this.requireClaimedOwner(requestId, principal);
    const [notes, tags] = await Promise.all([
      this.prisma.internalNote.findMany({ where: { handoffRequestId: request.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.conversationTag.findMany({ where: { handoffRequestId: request.id, active: true }, orderBy: { tag: 'asc' } }),
    ]);
    return {
      requestId: request.id,
      conversationId: request.conversationId,
      notes: notes.map((note) => ({ id: note.id, content: note.content, operatorId: note.operatorId, createdAt: note.createdAt.toISOString() })),
      tags: tags.map((tag) => ({ tag: tag.tag as InternalTag, operatorId: tag.operatorId, createdAt: tag.createdAt.toISOString() })),
    };
  }

  async getAuditTimeline(requestId: string, limit: number, cursor?: string): Promise<StaffAuditTimelineResponse> {
    const request = await this.prisma.handoffRequest.findUnique({ where: { id: requestId }, select: { id: true, conversationId: true } });
    if (!request) throw new NotFoundException('handoff request not found');
    const after = cursor ? this.decodeTimelineCursor(cursor, requestId) : undefined;
    const events = await this.prisma.auditEvent.findMany({
      where: { handoffRequestId: request.id, conversationId: request.conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(after ? { where: { handoffRequestId: request.id, conversationId: request.conversationId, OR: [{ createdAt: { gt: after.occurredAt } }, { createdAt: after.occurredAt, id: { gt: after.eventId } }] } } : {}),
    });
    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const items = page.map((event) => this.toTimelineItem(event, request.id));
    const last = page.at(-1);
    return {
      requestId: request.id,
      conversationId: request.conversationId,
      items,
      nextCursor: hasMore && last ? this.encodeTimelineCursor(request.id, last.createdAt, last.id) : null,
    };
  }

  async addInternalNote(requestId: string, principal: StaffPrincipal, content: string, idempotencyKey: string, correlationId: string) {
    const request = await this.requireClaimedOwner(requestId, principal);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.internalNote.findUnique({
          where: { handoffRequestId_idempotencyKey: { handoffRequestId: request.id, idempotencyKey } },
        });
        if (existing) {
          await this.recordInternalAudit(tx, request, principal, 'internal_note_replayed', 'replayed', correlationId, { noteId: existing.id });
          return { requestId: request.id, note: this.toInternalNote(existing), idempotent: true };
        }
        const note = await tx.internalNote.create({
          data: { conversationId: request.conversationId, handoffRequestId: request.id, operatorId: principal.staffId, content, idempotencyKey },
        });
        await this.recordInternalAudit(tx, request, principal, 'internal_note_created', 'created', correlationId, { noteId: note.id });
        return { requestId: request.id, note: this.toInternalNote(note), idempotent: false };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.internalNote.findUnique({
        where: { handoffRequestId_idempotencyKey: { handoffRequestId: request.id, idempotencyKey } },
      });
      if (!existing) throw error;
      await this.prisma.$transaction((tx) => this.recordInternalAudit(tx, request, principal, 'internal_note_replayed', 'replayed', correlationId, { noteId: existing.id }));
      return { requestId: request.id, note: this.toInternalNote(existing), idempotent: true };
    }
  }

  async addInternalTag(requestId: string, principal: StaffPrincipal, tag: InternalTag, operationKey: string, correlationId: string): Promise<{ requestId: string; tag: InternalTag; active: boolean; idempotent: boolean }> {
    const request = await this.requireClaimedOwner(requestId, principal);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.conversationTag.findUnique({ where: { handoffRequestId_tag: { handoffRequestId: request.id, tag } } });
        if (existing?.active && existing.operationKey === operationKey) {
          await this.recordInternalAudit(tx, request, principal, 'conversation_tag_add_replayed', 'replayed', correlationId, { tag });
          return { requestId: request.id, tag, active: true, idempotent: true };
        }
        const current = existing
          ? await tx.conversationTag.update({ where: { id: existing.id }, data: { active: true, operatorId: principal.staffId, operationKey, removedAt: null } })
          : await tx.conversationTag.create({ data: { conversationId: request.conversationId, handoffRequestId: request.id, tag, operatorId: principal.staffId, operationKey } });
        await this.recordInternalAudit(tx, request, principal, 'conversation_tag_added', 'created', correlationId, { tag });
        return { requestId: request.id, tag: current.tag as InternalTag, active: true, idempotent: false };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.addInternalTag(requestId, principal, tag, operationKey, correlationId);
    }
  }

  async removeInternalTag(requestId: string, principal: StaffPrincipal, tag: InternalTag, operationKey: string, correlationId: string) {
    const request = await this.requireClaimedOwner(requestId, principal);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversationTag.findUnique({ where: { handoffRequestId_tag: { handoffRequestId: request.id, tag } } });
      if (!existing || (!existing.active && existing.operationKey === operationKey)) {
        await this.recordInternalAudit(tx, request, principal, 'conversation_tag_remove_replayed', 'replayed', correlationId, { tag });
        return { requestId: request.id, tag, active: false, idempotent: true };
      }
      await tx.conversationTag.update({ where: { id: existing.id }, data: { active: false, operationKey, removedAt: new Date(), operatorId: principal.staffId } });
      await this.recordInternalAudit(tx, request, principal, 'conversation_tag_removed', 'removed', correlationId, { tag });
      return { requestId: request.id, tag, active: false, idempotent: false };
    });
  }

  private async requireClaimedOwner(requestId: string, principal: StaffPrincipal) {
    const request = await this.prisma.handoffRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('handoff request not found');
    if (request.status !== HandoffRequestStatus.claimed) throw new ConflictException('handoff must be claimed for internal context');
    if (request.claimedBy !== principal.staffId) throw new ForbiddenException('only the claiming Operator can access internal context');
    return request;
  }

  private recordInternalAudit(
    tx: Prisma.TransactionClient,
    request: { id: string; conversationId: string },
    principal: StaffPrincipal,
    action: 'internal_note_created' | 'internal_note_replayed' | 'conversation_tag_added' | 'conversation_tag_add_replayed' | 'conversation_tag_removed' | 'conversation_tag_remove_replayed',
    outcome: 'created' | 'replayed' | 'removed',
    correlationId: string,
    metadata: Record<string, string>,
  ) {
    return this.audit.record(tx, {
      conversationId: request.conversationId,
      handoffRequestId: request.id,
      actorType: 'staff',
      actorId: principal.staffId,
      action,
      outcome,
      metadata: { requestId: correlationId, ...metadata },
    });
  }

  private toInternalNote(note: { id: string; content: string; operatorId: string; createdAt: Date }) {
    return { id: note.id, content: note.content, operatorId: note.operatorId, createdAt: note.createdAt.toISOString() };
  }

  private toTimelineItem(event: { id: string; createdAt: Date; actorType: string; actorId: string | null; action: string; outcome: string; metadata: unknown }, requestId: string) {
    const action = this.normalizeTimelineAction(event.action);
    const metadata = this.readTimelineMetadata(event.metadata);
    const closeOutcome = this.timelineCloseOutcome(action, metadata);
    return {
      eventId: event.id,
      occurredAt: event.createdAt.toISOString(),
      actorType: event.actorType === 'staff' ? 'operator' : this.normalizeActorType(event.actorType),
      actorRef: this.maskActorId(event.actorId),
      action,
      result: this.normalizeTimelineResult(event.outcome, event.action),
      subjectType: this.subjectTypeFor(action),
      subjectRef: this.subjectRefFor(action, metadata, requestId),
      tag: this.tagFor(action, metadata),
      closeReason: closeOutcome.closeReason,
      resolutionCode: closeOutcome.resolutionCode,
    };
  }

  private normalizeActorType(actorType: string): 'customer' | 'operator' | 'system' {
    if (actorType === 'customer' || actorType === 'system') return actorType;
    throw new InternalServerErrorException('unsupported audit actor type');
  }

  private normalizeTimelineAction(action: string): TimelineAction {
    if (action === 'conversation_tag_add_replayed') return 'conversation_tag_added';
    if (action === 'conversation_tag_remove_replayed') return 'conversation_tag_removed';
    const allowed: TimelineAction[] = [
      'handoff_requested', 'handoff_request_replayed', 'handoff_claimed', 'handoff_claim_replayed',
      'handoff_closed', 'handoff_close_replayed', 'operator_reply_created', 'operator_reply_replayed',
      'internal_note_created', 'internal_note_replayed', 'conversation_tag_added', 'conversation_tag_removed',
    ];
    if (!allowed.includes(action as TimelineAction)) throw new InternalServerErrorException('unsupported audit action');
    return action as TimelineAction;
  }

  private normalizeTimelineResult(outcome: string, action: string): TimelineResult {
    if (outcome === 'replayed' || action.endsWith('_replayed')) return 'replayed';
    if (outcome === 'created' || outcome === 'claimed' || outcome === 'closed' || outcome === 'removed') return 'succeeded';
    throw new InternalServerErrorException('unsupported audit outcome');
  }

  private readTimelineMetadata(metadata: unknown): Record<string, string> {
    if (metadata === null || metadata === undefined) return {};
    if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new InternalServerErrorException('invalid audit metadata');
    const entries = Object.entries(metadata);
    if (entries.some(([, value]) => typeof value !== 'string')) throw new InternalServerErrorException('invalid audit metadata');
    return Object.fromEntries(entries) as Record<string, string>;
  }

  private subjectTypeFor(action: TimelineAction): TimelineSubjectType {
    if (action.startsWith('operator_reply_')) return 'message';
    if (action.startsWith('internal_note_')) return 'internal_note';
    if (action.startsWith('conversation_tag_')) return 'conversation_tag';
    return 'handoff_request';
  }

  private subjectRefFor(action: TimelineAction, metadata: Record<string, string>, requestId: string) {
    if (action.startsWith('operator_reply_')) return metadata.messageId ?? null;
    if (action.startsWith('internal_note_')) return metadata.noteId ?? null;
    if (action.startsWith('handoff_')) return requestId;
    return null;
  }

  private tagFor(action: TimelineAction, metadata: Record<string, string>): InternalTag | null {
    if (!action.startsWith('conversation_tag_')) return null;
    const tag = metadata.tag;
    const allowed: InternalTag[] = ['urgent', 'billing', 'technical', 'follow_up'];
    if (!tag || !allowed.includes(tag as InternalTag)) throw new InternalServerErrorException('unsupported audit tag');
    return tag as InternalTag;
  }

  private timelineCloseOutcome(action: TimelineAction, metadata: Record<string, string>) {
    if (action === 'handoff_close_replayed') {
      if (Object.keys(metadata).some((key) => key !== 'requestId')) {
        throw new InternalServerErrorException('unsupported handoff close metadata');
      }
      return { closeReason: null, resolutionCode: null };
    }
    if (action !== 'handoff_closed') return { closeReason: null, resolutionCode: null };
    const allowedKeys = new Set(['requestId', 'closeReason', 'resolutionCode']);
    if (Object.keys(metadata).some((key) => !allowedKeys.has(key))) {
      throw new InternalServerErrorException('unsupported handoff close metadata');
    }
    const closeReason = metadata.closeReason;
    const resolutionCode = metadata.resolutionCode;
    if (closeReason === undefined && resolutionCode === undefined) return { closeReason: null, resolutionCode: null };
    if (!isStoredCloseReason(closeReason) || !isStoredResolutionCode(resolutionCode)) {
      throw new InternalServerErrorException('unsupported handoff close outcome');
    }
    return { closeReason, resolutionCode };
  }

  private maskActorId(actorId: string | null) {
    if (!actorId) return null;
    if (actorId.length <= 4) return '***';
    return `${actorId.slice(0, 2)}***${actorId.slice(-2)}`;
  }

  private readStoredCloseOutcome(closeReason: string | null, resolutionCode: string | null): {
    closeReason: StoredCloseReason | null;
    resolutionCode: StoredResolutionCode | null;
  } {
    if (closeReason === null && resolutionCode === null) return { closeReason: null, resolutionCode: null };
    if (!isStoredCloseReason(closeReason) || !isStoredResolutionCode(resolutionCode)) {
      throw new InternalServerErrorException('stored handoff close outcome is invalid');
    }
    return { closeReason, resolutionCode };
  }

  private closeOutcomeMatches(
    stored: { closeReason: StoredCloseReason | null; resolutionCode: StoredResolutionCode | null },
    requested: { closeReason: StoredCloseReason; resolutionCode: StoredResolutionCode },
  ) {
    if (stored.closeReason === null && stored.resolutionCode === null) {
      return requested.closeReason === 'legacy_unclassified' && requested.resolutionCode === 'legacy_unclassified';
    }
    return stored.closeReason === requested.closeReason && stored.resolutionCode === requested.resolutionCode;
  }

  private toCloseResponse(
    requestId: string,
    closeReason: StoredCloseReason | null,
    resolutionCode: StoredResolutionCode | null,
    idempotent: boolean,
  ): StaffCloseResponse {
    return { requestId, status: 'closed', closeReason, resolutionCode, idempotent };
  }

  private encodeTimelineCursor(requestId: string, occurredAt: Date, eventId: string) {
    return Buffer.from(JSON.stringify({ requestId, occurredAt: occurredAt.toISOString(), eventId }), 'utf8').toString('base64url');
  }

  private decodeTimelineCursor(cursor: string, requestId: string) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { requestId?: unknown; occurredAt?: unknown; eventId?: unknown };
      if (decoded.requestId !== requestId || typeof decoded.occurredAt !== 'string' || typeof decoded.eventId !== 'string' || Number.isNaN(Date.parse(decoded.occurredAt))) {
        throw new Error('invalid cursor');
      }
      return { occurredAt: new Date(decoded.occurredAt), eventId: decoded.eventId };
    } catch {
      throw new BadRequestException('timeline cursor is invalid');
    }
  }

  private async authorizeConversation(
    client: Pick<PrismaService, 'conversation'>,
    conversationId: string,
    accessToken: string,
  ) {
    const conversation = await client.conversation.findFirst({
      where: { id: conversationId, accessTokenHash: hashConversationToken(accessToken), status: 'active' },
      select: { id: true },
    });
    if (!conversation) throw new UnauthorizedException('conversation credential is invalid');
  }

  private recordReplay(tx: Prisma.TransactionClient, request: { id: string; conversationId: string }, reasonCode: string) {
    return this.audit.record(tx, {
      conversationId: request.conversationId,
      handoffRequestId: request.id,
      actorType: 'customer',
      action: 'handoff_request_replayed',
      outcome: 'replayed',
      metadata: { reasonCode },
    });
  }

  private recordReplyAudit(
    tx: Prisma.TransactionClient,
    request: { id: string; conversationId: string },
    principal: StaffPrincipal,
    replyId: string,
    messageId: string,
    correlationId: string,
    replayed: boolean,
  ) {
    return this.audit.record(tx, {
      conversationId: request.conversationId,
      handoffRequestId: request.id,
      actorType: 'staff',
      actorId: principal.staffId,
      action: replayed ? 'operator_reply_replayed' : 'operator_reply_created',
      outcome: replayed ? 'replayed' : 'created',
      metadata: { replyId, messageId, requestId: correlationId },
    });
  }

  private toCustomerResponse(request: {
    id: string;
    conversationId: string;
    status: HandoffRequestStatus;
    reasonCode: string;
    requestedAt: Date;
    updatedAt: Date;
    claimedAt: Date | null;
    closedAt: Date | null;
  }, idempotent: boolean): HandoffRequestResponse {
    return {
      conversationId: request.conversationId,
      requestId: request.id,
      status: request.status as ContractHandoffRequestStatus,
      reasonCode: request.reasonCode,
      requestedAt: request.requestedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      idempotent,
      ...(request.claimedAt ? { claimedAt: request.claimedAt.toISOString() } : {}),
      ...(request.closedAt ? { closedAt: request.closedAt.toISOString() } : {}),
    };
  }

  private toStaffResponse(request: {
    id: string;
    conversationId: string;
    status: HandoffRequestStatus;
    reasonCode: string;
    requestedAt: Date;
    updatedAt: Date;
    claimedBy: string | null;
    claimedAt: Date | null;
    closedAt: Date | null;
    closeReason: string | null;
    resolutionCode: string | null;
    conversation: { messages: Array<{ id: string; role: string; content: string; senderType: string | null; createdAt: Date }> };
  }): StaffHandoffRequest {
    return {
      requestId: request.id,
      conversationId: request.conversationId,
      status: request.status as ContractHandoffRequestStatus,
      reasonCode: request.reasonCode,
      requestedAt: request.requestedAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      claimedBy: request.claimedBy,
      claimedAt: request.claimedAt?.toISOString() ?? null,
      closedAt: request.closedAt?.toISOString() ?? null,
      ...this.readStaffCloseOutcome(request.closeReason, request.resolutionCode),
      recentMessages: request.conversation.messages.slice().reverse().map((message) => ({
        id: message.id,
        role: message.role as 'user' | 'agent',
        senderType: (message.senderType ?? (message.role === 'user' ? 'customer' : 'ai')) as MessageSenderType,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  private readStaffCloseOutcome(closeReason: string | null, resolutionCode: string | null) {
    return this.readStoredCloseOutcome(closeReason, resolutionCode);
  }

  private toReplyResponse(
    requestId: string,
    replyId: string,
    message: {
      id: string;
      role: 'user' | 'agent';
      content: string;
      responseType: string | null;
      agentMode: string | null;
      senderType: string | null;
      citations: unknown;
      createdAt: Date;
    },
    idempotent: boolean,
  ): StaffReplyResponse {
    return { requestId, replyId, message: this.toMessageView(message), idempotent };
  }

  private toMessageView(message: {
    id: string;
    role: 'user' | 'agent';
    content: string;
    responseType: string | null;
    agentMode: string | null;
    senderType: string | null;
    citations: unknown;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      responseType: message.responseType as ResponseType | null,
      agentMode: message.agentMode as 'mock' | 'deterministic_knowledge' | 'handoff' | 'human_operator' | null,
      senderType: (message.senderType ?? (message.role === 'user' ? 'customer' : 'ai')) as MessageSenderType,
      citations: Array.isArray(message.citations) ? message.citations : [],
      createdAt: message.createdAt.toISOString(),
    };
  }
}
