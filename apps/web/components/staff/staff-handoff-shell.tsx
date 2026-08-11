'use client';

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
    <main className="page-shell">
      <section className="chat-card" aria-labelledby="staff-handoff-title">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Test-only Operator Queue</p>
            <h1 id="staff-handoff-title">人工接管队列</h1>
          </div>
          <span className="mode-badge">Staff access</span>
        </header>
        <p className="notice">当前页面只用于测试身份适配器验证。未配置正式 Staff 身份时，服务端默认拒绝访问。</p>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void loadQueue(); }}>
          <label htmlFor="staff-token">Staff 测试 Token</label>
          <input
            id="staff-token"
            type="password"
            value={staffToken}
            onChange={(event) => setStaffToken(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={!staffToken.trim() || status === 'loading'}>
            {status === 'loading' ? '加载中…' : '加载队列'}
          </button>
        </form>
        <label htmlFor="handoff-status-filter">队列状态</label>
        <select
          id="handoff-status-filter"
          aria-label="handoff status filter"
          value={queueStatus}
          onChange={(event) => {
            const nextStatus = event.target.value as HandoffRequestStatus;
            setQueueStatus(nextStatus);
            void loadQueue(nextStatus);
          }}
        >
          <option value="requested">requested</option>
          <option value="claimed">claimed</option>
          <option value="closed">closed</option>
        </select>
        {error && <p className="error-message" role="alert">{error}</p>}
        {status === 'ready' && items.length === 0 && <p role="status">当前没有符合条件的接管请求。</p>}
        <div className="message-list" aria-live="polite">
          {items.map((request) => (
            <article key={request.requestId} className="message message-agent">
              <span className="message-role">{request.status}</span>
              <p>会话：{request.conversationId}</p>
              <p>原因：{request.reasonCode}</p>
              {request.status === 'closed' && (
                <p>关闭结果：{request.closeReason ?? 'legacy_unclassified'} / {request.resolutionCode ?? 'legacy_unclassified'}</p>
              )}
              <ul>
                {request.recentMessages.map((message) => (
                  <li key={message.id}>{message.senderType}: {message.content}</li>
                ))}
              </ul>
              {request.status === 'requested' && (
                <button type="button" onClick={() => void updateRequest(request, 'claim')}>接管</button>
              )}
              {request.status === 'claimed' && (
                <>
                  <section aria-label="Internal context">
                    <h2>Internal context</h2>
                    <p>Tags: {(contexts[request.requestId]?.tags ?? []).map((item) => item.tag).join(', ') || 'none'}</p>
                    <ul>{(contexts[request.requestId]?.notes ?? []).map((note) => <li key={note.id}>{note.content}</li>)}</ul>
                    <form className="composer" onSubmit={(event) => void submitNote(event, request)}>
                      <label htmlFor={`note-${request.requestId}`}>Internal note</label>
                      <textarea id={`note-${request.requestId}`} value={noteDrafts[request.requestId] ?? ''} onChange={(event) => setNoteDrafts((current) => ({ ...current, [request.requestId]: event.target.value }))} maxLength={2000} rows={2} />
                      <button type="submit" disabled={!noteDrafts[request.requestId]?.trim()}>Add note</button>
                    </form>
                    <label htmlFor={`tag-${request.requestId}`}>Fixed tag</label>
                    <select id={`tag-${request.requestId}`} value={tagDrafts[request.requestId] ?? 'urgent'} onChange={(event) => setTagDrafts((current) => ({ ...current, [request.requestId]: event.target.value as InternalTag }))}>
                      <option value="urgent">urgent</option><option value="billing">billing</option><option value="technical">technical</option><option value="follow_up">follow_up</option>
                    </select>
                    <button type="button" onClick={() => void updateTag(request, tagDrafts[request.requestId] ?? 'urgent', true)}>Add tag</button>
                    <button type="button" onClick={() => void updateTag(request, tagDrafts[request.requestId] ?? 'urgent', false)}>Remove tag</button>
                  </section>
                  <section aria-label="Audit timeline">
                    <h2>Audit timeline</h2>
                    <ol>
                      {(timelines[request.requestId]?.items ?? []).map((event) => (
                        <li key={event.eventId}>{event.occurredAt} · {event.action} · {event.result}{event.tag ? ` · ${event.tag}` : ''}</li>
                      ))}
                    </ol>
                  </section>
                  <form className="composer" onSubmit={(event) => void submitReply(event, request)}>
                    <label htmlFor={`reply-${request.requestId}`}>人工回复</label>
                    <textarea
                      id={`reply-${request.requestId}`}
                      value={replyDrafts[request.requestId] ?? ''}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [request.requestId]: event.target.value }))}
                      maxLength={2000}
                      rows={3}
                    />
                    <button type="submit" disabled={!replyDrafts[request.requestId]?.trim() || sendingReply !== null}>
                      {sendingReply === request.requestId ? '发送中…' : '发送人工回复'}
                    </button>
                  </form>
                  <form className="composer" onSubmit={(event) => void submitClose(event, request)} aria-label="Close handoff">
                    <label htmlFor={`close-reason-${request.requestId}`}>关闭原因（合成规则）</label>
                    <select
                      id={`close-reason-${request.requestId}`}
                      value={closeReasonDrafts[request.requestId] ?? ''}
                      onChange={(event) => setCloseReasonDrafts((current) => ({ ...current, [request.requestId]: event.target.value as CloseReason | '' }))}
                    >
                      <option value="">请选择关闭原因</option>
                      {CLOSE_REASONS.map((value) => <option key={value} value={value}>{CLOSE_REASON_LABELS[value]}</option>)}
                    </select>
                    <label htmlFor={`resolution-${request.requestId}`}>处理结果（合成规则）</label>
                    <select
                      id={`resolution-${request.requestId}`}
                      value={resolutionDrafts[request.requestId] ?? ''}
                      onChange={(event) => setResolutionDrafts((current) => ({ ...current, [request.requestId]: event.target.value as ResolutionCode | '' }))}
                    >
                      <option value="">请选择处理结果</option>
                      {RESOLUTION_CODES.map((value) => <option key={value} value={value}>{RESOLUTION_LABELS[value]}</option>)}
                    </select>
                    <button type="submit" disabled={!closeReasonDrafts[request.requestId] || !resolutionDrafts[request.requestId]}>关闭接管</button>
                  </form>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
