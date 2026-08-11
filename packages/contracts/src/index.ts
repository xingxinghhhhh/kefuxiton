export type ConversationStatus = 'active' | 'closed';
export type MessageRole = 'user' | 'agent';
export type AgentMode = 'mock' | 'deterministic_knowledge' | 'handoff' | 'human_operator';
export type ResponseType = 'safe_unavailable' | 'knowledge_answer' | 'handoff_recommended' | 'handoff_requested' | 'handoff_pending' | 'human_reply' | 'mock_fallback';
export type HandoffRequestStatus = 'requested' | 'claimed' | 'closed';
export type MessageSenderType = 'customer' | 'ai' | 'human_operator' | 'system';
export const FEEDBACK_VALUES = ['helpful', 'not_helpful'] as const;
export type FeedbackValue = typeof FEEDBACK_VALUES[number];
export type FeedbackStatus = 'recorded' | 'replayed' | 'already_recorded';
export type StaffPermission = 'handoff:read' | 'handoff:claim' | 'handoff:close' | 'handoff:reply' | 'handoff:context' | 'conversation:read';
export type InternalTag = 'urgent' | 'billing' | 'technical' | 'follow_up';
export const CLOSE_REASONS = [
  'operator_completed',
  'customer_requested_close',
  'duplicate_request',
  'out_of_scope',
  'unable_to_resolve',
] as const;
export type CloseReason = typeof CLOSE_REASONS[number];
export const RESOLUTION_CODES = ['resolved', 'partially_resolved', 'unresolved', 'no_action_required'] as const;
export type ResolutionCode = typeof RESOLUTION_CODES[number];
export const LEGACY_UNCLASSIFIED = 'legacy_unclassified' as const;
export type StoredCloseReason = CloseReason | typeof LEGACY_UNCLASSIFIED;
export type StoredResolutionCode = ResolutionCode | typeof LEGACY_UNCLASSIFIED;
export type TimelineAction =
  | 'handoff_requested'
  | 'handoff_request_replayed'
  | 'handoff_claimed'
  | 'handoff_claim_replayed'
  | 'handoff_closed'
  | 'handoff_close_replayed'
  | 'operator_reply_created'
  | 'operator_reply_replayed'
  | 'internal_note_created'
  | 'internal_note_replayed'
  | 'conversation_tag_added'
  | 'conversation_tag_removed';
export type TimelineResult = 'succeeded' | 'replayed' | 'rejected';
export type TimelineSubjectType = 'handoff_request' | 'message' | 'internal_note' | 'conversation_tag';

export interface Citation {
  id: string;
  title: string;
  uri: string;
  version?: string;
  locator?: string;
  contentSha256?: string;
}

export interface ConversationSummary {
  conversationId: string;
  status: ConversationStatus;
  createdAt: string;
}

export interface CreateConversationResponse extends ConversationSummary {
  accessToken: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface MessageView {
  id: string;
  role: MessageRole;
  content: string;
  responseType: ResponseType | null;
  agentMode: AgentMode | null;
  senderType: MessageSenderType;
  citations: Citation[];
  createdAt: string;
  feedback: MessageFeedbackSummary | null;
}

export interface MessageFeedbackSummary {
  value: FeedbackValue;
  submittedAt: string;
}

export interface MessageFeedbackRequest {
  value: FeedbackValue;
  idempotencyKey: string;
}

export interface MessageFeedbackResponse {
  feedbackId: string;
  conversationId: string;
  messageId: string;
  value: FeedbackValue;
  status: FeedbackStatus;
  idempotent: boolean;
}

export interface SendMessageResponse {
  conversationId: string;
  messages: MessageView[];
  agentMode: AgentMode;
  responseType: ResponseType;
  citations: Citation[];
  handoffRecommended: boolean;
  handoffStatus: HandoffRequestStatus | null;
  handoffRequestId: string | null;
  assistantMessageId: string | null;
}

export interface HandoffRequestResponse {
  conversationId: string;
  requestId: string;
  status: HandoffRequestStatus;
  reasonCode: string;
  requestedAt: string;
  updatedAt: string;
  idempotent: boolean;
  claimedAt?: string;
  closedAt?: string;
}

export interface HandoffActionResponse {
  requestId: string;
  status: HandoffRequestStatus;
  idempotent: boolean;
}

export interface StaffCloseResponse {
  requestId: string;
  status: 'closed';
  closeReason: StoredCloseReason | null;
  resolutionCode: StoredResolutionCode | null;
  idempotent: boolean;
}

export interface ConversationMessagesResponse {
  conversationId: string;
  messages: MessageView[];
}

export interface StaffReplyResponse {
  requestId: string;
  replyId: string;
  message: MessageView;
  idempotent: boolean;
}

export interface InternalNoteView {
  id: string;
  content: string;
  operatorId: string;
  createdAt: string;
}

export interface ConversationTagView {
  tag: InternalTag;
  operatorId: string;
  createdAt: string;
}

export interface StaffInternalContextResponse {
  requestId: string;
  conversationId: string;
  notes: InternalNoteView[];
  tags: ConversationTagView[];
}

export interface StaffAuditTimelineItem {
  eventId: string;
  occurredAt: string;
  actorType: 'customer' | 'operator' | 'system';
  actorRef: string | null;
  action: TimelineAction;
  result: TimelineResult;
  subjectType: TimelineSubjectType;
  subjectRef: string | null;
  tag: InternalTag | null;
  closeReason: StoredCloseReason | null;
  resolutionCode: StoredResolutionCode | null;
}

export interface StaffAuditTimelineResponse {
  requestId: string;
  conversationId: string;
  items: StaffAuditTimelineItem[];
  nextCursor: string | null;
}

export interface StaffHandoffMessage {
  id: string;
  role: MessageRole;
  senderType: MessageSenderType;
  content: string;
  createdAt: string;
}

export interface StaffHandoffRequest {
  requestId: string;
  conversationId: string;
  status: HandoffRequestStatus;
  reasonCode: string;
  requestedAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  closedAt: string | null;
  closeReason: StoredCloseReason | null;
  resolutionCode: StoredResolutionCode | null;
  recentMessages: StaffHandoffMessage[];
}

export interface StaffHandoffListResponse {
  items: StaffHandoffRequest[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
