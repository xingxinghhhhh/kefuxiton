import type {
  ApiErrorResponse,
  CreateConversationResponse,
  HandoffRequestResponse,
  HandoffActionResponse,
  HandoffRequestStatus,
  ConversationMessagesResponse,
  StaffReplyResponse,
  StaffInternalContextResponse,
  InternalTag,
  StaffAuditTimelineResponse,
  StaffHandoffListResponse,
  SendMessageRequest,
  SendMessageResponse,
  CloseReason,
  ResolutionCode,
  StaffCloseResponse,
} from '@ai-agent/contracts';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(payload?.error.message ?? '请求失败');
  }
  return (await response.json()) as T;
}

export function createConversation() {
  return request<CreateConversationResponse>('/conversations', { method: 'POST' });
}

export function sendMessage(conversation: CreateConversationResponse, content: string) {
  const body: SendMessageRequest = { content };
  return request<SendMessageResponse>(`/conversations/${conversation.conversationId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    body: JSON.stringify(body),
  });
}

export function getMessages(conversation: CreateConversationResponse) {
  return request<ConversationMessagesResponse>(`/conversations/${conversation.conversationId}/messages`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
  });
}

export function requestHandoff(conversation: CreateConversationResponse) {
  return request<HandoffRequestResponse>(`/conversations/${conversation.conversationId}/handoff-requests`, {
    method: 'POST',
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    body: JSON.stringify({ reasonCode: 'customer_requested' }),
  });
}

export function getHandoffStatus(conversation: CreateConversationResponse) {
  return request<HandoffRequestResponse | null>(`/conversations/${conversation.conversationId}/handoff-requests`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
  });
}

export function listStaffHandoffs(staffToken: string, status?: HandoffRequestStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<StaffHandoffListResponse>(`/staff/handoff-requests${query}`, {
    headers: { authorization: `Staff ${staffToken}` },
  });
}

export function claimStaffHandoff(staffToken: string, requestId: string) {
  return request<HandoffActionResponse>(`/staff/handoff-requests/${requestId}/claim`, {
    method: 'POST',
    headers: { authorization: `Staff ${staffToken}` },
  });
}

export function closeStaffHandoff(staffToken: string, requestId: string, closeReason: CloseReason, resolutionCode: ResolutionCode) {
  return request<StaffCloseResponse>(`/staff/handoff-requests/${requestId}/close`, {
    method: 'POST',
    headers: { authorization: `Staff ${staffToken}` },
    body: JSON.stringify({ closeReason, resolutionCode }),
  });
}

export function sendStaffReply(staffToken: string, requestId: string, content: string, idempotencyKey: string) {
  return request<StaffReplyResponse>(`/staff/handoff-requests/${requestId}/replies`, {
    method: 'POST',
    headers: { authorization: `Staff ${staffToken}`, 'x-idempotency-key': idempotencyKey },
    body: JSON.stringify({ content, idempotencyKey }),
  });
}

export function getStaffInternalContext(staffToken: string, requestId: string) {
  return request<StaffInternalContextResponse>(`/staff/handoff-requests/${requestId}/internal-context`, {
    headers: { authorization: `Staff ${staffToken}` },
  });
}

export function getStaffAuditTimeline(staffToken: string, requestId: string, limit = 50, cursor?: string) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return request<StaffAuditTimelineResponse>(`/staff/handoff-requests/${requestId}/timeline?${query.toString()}`, {
    headers: { authorization: `Staff ${staffToken}` },
  });
}

export function addStaffInternalNote(staffToken: string, requestId: string, content: string, idempotencyKey: string) {
  return request<{ requestId: string; note: StaffInternalContextResponse['notes'][number]; idempotent: boolean }>(`/staff/handoff-requests/${requestId}/notes`, {
    method: 'POST',
    headers: { authorization: `Staff ${staffToken}`, 'x-idempotency-key': idempotencyKey },
    body: JSON.stringify({ content }),
  });
}

export function addStaffInternalTag(staffToken: string, requestId: string, tag: InternalTag, idempotencyKey: string) {
  return request<{ requestId: string; tag: InternalTag; active: boolean; idempotent: boolean }>(`/staff/handoff-requests/${requestId}/tags`, {
    method: 'POST',
    headers: { authorization: `Staff ${staffToken}`, 'x-idempotency-key': idempotencyKey },
    body: JSON.stringify({ tag }),
  });
}

export function removeStaffInternalTag(staffToken: string, requestId: string, tag: InternalTag, idempotencyKey: string) {
  return request<{ requestId: string; tag: InternalTag; active: boolean; idempotent: boolean }>(`/staff/handoff-requests/${requestId}/tags/${tag}`, {
    method: 'DELETE',
    headers: { authorization: `Staff ${staffToken}`, 'x-idempotency-key': idempotencyKey },
  });
}
