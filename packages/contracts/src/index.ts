export type ConversationStatus = 'active' | 'closed';
export type MessageRole = 'user' | 'agent';
export type AgentMode = 'mock' | 'deterministic_knowledge' | 'handoff';
export type ResponseType = 'safe_unavailable' | 'knowledge_answer' | 'handoff_recommended' | 'handoff_requested' | 'handoff_pending' | 'mock_fallback';
export type HandoffRequestStatus = 'requested' | 'claimed' | 'closed';
export type StaffPermission = 'handoff:read' | 'handoff:claim' | 'handoff:close' | 'conversation:read';

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
  citations: Citation[];
  createdAt: string;
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

export interface StaffHandoffMessage {
  id: string;
  role: MessageRole;
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
