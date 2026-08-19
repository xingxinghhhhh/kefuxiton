'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { CreateConversationResponse, FeedbackValue, HandoffRequestStatus, MessageView, SendMessageResponse } from '@ai-agent/contracts';
import { createConversation, getHandoffStatus, getMessages, requestHandoff, sendMessage, submitMessageFeedback } from '../../lib/api-client';

const QUICK_PROMPTS = ['请介绍一下这个演示环境', '我需要人工客服帮助', '这个答案的知识来源是什么？'];

function formatTime(value?: string) {
  if (!value) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function responseLabel(value: MessageView['responseType']) {
  if (value === 'safe_unavailable') return '安全拒答';
  if (value === 'handoff_pending') return '等待人工';
  if (value === 'knowledge_answer') return '知识回答';
  return value ?? '系统消息';
}

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
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: { value: result.value, submittedAt: new Date().toISOString() } } : item));
      const notice = result.status === 'recorded' ? '反馈已记录。' : result.status === 'replayed' ? '反馈已确认。' : '该消息已记录过反馈。';
      setFeedbackNotice((current) => ({ ...current, [message.id]: notice }));
    } catch {
      setFeedbackNotice((current) => ({ ...current, [message.id]: '反馈提交失败，请重试。' }));
    } finally {
      setFeedbackSubmittingId(null);
    }
  }

  const composerDisabled = status !== 'ready' || handoffStatus !== null;

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="应用导航">
        <div className="brand-mark"><span className="brand-icon">AI</span><div><div className="brand-name">客服智能工作台</div><p className="brand-subtitle">安全对话 · 可追溯</p></div></div>
        <p className="side-label">工作空间</p>
        <nav className="side-nav"><Link className="active" href="/chat"><span className="nav-label"><span className="nav-icon">◈</span>客户对话</span><span className="nav-pill">Live</span></Link><Link href="/staff/handoffs"><span className="nav-label"><span className="nav-icon">▣</span>客服工作台</span></Link></nav>
        <div className="sidebar-spacer" /><div className="sidebar-status"><strong><span className="status-dot" />本地演示环境</strong><p>仅使用 synthetic / local_eval 数据。生产能力默认关闭。</p></div>
      </aside>
      <main className="workspace">
        <header className="workspace-topbar"><div><p className="breadcrumb">工作台 / 客户对话</p><h1 className="workspace-title">安全会话闭环</h1></div><div className="topbar-actions"><span className="environment-pill"><span className="status-dot" />本地演示</span><Link className="topbar-link" href="/staff/handoffs">前往客服工作台 →</Link></div></header>
        <div className="workspace-grid">
          <section className="chat-panel" aria-labelledby="chat-title">
            <header className="panel-header"><span className="panel-avatar">AI</span><div><h2 id="chat-title">演示客服</h2><p><span className="status-dot" />Mock Agent · 本地演示</p></div><span className="panel-header-spacer" /><span className="session-chip">匿名会话</span></header>
            <div className="boundary-banner" role="note"><span className="boundary-icon">!</span><span>当前为本地演示模式，尚未接入真实模型、知识库或企业业务数据。回答只基于已发布能力，未命中时会保守拒答。</span></div>
            <div className="conversation-body message-list" aria-live="polite">
              {messages.length === 0 && <div className="empty-state"><div className="empty-state-inner"><div className="empty-state-icon">AI</div><strong>还没有消息</strong><p>发送一个问题，查看安全的 Mock Agent 响应。</p></div></div>}
              {messages.map((message) => <article key={message.id} className={`message message-${message.role}`}><div className="message-meta"><span className="message-avatar">{message.role === 'user' ? '你' : message.senderType === 'human_operator' ? '人' : 'AI'}</span><span>{message.senderType === 'human_operator' ? '人工客服' : message.role === 'user' ? '你' : '演示 Agent'}</span><time>{formatTime(message.createdAt)}</time></div><div className="message-bubble"><p>{message.content}</p>{message.responseType && <small className="response-tag">{responseLabel(message.responseType)} · {message.responseType}</small>}{message.citations.length > 0 && <div className="citation-block" aria-label="knowledge citations"><small>知识来源</small><ul className="citation-list">{message.citations.map((citation) => <li key={citation.id}><strong>{citation.title}</strong><span>{citation.version ?? 'unknown'} · {citation.locator ?? citation.uri}</span></li>)}</ul></div>}</div>{message.role === 'agent' && (message.senderType === 'ai' || message.senderType === 'human_operator') && message.responseType !== 'handoff_pending' && <div className="message-feedback" aria-label="消息反馈"><span>这条回复有帮助吗？</span><button type="button" aria-pressed={message.feedback?.value === 'helpful'} disabled={Boolean(message.feedback) || feedbackSubmittingId !== null} onClick={() => void onFeedback(message, 'helpful')}>有帮助</button><button type="button" aria-pressed={message.feedback?.value === 'not_helpful'} disabled={Boolean(message.feedback) || feedbackSubmittingId !== null} onClick={() => void onFeedback(message, 'not_helpful')}>没帮助</button>{feedbackNotice[message.id] && <small role="status">{feedbackNotice[message.id]}</small>}</div>}</article>)}
            </div>
            {handoffRecommended && handoffStatus === null && <div className="handoff-panel" role="status"><div><strong>建议转人工服务台处理</strong><p>当前问题需要人工进一步确认，提交后会暂停自动回复。</p></div><button type="button" onClick={() => void onRequestHandoff()}>请求人工接入</button></div>}
            {handoffStatus && <p className="handoff-status" role="status"><span className="status-dot" />{handoffStatus === 'requested' && '已提交转人工请求，正在等待人工接入。'}{handoffStatus === 'claimed' && '人工已接管当前请求，正在等待处理。'}{handoffStatus === 'closed' && '人工接管请求已关闭，当前不会继续自动回复。'} 人工接管期间不会继续自动回复。</p>}
            {handoffError && <p className="error-message" role="alert">{handoffError}</p>}{error && <p className="error-message" role="alert">{error}</p>}
            <form className="composer" onSubmit={onSubmit}>{messages.length === 0 && status === 'ready' && <div className="quick-prompts" aria-label="快捷问题">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => setContent(prompt)}>{prompt}</button>)}</div>}<label htmlFor="message">发送问题</label><textarea id="message" value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder="例如：请介绍一下这个演示环境" disabled={composerDisabled} rows={3} /><div className="composer-footer"><span>{status === 'loading' ? '正在创建会话…' : `${content.length}/2000`}</span><button type="submit" disabled={!conversation || !content.trim() || status !== 'ready'}>{status === 'sending' ? '发送中…' : '发送'}</button></div></form>
          </section>
          <aside className="insight-rail" aria-label="会话信息"><section className="insight-card"><div className="insight-card-header"><h2>会话状态</h2><span className="status-label"><span className="status-dot" />在线</span></div><dl className="detail-list"><div><dt>会话模式</dt><dd>匿名演示</dd></div><div><dt>消息数量</dt><dd>{messages.length} 条</dd></div><div><dt>人工接管</dt><dd>{handoffStatus ? '处理中' : '未触发'}</dd></div></dl></section><section className="insight-card"><div className="insight-card-header"><h2>安全边界</h2><span className="shield-mark">✓</span></div><ul className="boundary-list"><li><span>✓</span>引用来自服务端</li><li><span>✓</span>未命中保守拒答</li><li><span>✓</span>客户与客服隔离</li></ul></section><section className="insight-card rail-note"><p className="eyebrow">当前环境</p><strong>synthetic / local_eval</strong><p>此页面不会保存客户正文、Token 或内部上下文。</p></section></aside>
        </div>
      </main>
    </div>
  );
}
