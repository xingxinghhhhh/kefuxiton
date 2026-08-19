import { expect, test } from '@playwright/test';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test('completes the safe mock chat flow', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: '安全会话闭环' })).toBeVisible();
  await expect(page.getByText('安全边界')).toBeVisible();
  await expect(page.getByRole('link', { name: /客服工作台/ }).first()).toBeVisible();
  const composer = page.locator('#message');
  const send = page.locator('form.composer button[type="submit"]');

  await expect(composer).toBeVisible();
  await expect(send).toBeDisabled();
  await composer.fill('introduce this demo environment');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText('introduce this demo environment')).toBeVisible();
  await expect(page.locator('small').filter({ hasText: 'safe_unavailable' })).toBeVisible();
  const helpful = page.getByRole('button', { name: '有帮助' }).last();
  await helpful.click();
  await expect(helpful).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '反馈已记录' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '有帮助' }).last()).toHaveAttribute('aria-pressed', 'true');
});

test('customer and staff surfaces remain role-scoped', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.locator('#message')).toBeVisible();
  await expect(page.locator('#staff-token')).toHaveCount(0);
  await page.goto('/staff/handoffs');
  await expect(page.getByRole('heading', { name: '人工接管工作台' })).toBeVisible();
  await expect(page.getByText('权限边界')).toBeVisible();
  await expect(page.locator('#staff-token')).toBeVisible();
  await expect(page.locator('#message')).toHaveCount(0);
});

test('customer handoff status disables automatic replies', async ({ page, request }) => {
  const createdResponse = await request.post(`${apiBase}/conversations`);
  expect(createdResponse.ok()).toBeTruthy();
  const conversation = await createdResponse.json() as { conversationId: string; accessToken: string };
  const handoffResponse = await request.post(`${apiBase}/conversations/${conversation.conversationId}/handoff-requests`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    data: { reasonCode: 'customer_requested' },
  });
  expect(handoffResponse.ok()).toBeTruthy();

  await page.addInitScript((storedConversation) => {
    window.sessionStorage.setItem('ai-agent-conversation', JSON.stringify(storedConversation));
  }, conversation);
  await page.goto('/chat');
  await expect(page.locator('#message')).toBeDisabled();
  await expect(page.locator('p[role="status"]').last()).toBeVisible();
});

test('staff queue enforces access, claims, and closes a handoff', async ({ page, request }) => {
  const createdResponse = await request.post(`${apiBase}/conversations`);
  expect(createdResponse.ok()).toBeTruthy();
  const conversation = await createdResponse.json() as { conversationId: string; accessToken: string };

  const messageResponse = await request.post(`${apiBase}/conversations/${conversation.conversationId}/messages`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    data: { content: 'e2e handoff context' },
  });
  expect(messageResponse.ok()).toBeTruthy();
  const handoffResponse = await request.post(`${apiBase}/conversations/${conversation.conversationId}/handoff-requests`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    data: { reasonCode: 'customer_requested' },
  });
  expect(handoffResponse.ok()).toBeTruthy();

  await page.goto('/staff/handoffs');
  await page.locator('#staff-token').fill('wrong-token');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();

  await page.locator('#staff-token').fill('test-staff-token');
  await page.locator('form button[type="submit"]').click();
  const requestCard = page.locator('.message-list article').filter({ hasText: conversation.conversationId });
  await expect(requestCard).toContainText('requested');
  await requestCard.locator('button').click();

  await page.locator('#handoff-status-filter').selectOption('claimed');
  const claimedCard = page.locator('.message-list article').filter({ hasText: conversation.conversationId });
  await expect(claimedCard).toContainText('claimed');
  await claimedCard.locator('textarea').nth(1).fill('staff e2e reply');
  await claimedCard.locator('form').nth(1).locator('button[type="submit"]').click();
  await expect(claimedCard).toContainText('staff e2e reply');
  const customerHistoryResponse = await request.get(`${apiBase}/conversations/${conversation.conversationId}/messages`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
  });
  const customerHistory = await customerHistoryResponse.json() as { messages: Array<{ id: string; senderType: string }> };
  const humanMessage = customerHistory.messages.find((message) => message.senderType === 'human_operator');
  expect(humanMessage).toBeTruthy();
  const feedbackResponse = await request.post(`${apiBase}/conversations/${conversation.conversationId}/messages/${humanMessage?.id}/feedback`, {
    headers: { authorization: `Bearer ${conversation.accessToken}` },
    data: { value: 'helpful', idempotencyKey: 'e2e-human-feedback-1' },
  });
  expect(feedbackResponse.ok()).toBeTruthy();
  await page.locator('#handoff-status-filter').selectOption('requested');
  await page.locator('#handoff-status-filter').selectOption('claimed');
  const refreshedClaimedCard = page.locator('.message-list article').filter({ hasText: conversation.conversationId });
  await expect(refreshedClaimedCard.getByRole('heading', { name: 'Feedback audit events' })).toBeVisible();
  await expect(refreshedClaimedCard).toContainText('客户反馈：有帮助');
  await claimedCard.getByLabel('Internal note').fill('e2e internal note');
  await claimedCard.getByRole('button', { name: 'Add note' }).click();
  await expect(claimedCard).toContainText('e2e internal note');
  await claimedCard.getByRole('button', { name: 'Add tag' }).click();
  await expect(claimedCard).toContainText('urgent');
  await expect(claimedCard.getByRole('heading', { name: 'Audit timeline' })).toBeVisible();
  await expect(claimedCard.locator('section[aria-label="Audit timeline"]').getByRole('list').first()).toContainText('handoff_claimed');
  await claimedCard.locator('select[id^="close-reason-"]').selectOption('operator_completed');
  await claimedCard.locator('select[id^="resolution-"]').selectOption('resolved');
  await claimedCard.getByRole('button', { name: '关闭接管' }).click();

  await page.locator('#handoff-status-filter').selectOption('closed');
  await expect(page.locator('.message-list article').filter({ hasText: conversation.conversationId })).toContainText('closed');

  await page.addInitScript((storedConversation) => {
    window.sessionStorage.setItem('ai-agent-conversation', JSON.stringify(storedConversation));
  }, conversation);
  await page.goto('/chat');
  await expect(page.getByText('staff e2e reply')).toBeVisible();
  await expect(page.locator('#message')).toBeDisabled();
});
