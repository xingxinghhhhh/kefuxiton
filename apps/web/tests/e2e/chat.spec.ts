import { expect, test } from '@playwright/test';

test('completes the safe mock chat flow', async ({ page }) => {
  await page.goto('/chat');
  const composer = page.getByLabel('发送问题');
  const send = page.getByRole('button', { name: '发送' });

  await expect(composer).toBeVisible();
  await expect(send).toBeDisabled();
  await composer.fill('请介绍一下这个演示环境');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText('请介绍一下这个演示环境')).toBeVisible();
  await expect(page.getByText('当前演示环境尚未接入已发布知识库，暂时无法可靠回答该问题。')).toBeVisible();
  await expect(page.getByText('响应类型：safe_unavailable')).toBeVisible();
});

test('requests idempotent handoff and stops automatic replies', async ({ page }) => {
  await page.goto('/chat');
  const composer = page.getByLabel('发送问题');
  await composer.fill('请直接修改我的生产权限');
  await page.getByRole('button', { name: '发送' }).click();

  const requestButton = page.getByRole('button', { name: '请求人工接入' });
  await expect(requestButton).toBeVisible();
  await requestButton.click();
  await expect(page.getByText('已提交转人工请求，正在等待人工接入。人工接入前不会继续自动回复。')).toBeVisible();
  await expect(composer).toBeDisabled();
});
