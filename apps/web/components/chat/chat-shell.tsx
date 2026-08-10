'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { CreateConversationResponse, MessageView, SendMessageResponse } from '@ai-agent/contracts';
import { createConversation, sendMessage } from '../../lib/api-client';

export function ChatShell() {
  const [conversation, setConversation] = useState<CreateConversationResponse | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'sending' | 'error'>('loading');
  const [error, setError] = useState('');
  const [handoffRecommended, setHandoffRecommended] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem('ai-agent-conversation');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CreateConversationResponse;
        if (parsed.conversationId && parsed.accessToken) {
          setConversation(parsed);
          setStatus('ready');
          return;
        }
      } catch {
        window.sessionStorage.removeItem('ai-agent-conversation');
      }
    }
    void startConversation();
  }, []);

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
      setContent('');
      setStatus('ready');
    } catch {
      setError('消息发送失败，请稍后重试。');
      setStatus('ready');
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
              <span className="message-role">{message.role === 'user' ? '你' : '演示 Agent'}</span>
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
            </article>
          ))}
        </div>

        {handoffRecommended && <p role="status">建议转人工服务台处理。</p>}
        {error && <p className="error-message" role="alert">{error}</p>}

        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="message">发送问题</label>
          <textarea
            id="message"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            placeholder="例如：请介绍一下这个演示环境"
            disabled={status !== 'ready'}
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
