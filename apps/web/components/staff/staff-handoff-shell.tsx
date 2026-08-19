'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { CLOSE_REASONS, RESOLUTION_CODES, type CloseReason, type HandoffRequestStatus, type InternalTag, type ResolutionCode, type StaffAuditTimelineResponse, type StaffHandoffRequest, type StaffInternalContextResponse } from '@ai-agent/contracts';
import { addStaffInternalNote, addStaffInternalTag, claimStaffHandoff, closeStaffHandoff, getStaffAuditTimeline, getStaffInternalContext, listStaffHandoffs, removeStaffInternalTag, sendStaffReply } from '../../lib/api-client';

type DraftMap = Record<string, string>;
type KeyMap = Record<string, string>;
type ContextMap = Record<string, StaffInternalContextResponse>;
type TimelineMap = Record<string, StaffAuditTimelineResponse>;
type CloseReasonDraftMap = Record<string, CloseReason | ''>;
type ResolutionDraftMap = Record<string, ResolutionCode | ''>;

const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  operator_completed: 'Operator 已完成处理（合成）',
  customer_requested_close: '客户主动结束（合成）',
  duplicate_request: '重复请求（合成）',
  out_of_scope: '超出范围（合成）',
  unable_to_resolve: '暂未解决（合成）',
};

const RESOLUTION_LABELS: Record<ResolutionCode, string> = {
  resolved: '已解决（合成）',
  partially_resolved: '部分解决（合成）',
  unresolved: '未解决（合成）',
  no_action_required: '无需处理（合成）',
};

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function timelineResultLabel(result: StaffAuditTimelineResponse['items'][number]) {
  if (result.action === 'message_feedback_conflict') return '冲突';
  if (result.result === 'replayed') return '重复';
  if (result.result === 'succeeded') return '成功';
  return '拒绝';
}

function feedbackLabel(value: StaffAuditTimelineResponse['items'][number]['feedbackValue']) {
  if (value === 'helpful') return '有帮助';
  if (value === 'not_helpful') return '没帮助';
  return null;
}

function shortSubjectRef(value: string | null) {
  return value ? `${value.slice(0, 8)}…` : null;
}

