'use client';

import { useState } from 'react';
import type { HandoffRequestStatus, StaffHandoffRequest } from '@ai-agent/contracts';
import { claimStaffHandoff, closeStaffHandoff, listStaffHandoffs } from '../../lib/api-client';

export function StaffHandoffShell() {
  const [staffToken, setStaffToken] = useState('');
  const [items, setItems] = useState<StaffHandoffRequest[]>([]);
  const [queueStatus, setQueueStatus] = useState<HandoffRequestStatus>('requested');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');

  async function loadQueue(status = queueStatus) {
    if (!staffToken.trim()) return;
    setStatus('loading');
    setError('');
    try {
      const result = await listStaffHandoffs(staffToken.trim(), status);
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
        <label htmlFor="handoff-status-filter">闃熷垪鐘舵€?</label>
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
        {status === 'ready' && items.length === 0 && <p role="status">当前没有待处理接管请求。</p>}
        <div className="message-list" aria-live="polite">
          {items.map((request) => (
            <article key={request.requestId} className="message message-agent">
              <span className="message-role">{request.status}</span>
              <p>会话：{request.conversationId}</p>
              <p>原因：{request.reasonCode}</p>
              <ul>
                {request.recentMessages.map((message) => (
                  <li key={message.id}>{message.role}: {message.content}</li>
                ))}
              </ul>
              {request.status === 'requested' && (
                <button type="button" onClick={() => void updateRequest(request, 'claim')}>接管</button>
              )}
              {request.status === 'claimed' && (
                <button type="button" onClick={() => void updateRequest(request, 'close')}>关闭</button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
