import { expect, test } from '@playwright/test';

test('completes the safe mock chat flow', async ({ page }) => {
  await page.goto('/chat');
  const composer = page.locator('#message');
  const send = page.locator('form.composer button[type="submit"]');

  await expect(composer).toBeVisible();
  await expect(send).toBeDisabled();
  await composer.fill('introduce this demo environment');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText('introduce this demo environment')).toBeVisible();
  await expect(page.locator('small').filter({ hasText: 'safe_unavailable' })).toBeVisible();
});

test('customer handoff status disables automatic replies', async ({ page, request }) => {
  const apiBase = 'http://127.0.0.1:3001/api/v1';
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
  const apiBase = 'http://127.0.0.1:3001/api/v1';
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
  await claimedCard.getByLabel('Internal note').fill('e2e internal note');
  await claimedCard.getByRole('button', { name: 'Add note' }).click();
  await expect(claimedCard).toContainText('e2e internal note');
  await claimedCard.getByRole('button', { name: 'Add tag' }).click();
  await expect(claimedCard).toContainText('urgent');
  await expect(claimedCard.getByRole('heading', { name: 'Audit timeline' })).toBeVisible();
  await expect(claimedCard.getByRole('list').last()).toContainText('handoff_claimed');
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