export function StaffHandoffShell() {
  const [staffToken, setStaffToken] = useState('');
  const [items, setItems] = useState<StaffHandoffRequest[]>([]);
  const [queueStatus, setQueueStatus] = useState<HandoffRequestStatus>('requested');
  const [replyDrafts, setReplyDrafts] = useState<DraftMap>({});
  const [replyKeys, setReplyKeys] = useState<KeyMap>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [contexts, setContexts] = useState<ContextMap>({});
  const [timelines, setTimelines] = useState<TimelineMap>({});
  const [closeReasonDrafts, setCloseReasonDrafts] = useState<CloseReasonDraftMap>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<ResolutionDraftMap>({});
  const [noteDrafts, setNoteDrafts] = useState<DraftMap>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, InternalTag>>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');

  async function loadQueue(statusToLoad = queueStatus) {
    if (!staffToken.trim()) return;
    setStatus('loading');
    setError('');
    try {
      const result = await listStaffHandoffs(staffToken.trim(), statusToLoad);
      setItems(result.items);
      if (statusToLoad === 'claimed') {
        const loaded = await Promise.all(result.items.map(async (item) => {
          const [context, timeline] = await Promise.all([
            getStaffInternalContext(staffToken.trim(), item.requestId),
            getStaffAuditTimeline(staffToken.trim(), item.requestId),
          ]);
          return [item.requestId, context, timeline] as const;
        }));
        setContexts(Object.fromEntries(loaded.map(([requestId, context]) => [requestId, context])));
        setTimelines(Object.fromEntries(loaded.map(([requestId, , timeline]) => [requestId, timeline])));
      }
      setStatus('ready');
    } catch {
      setError('无法访问客服队列，请确认 Staff 身份或服务配置。');
      setStatus('error');
    }
  }

  async function updateRequest(request: StaffHandoffRequest, action: 'claim') {
    setError('');
    try {
      await claimStaffHandoff(staffToken.trim(), request.requestId);
      const nextStatus: HandoffRequestStatus = 'claimed';
      setQueueStatus(nextStatus);
      await loadQueue(nextStatus);
    } catch {
      setError('状态更新失败，请刷新后重试。');
    }
  }

  async function submitClose(event: FormEvent<HTMLFormElement>, request: StaffHandoffRequest) {
    event.preventDefault();
    const closeReason = closeReasonDrafts[request.requestId];
    const resolutionCode = resolutionDrafts[request.requestId];
    if (!closeReason || !resolutionCode) {
      setError('关闭接管前请选择关闭原因和处理结果。');
      return;
    }
    setError('');
    try {
      await closeStaffHandoff(staffToken.trim(), request.requestId, closeReason, resolutionCode);
      setQueueStatus('closed');
      await loadQueue('closed');
    } catch {
      setError('关闭接管失败，请刷新后重试。');
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>, request: StaffHandoffRequest) {
    event.preventDefault();
    const content = (replyDrafts[request.requestId] ?? '').trim();
    if (!content || sendingReply) return;
    const idempotencyKey = replyKeys[request.requestId] ?? createIdempotencyKey();
    setReplyKeys((current) => ({ ...current, [request.requestId]: idempotencyKey }));
    setSendingReply(request.requestId);
    setError('');
    try {
      await sendStaffReply(staffToken.trim(), request.requestId, content, idempotencyKey);
      setReplyDrafts((current) => ({ ...current, [request.requestId]: '' }));
      setReplyKeys((current) => {
        const next = { ...current };
        delete next[request.requestId];
        return next;
      });
      await loadQueue('claimed');
    } catch {
      setError('人工回复发送失败，内容已保留，请重试。');
    } finally {
      setSendingReply(null);
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>, request: StaffHandoffRequest) {
    event.preventDefault();
    const content = (noteDrafts[request.requestId] ?? '').trim();
    if (!content) return;
    try {
      await addStaffInternalNote(staffToken.trim(), request.requestId, content, createIdempotencyKey());
      setNoteDrafts((current) => ({ ...current, [request.requestId]: '' }));
      await loadQueue('claimed');
    } catch {
      setError('Internal note failed; content was kept for retry.');
    }
  }

  async function updateTag(request: StaffHandoffRequest, tag: InternalTag, active: boolean) {
    try {
      if (active) await addStaffInternalTag(staffToken.trim(), request.requestId, tag, createIdempotencyKey());
      else await removeStaffInternalTag(staffToken.trim(), request.requestId, tag, createIdempotencyKey());
      await loadQueue('claimed');
    } catch {
      setError('Internal tag update failed; refresh and retry.');
    }
  }

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="应用导航">
        <div className="brand-mark"><span className="brand-icon">AI</span><div><div className="brand-name">客服智能工作台</div><p className="brand-subtitle">安全对话 · 可追溯</p></div></div>
        <p className="side-label">工作空间</p>
        <nav className="side-nav"><Link href="/chat"><span className="nav-label"><span className="nav-icon">◈</span>客户对话</span></Link><Link className="active" href="/staff/handoffs"><span className="nav-label"><span className="nav-icon">▣</span>客服工作台</span><span className="nav-pill">Staff</span></Link></nav>
        <div className="sidebar-spacer" /><div className="sidebar-status"><strong><span className="status-dot" />测试身份模式</strong><p>服务端默认拒绝生产 Staff 身份。队列数据仅限合成演练。</p></div>
      </aside>
      <main className="workspace">
        <header className="workspace-topbar"><div><p className="breadcrumb">工作台 / 客服工作台</p><h1 className="workspace-title">人工接管工作台</h1></div><div className="topbar-actions"><span className="environment-pill"><span className="status-dot" />非生产</span><Link className="topbar-link" href="/chat">返回客户对话 →</Link></div></header>
        <div className="staff-layout">
          <section className="staff-card" aria-labelledby="staff-handoff-title">
            <header className="panel-header"><span className="panel-avatar staff-avatar">S</span><div><h2 id="staff-handoff-title">接管队列</h2><p><span className="status-dot" />仅限测试身份 · 非生产</p></div><span className="panel-header-spacer" /><span className="session-chip">Staff access</span></header>
            <p className="boundary-banner staff-notice"><span className="boundary-icon">!</span><span>当前页面只用于测试身份适配器验证。未配置正式 Staff 身份时，服务端默认拒绝访问。</span></p>
            <form className="staff-toolbar composer" onSubmit={(event) => { event.preventDefault(); void loadQueue(); }}><div className="toolbar-field"><label htmlFor="staff-token">Staff 测试 Token</label><input id="staff-token" type="password" value={staffToken} onChange={(event) => setStaffToken(event.target.value)} autoComplete="off" placeholder="输入合成测试身份" /></div><button type="submit" disabled={!staffToken.trim() || status === 'loading'}>{status === 'loading' ? '加载中…' : '加载队列'}</button></form>
            <div className="staff-toolbar secondary"><div><label htmlFor="handoff-status-filter">队列状态</label><select id="handoff-status-filter" aria-label="handoff status filter" value={queueStatus} onChange={(event) => { const nextStatus = event.target.value as HandoffRequestStatus; setQueueStatus(nextStatus); void loadQueue(nextStatus); }}><option value="requested">requested</option><option value="claimed">claimed</option><option value="closed">closed</option></select></div><div className="queue-summary"><strong>{items.length}</strong><span>{status === 'loading' ? '正在同步' : '当前队列请求'}</span></div></div>
            {error && <p className="error-message" role="alert">{error}</p>}{status === 'ready' && items.length === 0 && <p className="empty-queue" role="status"><strong>当前没有符合条件的接管请求</strong><span>选择其他状态，或使用合成测试身份加载队列。</span></p>}
            <div className="message-list staff-request-list" aria-live="polite">
              {items.map((request) => <article key={request.requestId} className={`message staff-request request-${request.status}`}><div className="request-heading"><div><span className={`request-status ${request.status}`}>{request.status}</span><h3>人工接管请求</h3></div><span className="request-time">{request.reasonCode}</span></div><div className="request-facts"><div><span>会话</span><strong>{request.conversationId}</strong></div><div><span>最近消息</span><strong>{request.recentMessages.length} 条</strong></div></div><div className="request-message-preview"><p>最近活动</p><ul className="request-messages">{request.recentMessages.map((message) => <li key={message.id}><span>{message.senderType === 'human_operator' ? '人工' : message.senderType === 'customer' ? '客户' : 'Agent'}</span><p>{message.content}</p></li>)}</ul></div>{request.status === 'closed' && <p className="closed-summary">关闭结果：{request.closeReason ?? 'legacy_unclassified'} / {request.resolutionCode ?? 'legacy_unclassified'}</p>}{request.status === 'requested' && <button type="button" onClick={() => void updateRequest(request, 'claim')}>接管</button>}{request.status === 'claimed' && <div className="staff-detail-grid"><section aria-label="Internal context" className="staff-detail-section"><div className="section-heading"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h2>Internal context</h2></div><span className="section-lock">内部</span></div><p className="context-tags">Tags: {(contexts[request.requestId]?.tags ?? []).map((item) => item.tag).join(', ') || 'none'}</p><ul className="internal-notes">{(contexts[request.requestId]?.notes ?? []).map((note) => <li key={note.id}>{note.content}</li>)}</ul><form className="composer compact-composer" onSubmit={(event) => void submitNote(event, request)}><label htmlFor={`note-${request.requestId}`}>Internal note</label><textarea id={`note-${request.requestId}`} value={noteDrafts[request.requestId] ?? ''} onChange={(event) => setNoteDrafts((current) => ({ ...current, [request.requestId]: event.target.value }))} maxLength={2000} rows={2} /><button type="submit" disabled={!noteDrafts[request.requestId]?.trim()}>Add note</button></form><div className="tag-controls"><label htmlFor={`tag-${request.requestId}`}>Fixed tag</label><select id={`tag-${request.requestId}`} value={tagDrafts[request.requestId] ?? 'urgent'} onChange={(event) => setTagDrafts((current) => ({ ...current, [request.requestId]: event.target.value as InternalTag }))}><option value="urgent">urgent</option><option value="billing">billing</option><option value="technical">technical</option><option value="follow_up">follow_up</option></select><button type="button" onClick={() => void updateTag(request, tagDrafts[request.requestId] ?? 'urgent', true)}>Add tag</button><button type="button" onClick={() => void updateTag(request, tagDrafts[request.requestId] ?? 'urgent', false)}>Remove tag</button></div></section><section aria-label="Audit timeline" className="staff-detail-section"><div className="section-heading"><div><p className="eyebrow">TRACEABLE ACTIVITY</p><h2>Audit timeline</h2></div><span className="section-lock">脱敏</span></div><ol className="audit-list">{(timelines[request.requestId]?.items ?? []).filter((event) => !event.feedbackValue).map((event) => <li key={event.eventId}><time>{event.occurredAt}</time><span>{event.action} · {event.result}{event.tag ? ` · ${event.tag}` : ''}</span></li>)}</ol><h3 className="subsection-title">Feedback audit events</h3><ol className="audit-list">{(timelines[request.requestId]?.items ?? []).filter((event) => event.feedbackValue).map((event) => <li key={event.eventId}><time>{event.occurredAt}</time><span>{event.action} · {timelineResultLabel(event)} · 客户反馈：{feedbackLabel(event.feedbackValue)} · 消息标识：{shortSubjectRef(event.subjectRef) ?? 'unknown'}</span></li>)}</ol></section><form className="composer reply-composer" onSubmit={(event) => void submitReply(event, request)}><label htmlFor={`reply-${request.requestId}`}>人工回复</label><textarea id={`reply-${request.requestId}`} value={replyDrafts[request.requestId] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [request.requestId]: event.target.value }))} maxLength={2000} rows={3} placeholder="回复客户（合成演练）" /><button type="submit" disabled={!replyDrafts[request.requestId]?.trim() || sendingReply !== null}>{sendingReply === request.requestId ? '发送中…' : '发送人工回复'}</button></form><form className="composer close-composer" onSubmit={(event) => void submitClose(event, request)} aria-label="Close handoff"><label htmlFor={`close-reason-${request.requestId}`}>关闭原因（合成规则）</label><select id={`close-reason-${request.requestId}`} value={closeReasonDrafts[request.requestId] ?? ''} onChange={(event) => setCloseReasonDrafts((current) => ({ ...current, [request.requestId]: event.target.value as CloseReason | '' }))}><option value="">请选择关闭原因</option>{CLOSE_REASONS.map((value) => <option key={value} value={value}>{CLOSE_REASON_LABELS[value]}</option>)}</select><label htmlFor={`resolution-${request.requestId}`}>处理结果（合成规则）</label><select id={`resolution-${request.requestId}`} value={resolutionDrafts[request.requestId] ?? ''} onChange={(event) => setResolutionDrafts((current) => ({ ...current, [request.requestId]: event.target.value as ResolutionCode | '' }))}><option value="">请选择处理结果</option>{RESOLUTION_CODES.map((value) => <option key={value} value={value}>{RESOLUTION_LABELS[value]}</option>)}</select><button type="submit" disabled={!closeReasonDrafts[request.requestId] || !resolutionDrafts[request.requestId]}>关闭接管</button></form></div>}</article>)}
            </div>
          </section>
          <aside className="insight-rail" aria-label="工作台说明"><section className="insight-card"><div className="insight-card-header"><h2>队列快照</h2><span className="shield-mark">S</span></div><dl className="detail-list"><div><dt>当前筛选</dt><dd>{queueStatus}</dd></div><div><dt>已加载请求</dt><dd>{items.length} 条</dd></div><div><dt>身份状态</dt><dd>{status === 'ready' ? '已验证' : status === 'error' ? '被拒绝' : '未加载'}</dd></div></dl></section><section className="insight-card"><div className="insight-card-header"><h2>权限边界</h2><span className="shield-mark">✓</span></div><ul className="boundary-list"><li><span>✓</span>仅读取服务端脱敏投影</li><li><span>✓</span>内部上下文仅 Staff 可见</li><li><span>✓</span>生产身份默认拒绝</li></ul></section><section className="insight-card rail-note"><p className="eyebrow">操作提醒</p><strong>每个动作都会留痕</strong><p>回复、标签、内部备注和关闭接管均沿用现有权限与审计接口。</p></section></aside>
        </div>
      </main>
    </div>
  );
}
