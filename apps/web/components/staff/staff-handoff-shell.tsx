'use client';

import { FormEvent, useState } from 'react';
import type { HandoffRequestStatus, StaffHandoffRequest } from '@ai-agent/contracts';
import { claimStaffHandoff, closeStaffHandoff, listStaffHandoffs, sendStaffReply } from '../../lib/api-client';

type DraftMap = Record<string, string>;
type KeyMap = Record<string, string>;

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
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');

  async function loadQueue(statusToLoad = queueStatus) {
    if (!staffToken.trim()) return;
    setStatus('loading');
    setError('');
    try {
      const result = await listStaffHandoffs(staffToken.trim(), statusToLoad);
      setItems(result.items);
      setStatus('ready');
    } catch {
      setError('无法访问客服队列，请确认 Staff 身份或服务配置。');
      setStatus('error');
    }
  }

  async function updateRequest(request: StaffHandoffRequest, action: 'claim' | 'close') {
    setError('');
    try {
      if (action === 'claim') await claimStaffHandoff(staffToken.trim(), request.requestId);
      else await closeStaffHandoff(staffToken.trim(), request.requestId);
      const nextStatus: HandoffRequestStatus = action === 'claim' ? 'claimed' : 'closed';
      setQueueStatus(nextStatus);
      await loadQueue(nextStatus);
    } catch {
      setError('状态更新失败，请刷新后重试。');
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
                  <button type="button" onClick={() => void updateRequest(request, 'close')}>关闭</button>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
