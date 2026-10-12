import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assetDirectory = fileURLToPath(new URL('./preview-assets/', import.meta.url));
await mkdir(assetDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PREVIEW_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const checks = [];
const unexpectedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8861/')) unexpectedRequests.push(request.url()); });
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8861/workbench-preview.html';
const action = name => page.locator(`[data-action="${name}"]:visible`);
async function check(name, callback) { await callback(); checks.push(name); }
async function capture(name) {
  await page.bringToFront();
  await page.locator('#notification').evaluate(element => { element.hidden = true; });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.screenshot({ path: `${assetDirectory}/${name}.png`, animations: 'disabled' });
}

try {
  await page.goto(url);
  await check('Reference layout has permanent navigation, catalog and request above response', async () => {
    await expect(page.getByRole('heading', { name: 'search_products', exact: true })).toBeVisible();
    await expect(page.locator('.mainnav button')).toHaveCount(4);
    await expect(page.getByLabel('请求参数', { exact: true })).toBeVisible();
    await expect(page.getByLabel('调用结果', { exact: true })).toBeVisible();
    const sidebar = await page.locator('.app-sidebar').boundingBox();
    const catalog = await page.locator('.catalog').boundingBox();
    const request = await page.locator('.request-pane').boundingBox();
    const result = await page.locator('.result-pane').boundingBox();
    expect(sidebar.x).toBe(0);
    expect(catalog.x).toBeGreaterThanOrEqual(sidebar.width);
    expect(result.y).toBeGreaterThan(request.y + request.height);
    expect(request.width).toBe(result.width);
    await expect(page.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal');
  });
  await capture('tools');
  await check('Tool definition is an in-workspace page; back preserves the private draft', async () => {
    await page.locator('#param-query').fill('定义查看保留草稿');
    await action('tool-definition').click();
    await expect(page.getByRole('region', { name: '工具定义页面' })).toBeVisible();
    await expect(page).toHaveURL(/view=definition/);
    expect(await page.locator('#overlay').evaluate(element => element.open)).toBe(false);
    await capture('tool-definition');
    await page.keyboard.press('Meta+Enter');
    await expect(action('cancel-run')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#param-query')).toHaveValue('定义查看保留草稿');
    await page.goForward();
    await expect(page.getByRole('region', { name: '工具定义页面' })).toBeVisible();
    await action('return-debug').last().click();
    await expect(page.locator('#param-query')).toHaveValue('定义查看保留草稿');
  });
  await check('Form / JSON synchronization and invalid JSON protection', async () => {
    await page.locator('#param-query').fill('机械键盘');
    await action('input-json').click();
    await expect(page.locator('#raw-arguments')).toContainText('机械键盘');
    await page.locator('#raw-arguments').fill('{invalid JSON');
    await action('execute').click();
    await expect(page.getByRole('alert')).toContainText('合法的 JSON object');
    await expect(action('cancel-run')).toHaveCount(0);
    await page.locator('#raw-arguments').fill('{"query":"机械键盘","limit":10,"locale":"zh-CN","include_archived":false}');
    await action('input-form').click();
    await expect(page.locator('#param-query')).toHaveValue('机械键盘');
  });
  await check('Simulation completes and records history', async () => {
    await action('execute').click();
    await expect(action('cancel-run')).toBeVisible();
    await expect(action('execute')).toBeVisible();
    await expect(page.locator('.pane-footer').last()).toContainText('commerce-run-');
  });
  await check('Cancellation is terminal', async () => {
    await action('execute').click();
    await action('cancel-run').click();
    await expect(page.locator('.result-status')).toContainText('已取消');
  });
  await check('Keyboard-adjustable vertical split and fixed result views', async () => {
    const separator = page.getByRole('separator');
    await separator.focus();
    await separator.press('ArrowDown');
    await expect(separator).toHaveAttribute('aria-valuenow', '54');
    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', '52');
    await expect(page.locator('.result-pane>.result-tabbar')).toBeVisible();
  });
  await check('Array parameter editing preserves invalid drafts and round-trips through JSON', async () => {
    await page.locator('[data-action="open-tool"][data-tool="get_store_product_mapping"]').click();
    await expect(page.locator('#param-product_ids')).toHaveValue(/prd_1042/);
    await action('expand-request').click();
    await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '65');
    await capture('complex-parameters');
    await page.locator('#param-product_ids').fill('[invalid');
    await action('execute').click();
    await expect(page.locator('#arguments-error')).toContainText('数组参数错误');
    await expect(page.locator('#param-product_ids')).toHaveValue('[invalid');
    await expect(action('cancel-run')).toHaveCount(0);
    await action('input-form').click();
    await expect(page.locator('#param-product_ids')).toHaveValue('[invalid');
    await action('input-json').click();
    await expect(page.locator('#param-product_ids')).toHaveValue('[invalid');
    await page.locator('#param-product_ids').fill('["prd_2001", "prd_2002"]');
    await action('input-json').click();
    await expect(page.locator('#raw-arguments')).toHaveValue(/prd_2002/);
    await action('input-form').click();
    await expect(page.locator('#param-product_ids')).toHaveValue(/prd_2001/);
    await action('execute').click();
    await expect(page.locator('.result-status')).toContainText('成功');
    await action('tool-history').click();
    await page.locator('[data-action="select-tool-run"]').first().click();
    await expect(page.locator('.snapshot-content').first()).toContainText('prd_2002');
    await page.locator('[data-page="tools"]').click();
    await page.locator('[data-action="open-tool"][data-tool="search_products"]').click();
    await action('reset-layout').click();
  });
  await page.locator('[data-page="servers"]').click();
  await expect(page.getByRole('heading', { name: '服务配置', exact: true })).toBeVisible();
  await capture('servers');
  await check('Connected environment cannot silently switch', async () => {
    await expect(action('save-server')).toBeInViewport();
    await expect(page.locator('#server-profile')).toBeDisabled();
    await action('toggle-config-connection').click();
    await expect(page.locator('#server-profile')).toBeEnabled();
    await action('toggle-config-connection').click();
  });
  await page.locator('[data-page="environment"]').click();
  await expect(page.getByRole('heading', { name: '环境变量', exact: true })).toBeVisible();
  await capture('environment');
  await check('Variables support local editing and Secret replacement', async () => {
    await page.locator('[data-action="edit-variable"][data-variable="var-token"]').click();
    await expect(page.locator('#variable-value')).toHaveValue('');
    await expect(page.locator('#variable-value')).toHaveAttribute('type', 'password');
    await page.keyboard.press('Escape');
    await action('new-variable').click();
    await page.locator('#variable-name').fill('PREVIEW_REGION');
    await page.locator('#variable-value').fill('cn-north-1');
    await page.locator('[data-submit="save-variable"]').click();
    await expect(page.locator('table')).toContainText('PREVIEW_REGION');
  });
  await page.locator('[data-page="history"]').click();
  await expect(page.getByRole('heading', { name: '调用历史', exact: true })).toBeVisible();
  await page.locator('#history-search').fill('');
  await capture('history');
  await check('History restores into a new unexecuted personal draft', async () => {
    await page.locator('[data-action="select-run"][data-run="commerce-run-01"]').click();
    await expect(page.locator('.run-page')).toBeVisible();
    await expect(page).toHaveURL(/page=history-detail/);
    expect(await page.locator('#overlay').evaluate(element => element.open)).toBe(false);
    await capture('history-detail');
    await action('restore-run').click();
    await expect(page.locator('.empty-result')).toContainText('等待执行');
    await expect(page.locator('.pane-scroll').first()).toContainText('尚未执行');
    await expect(page.locator('#param-query')).toHaveValue('无线键盘');
  });
  await check('History pages support browser back, return to filters and direct links', async () => {
    await page.locator('[data-page="history"]').click();
    await page.locator('#history-search').fill('search_products');
    await page.locator('[data-action="select-run"][data-run="commerce-run-01"]').click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: '调用历史', exact: true })).toBeVisible();
    await expect(page.locator('#history-search')).toHaveValue('search_products');
    await page.goForward();
    await expect(page.locator('.run-page')).toContainText('commerce-run-01');
    await action('back-history').click();
    await expect(page.locator('#history-search')).toHaveValue('search_products');
    const linked = await context.newPage();
    await linked.goto(`${url}?page=history-detail&project=commerce&run=commerce-run-01`);
    await expect(linked.locator('.run-page')).toContainText('无线键盘');
    await linked.reload();
    await expect(linked.locator('.run-page')).toContainText('commerce-run-01');
    await linked.goto(`${url}?page=history-detail&project=knowledge&run=commerce-run-01`);
    await expect(linked.getByRole('heading', { name: '调用不存在' })).toBeVisible();
    await linked.goto(`${url}?page=tools&project=__proto__`);
    await expect(linked.getByRole('heading', { name: 'search_products', exact: true })).toBeVisible();
    await linked.close();
    await page.locator('[data-page="tools"]').click();
  });
  await check('Editing during execution preserves captured parameters and marks the old result', async () => {
    await page.locator('#param-query').fill('本次执行快照');
    await action('execute').click();
    await page.locator('#param-query').fill('下一次调用草稿');
    await expect(page.locator('.result-status')).toContainText('成功');
    await expect(page.locator('.draft-notice')).toContainText('参数已修改');
    await expect(page.locator('.pane-scroll').first()).not.toContainText('尚未执行');
    await action('tool-history').click();
    await page.locator('[data-action="select-tool-run"]').first().click();
    await expect(page.locator('.snapshot-content').first()).toContainText('本次执行快照');
    await action('return-debug').first().click();
    await expect(page.locator('#param-query')).toHaveValue('下一次调用草稿');
  });
  await check('Projects isolate personal drafts and histories', async () => {
    await page.locator('#param-query').fill('项目隔离示例');
    await action('projects').click();
    await page.locator('[data-action="switch-project"][data-project="knowledge"]').click();
    await expect(page.getByRole('heading', { name: 'search_documents', exact: true })).toBeVisible();
    await expect(page.locator('#param-query')).toHaveValue('接入指南');
    await action('projects').click();
    await page.locator('[data-action="switch-project"][data-project="commerce"]').click();
    await expect(page.locator('#param-query')).toHaveValue('项目隔离示例');
  });
  await action('members').click();
  await expect(page.getByRole('heading', { name: '研发团队', exact: true })).toBeVisible();
  await capture('members');
  await check('Invitation creation and revocation remain presentation-only', async () => {
    await action('invite-member').click();
    await capture('invite');
    await expect(page.locator('#invite-email')).toBeFocused();
    await page.locator('#invite-email').fill('preview-member@example.com');
    await page.locator('[data-submit="create-invite"]').click();
    await expect(page.locator('table')).toContainText('preview-member@example.com');
    await action('revoke-invite').last().click();
    await page.locator('[data-submit="confirm-revoke"]').click();
    await expect(page.locator('table')).toContainText('已撤销');
  });
  await check('Viewer preview disables execution and configuration', async () => {
    await action('account').click();
    await page.locator('#preview-role').selectOption('Viewer');
    await page.locator('[data-page="tools"]').click();
    await expect(action('execute')).toBeDisabled();
    await page.locator('[data-page="servers"]').click();
    await expect(action('save-server')).toBeDisabled();
    await action('account').click();
    await page.locator('#preview-role').selectOption('Maintainer');
  });
  await action('projects').click();
  await capture('projects');
  await check('New project starts empty and can configure its first Server', async () => {
    await action('new-project').click();
    await page.locator('#new-project-name').fill('支付联调');
    await page.locator('#new-project-description').fill('空项目首次配置流程');
    await page.locator('[data-submit="create-project"]').click();
    await page.locator('.project-row').filter({ hasText: '支付联调' }).locator('[data-action="switch-project"]').click();
    await expect(page.getByRole('heading', { name: '尚未配置 Server' })).toBeVisible();
    await action('configure-first-server').click();
    await action('new-server').click();
    await page.locator('#new-server-name').fill('Payment API');
    await page.locator('#new-server-url').fill('https://mcp.payment.example/mcp');
    await page.locator('[data-submit="create-server"]').click();
    await expect(page.locator('#server-name')).toHaveValue('Payment API');
    await expect(page.locator('#active-server')).toContainText('Payment API');
  });
  await action('account').click();
  await action('show-login').click();
  await capture('login');
  await check('Login and invitation acceptance pages are clearly previews', async () => {
    await expect(page.locator('.login-preview')).toContainText('不连接身份提供商');
    await action('invite-accept-preview').click();
    await expect(page.getByRole('dialog')).toContainText('不创建真实成员');
    await capture('accept-invite');
    await page.keyboard.press('Escape');
    await action('login-demo').click();
    await page.locator('[data-action="switch-project"][data-project="commerce"]').click();
  });
  for (const width of [1440, 1024, 820, 390]) {
    await check(`No document overflow or inaccessible primary action at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await expect(action('execute')).toBeVisible();
      const layout = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, width: window.innerWidth, shellHeight: document.querySelector('.shell').getBoundingClientRect().height }));
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.shellHeight).toBe(900);
      if (width === 1024 || width === 390) await capture(`tools-${width}`);
      for (const module of ['servers', 'environment', 'history']) {
        await page.locator(`[data-page="${module}"]`).click();
        expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await page.locator('[data-action="select-run"]').first().click();
      await expect(page.locator('.run-page')).toBeVisible();
      expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(action('restore-run')).toBeVisible();
      await page.locator('[data-page="tools"]').click();
    });
  }
  await check('No runtime errors, remote requests or browser storage', async () => {
    expect(errors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  });
  const report = { date: '2026-10-10', scope: 'Reorganized workbench: sidebar project switch, single connection bar, independent document/view navigation, vertical debug, page-based history; prototype only', checks, errors, unexpectedRequests, screenshots: ['tools', 'tool-definition', 'complex-parameters', 'servers', 'environment', 'history', 'history-detail', 'members', 'invite', 'projects', 'login', 'accept-invite', 'tools-1024', 'tools-390'] };
  await writeFile(`${assetDirectory}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors, screenshots: report.screenshots.length }));
} finally {
  await browser.close();
}
