'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { CreateConversationResponse, FeedbackValue, HandoffRequestStatus, MessageView, SendMessageResponse } from '@ai-agent/contracts';
import { createConversation, getHandoffStatus, getMessages, requestHandoff, sendMessage, submitMessageFeedback } from '../../lib/api-client';

export function ChatShell() {
  const [conversation, setConversation] = useState<CreateConversationResponse | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'sending' | 'error'>('loading');
  const [error, setError] = useState('');
  const [handoffRecommended, setHandoffRecommended] = useState(false);
  const [handoffStatus, setHandoffStatus] = useState<HandoffRequestStatus | null>(null);
  const [handoffError, setHandoffError] = useState('');
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = window.sessionStorage.getItem('ai-agent-conversation');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CreateConversationResponse;
        if (parsed.conversationId && parsed.accessToken) {
          setConversation(parsed);
          void restoreHandoffStatus(parsed);
          return;
        }
      } catch {
        window.sessionStorage.removeItem('ai-agent-conversation');
      }
    }
    void startConversation();
  }, []);

  async function restoreHandoffStatus(storedConversation: CreateConversationResponse) {
    try {
      const history = await getMessages(storedConversation);
      setMessages(history.messages);
    } catch {
      setError('暂时无法读取消息历史，请稍后刷新。');
    }
    try {
      const handoff = await getHandoffStatus(storedConversation);
      setHandoffStatus(handoff?.status ?? null);
      setHandoffRecommended(handoff?.status !== undefined && handoff?.status !== null && handoff.status !== 'closed');
    } catch {
      setHandoffError('暂时无法读取转人工状态，请稍后刷新。');
    } finally {
      setStatus('ready');
    }
  }

  async function startConversation() {
    setStatus('loading');
    setError('');
    try {
      const created = await createConversation();
      window.sessionStorage.setItem('ai-agent-conversation', JSON.stringify(created));
      setConversation(created);
      setStatus('ready');
    } catch {
      setError('暂时无法创建演示会话，请检查后端是否已启动。');
      setStatus('error');
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!conversation || !trimmed || status === 'sending') return;
    setStatus('sending');
    setError('');
    setHandoffRecommended(false);
    try {
      const result: SendMessageResponse = await sendMessage(conversation, trimmed);
      setMessages((current) => [...current, ...result.messages]);
      setHandoffRecommended(result.handoffRecommended);
      setHandoffStatus(result.handoffStatus);
      setContent('');
      setStatus('ready');
    } catch {
      setError('消息发送失败，请稍后重试。');
      setStatus('ready');
    }
  }

  async function onRequestHandoff() {
    if (!conversation || handoffStatus === 'requested') return;
    setHandoffError('');
    try {
      const result = await requestHandoff(conversation);
      setHandoffStatus(result.status);
      setHandoffRecommended(true);
    } catch {
      setHandoffError('转人工请求失败，请稍后重试。');
    }
  }

  async function onFeedback(message: MessageView, value: FeedbackValue) {
    if (!conversation || message.feedback || feedbackSubmittingId) return;
    setFeedbackSubmittingId(message.id);
    setFeedbackNotice((current) => ({ ...current, [message.id]: '' }));
    try {
      const result = await submitMessageFeedback(conversation, message.id, value, `feedback-${message.id}`);
      setMessages((current) => current.map((item) => item.id === message.id ? {
        ...item,
        feedback: { value: result.value, submittedAt: new Date().toISOString() },
      } : item));
      const notice = result.status === 'recorded' ? '反馈已记录。' : result.status === 'replayed' ? '反馈已确认。' : '该消息已记录过反馈。';
      setFeedbackNotice((current) => ({ ...current, [message.id]: notice }));
    } catch {
      setFeedbackNotice((current) => ({ ...current, [message.id]: '反馈提交失败，请重试。' }));
    } finally {
      setFeedbackSubmittingId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="chat-card" aria-labelledby="chat-title">
        <header className="chat-header">
          <div>
            <p className="eyebrow">AI 客服 Agent · N1 演示</p>
            <h1 id="chat-title">安全会话闭环</h1>
          </div>
          <span className="mode-badge">Mock Agent</span>
        </header>

        <div className="notice" role="note">
          当前为本地演示模式，尚未接入真实模型、知识库或企业业务数据。
        </div>

        <div className="message-list" aria-live="polite">
          {messages.length === 0 && (
            <p className="empty-state">发送一个问题，查看安全的 Mock Agent 响应。</p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <span className="message-role">{message.senderType === 'human_operator' ? '人工客服' : message.role === 'user' ? '你' : '演示 Agent'}</span>
              <p>{message.content}</p>
              {message.responseType && <small>响应类型：{message.responseType}</small>}
              {message.citations.length > 0 && (
                <div aria-label="knowledge citations">
                  <small>知识来源：</small>
                  <ul>
                    {message.citations.map((citation) => (
                      <li key={citation.id}>
                        {citation.title} · {citation.version ?? 'unknown'} · {citation.locator ?? citation.uri}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {message.role === 'agent' && (message.senderType === 'ai' || message.senderType === 'human_operator') && message.responseType !== 'handoff_pending' && (
                <div className="message-feedback" aria-label="消息反馈">
                  <span>这条回复有帮助吗？</span>
                  <button
                    type="button"
                    aria-pressed={message.feedback?.value === 'helpful'}
                    disabled={Boolean(message.feedback) || feedbackSubmittingId !== null}
                    onClick={() => void onFeedback(message, 'helpful')}
                  >
                    有帮助
                  </button>
                  <button
                    type="button"
                    aria-pressed={message.feedback?.value === 'not_helpful'}
                    disabled={Boolean(message.feedback) || feedbackSubmittingId !== null}
                    onClick={() => void onFeedback(message, 'not_helpful')}
                  >
                    没帮助
                  </button>
                  {feedbackNotice[message.id] && <small role="status">{feedbackNotice[message.id]}</small>}
                </div>
              )}
            </article>
          ))}
        </div>

        {handoffRecommended && handoffStatus === null && (
          <div className="handoff-panel" role="status">
            <p>建议转人工服务台处理。</p>
            <button type="button" onClick={() => void onRequestHandoff()}>
              请求人工接入
            </button>
          </div>
        )}
        {handoffStatus && (
          <p role="status">
            {handoffStatus === 'requested' && '已提交转人工请求，正在等待人工接入。'}
            {handoffStatus === 'claimed' && '人工已接管当前请求，正在等待处理。'}
            {handoffStatus === 'closed' && '人工接管请求已关闭，当前不会继续自动回复。'}
            {' '}人工接管期间不会继续自动回复。
          </p>
        )}
        {handoffError && <p className="error-message" role="alert">{handoffError}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}

        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="message">发送问题</label>
          <textarea
            id="message"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            placeholder="例如：请介绍一下这个演示环境"
            disabled={status !== 'ready' || handoffStatus !== null}
            rows={3}
          />
          <div className="composer-footer">
            <span>{status === 'loading' ? '正在创建会话…' : `${content.length}/2000`}</span>
            <button type="submit" disabled={!conversation || !content.trim() || status !== 'ready'}>
              {status === 'sending' ? '发送中…' : '发送'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
