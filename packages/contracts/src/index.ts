export type ConversationStatus = 'active' | 'closed';
export type MessageRole = 'user' | 'agent';
export type AgentMode = 'mock' | 'deterministic_knowledge';
export type ResponseType = 'safe_unavailable' | 'knowledge_answer' | 'handoff_recommended' | 'mock_fallback';

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
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
