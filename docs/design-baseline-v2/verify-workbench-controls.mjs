import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const assets=fileURLToPath(new URL('./preview-assets/',import.meta.url));
await mkdir(assets,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PREVIEW_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[],requests=[],checks=[];
context.on('page',opened=>{
  opened.on('pageerror',error=>errors.push(error.message));
  opened.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8861/')) requests.push(request.url());});
});
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8861/')) requests.push(request.url());});
const url='http://127.0.0.1:8861/workbench-preview.html';
const action=name=>page.locator(`[data-action="${name}"]:visible`);
const tabs=()=>page.locator('.document-tab');
const currentId=()=>tabs().filter({has:page.locator('[aria-current="true"]')}).getAttribute('data-document');
async function menu(id){await page.locator(`[data-action="tab-menu"][data-tab="${id}"]`).click();await expect(page.getByRole('menu')).toBeVisible();}
async function command(id,name){await menu(id);await action(`tab-command-${name}`).click();}
async function check(name,callback){await callback();checks.push(name);console.log(`PASS ${name}`);}
async function fresh(){await page.goto(`${url}?page=tools&project=commerce&tab=tab-11`);}
async function capture(name){await page.locator('#notification').evaluate(node=>node.hidden=true);await page.screenshot({path:`${assets}/${name}.png`,animations:'disabled'});}
try {
  await fresh();
  await check('Account is top-right; language and theme belong to bottom sidebar',async()=>{
    await expect(page.locator('.topbar [data-action="account"]')).toBeVisible();
    await expect(page.locator('.sidebar-bottom [data-action="account"]')).toHaveCount(0);
    await expect(page.locator('.sidebar-bottom #language-switch')).toBeVisible();
    const account=await action('account').boundingBox(),language=await page.locator('#language-switch').boundingBox();
    expect(account.x).toBeGreaterThan(1200);expect(account.y).toBeLessThan(64);expect(language.y).toBeGreaterThan(800);
  });
  await check('Authentication label opens active connection settings and preserves private draft',async()=>{
    await expect(action('open-authentication')).toHaveText('认证：项目凭据');
    await page.locator('#param-query').fill('authentication keeps private draft');
    await action('open-authentication').click();
    await expect(page).toHaveURL(/page=servers/);await expect(page.locator('#authentication-heading')).toBeFocused();
    await expect(page.locator('#server-auth')).toHaveValue('bearer');await expect(page.locator('#server-credential')).toHaveValue('项目凭据');
    await expect(page.locator('#credential-explanation')).toContainText('与右上角的工作台登录账号分开');
    await page.locator('#server-name').fill('unsaved auth view name');await action('open-authentication').click();await expect(page.locator('#server-name')).toHaveValue('unsaved auth view name');
    await page.locator('#server-auth').selectOption('oauth');await expect(page.locator('#server-credential')).toHaveValue('我的授权');await expect(page.locator('#credential-explanation')).toContainText('仅本人');
    await page.locator('#language-switch').selectOption('en-US');await expect(page.locator('#server-auth')).toHaveValue('oauth');await expect(page.locator('#server-credential')).toHaveValue('My authorization');await expect(page.locator('#credential-scope')).toContainText('Personal');await expect(action('authorize-preview')).toBeVisible();
    await page.locator('#language-switch').selectOption('zh-CN');await expect(page.locator('#server-credential')).toHaveValue('我的授权');
    await page.locator('#server-auth').selectOption('none');await expect(page.locator('#server-credential')).toHaveValue('无需凭据');await expect(page.locator('#credential-explanation')).toContainText('不使用认证凭据');
    await page.locator('[data-page="tools"]').click();await expect(page.locator('#param-query')).toHaveValue('authentication keeps private draft');
    await page.locator('#active-server').selectOption('commerce-personal');await expect(action('open-authentication')).toHaveText('认证：我的授权');
    await action('open-authentication').click();await expect(page.locator('#server-name')).toHaveValue('Commerce · 个人授权');await expect(page.locator('#server-auth')).toHaveValue('oauth');
    await page.locator('#language-switch').selectOption('en-US');await expect(action('open-authentication')).toHaveText('Auth: My authorization');await expect(page.locator('#server-credential')).toHaveValue('My authorization');
    await page.locator('#active-server').selectOption('commerce-main');await expect(action('open-authentication')).toHaveText('Auth: Project credentials');
    await page.locator('#language-switch').selectOption('zh-CN');
    await fresh();
  });
  await check('Tool history stays in workspace and filters exact tool and connection',async()=>{
    await page.locator('[data-page="history"]').click();await page.locator('#history-search').fill('林岚');
    await page.locator('[data-page="tools"]').click();await action('tool-history').click();
    await expect(page).toHaveURL(/page=tools.*view=history/);
    await expect(page.locator('[data-page="tools"]')).toHaveAttribute('aria-current','page');
    await expect(page.locator('[data-action="select-tool-run"]')).toHaveCount(3);
    await expect(page.locator('.tool-history-page')).not.toContainText('commerce-run-03');
    await expect(page.locator('.tool-history-page')).not.toContainText('commerce-run-05');
    await expect(page.locator('#history-server')).toHaveCount(0);
    await capture('tool-history');
    await page.locator('#tool-history-search').fill('commerce-run-02');
    await page.locator('[data-action="select-tool-run"]').click();
    await expect(page).toHaveURL(/page=tools.*view=history-detail.*run=commerce-run-02/);
    await expect(page.locator('.tool-history-detail')).toContainText('林岚');
    expect(await page.locator('#overlay').evaluate(node=>node.open)).toBe(false);
    await page.keyboard.press('Meta+Enter');await expect(action('cancel-run')).toHaveCount(0);
    await capture('tool-history-detail');
    await page.goBack();await expect(page.locator('#tool-history-search')).toHaveValue('commerce-run-02');
    await page.goForward();await expect(page.locator('.tool-history-detail')).toBeVisible();
    await action('back-tool-history').click();await expect(page.locator('#tool-history-search')).toHaveValue('commerce-run-02');
    await page.locator('[data-page="history"]').click();await expect(page.locator('#history-search')).toHaveValue('林岚');
  });
  await check('Scoped detail deep links cannot access another tool or project run',async()=>{
    const linked=await context.newPage();
    await linked.goto(`${url}?page=tools&project=commerce&tab=tab-11&view=history-detail&run=commerce-run-01`);
    await expect(linked.locator('.tool-history-detail')).toContainText('commerce-run-01');
    await linked.reload();await expect(linked.locator('.tool-history-detail')).toContainText('commerce-run-01');
    for(const run of ['commerce-run-03','commerce-run-05','knowledge-run-01']){
      await linked.goto(`${url}?page=tools&project=commerce&tab=tab-11&view=history-detail&run=${run}`);
      await expect(linked.getByRole('heading',{name:'调用不存在'})).toBeVisible();
      await expect(linked.locator('[data-action="restore-run"]')).toHaveCount(0);
    }
    await linked.close();
  });
  await fresh();
  await check('Restoring scoped history creates an unexecuted independent draft',async()=>{
    await action('tool-history').click();await page.locator('[data-action="select-tool-run"][data-run="commerce-run-01"]').click();
    await action('restore-run').click();await expect(tabs()).toHaveCount(3);
    await expect(page.locator('.empty-result')).toContainText('等待执行');
    await expect(page).not.toHaveURL(/view=history/);
    await expect(page.locator('#param-query')).toHaveValue('无线键盘');
    await page.locator('#param-query').fill('private restored draft');
    await page.locator('[data-action="select-tab"][data-tab="tab-11"]').click();
    await action('return-debug').first().click();await expect(page.locator('#param-query')).toHaveValue('无线键盘');
  });
  await fresh();
  await check('All seven screenshot menu actions, clipboard and keyboard focus work',async()=>{
    await menu('tab-12');
    await expect(page.getByRole('menu').locator('button')).toHaveCount(7);
    await expect(page.getByRole('menu')).toContainText('复制名称');await expect(page.getByRole('menu')).toContainText('关闭右侧');
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');await expect(action('tab-command-duplicate')).toBeFocused();
    await page.keyboard.press('End');await expect(action('tab-command-others')).toBeFocused();
    await capture('tool-tab-menu');
    await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('#tab-menu-tab-12')).toBeFocused();
    await command('tab-12','copy');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('get_product');
    expect(await currentId()).toBe('tab-11');
    await menu('tab-11');await page.locator('#param-query').click();await expect(page.getByRole('menu')).toHaveCount(0);await expect(page.locator('#param-query')).toBeFocused();
    await menu('tab-11');await page.keyboard.press('Tab');await expect(page.getByRole('menu')).toHaveCount(0);await expect(page.locator('[data-action="close-tab"][data-tab="tab-11"]')).toBeFocused();
  });
  await check('Duplicating a non-active tab preserves its own invalid JSON but starts without result',async()=>{
    await action('input-json').click();await page.locator('#raw-arguments').fill('{ invalid draft');
    await page.locator('[data-action="select-tab"][data-tab="tab-12"]').click();
    await command('tab-11','duplicate');expect(await currentId()).not.toBe('tab-11');
    await expect(page.locator('#raw-arguments')).toHaveValue('{ invalid draft');
    await expect(page.locator('.empty-result')).toContainText('等待执行');
    await expect(action('cancel-run')).toHaveCount(0);
    await page.locator('#raw-arguments').fill('{"query":"duplicate only","limit":10,"locale":"zh-CN","include_archived":false}');
    await page.locator('[data-action="select-tab"][data-tab="tab-11"]').click();await expect(page.locator('#raw-arguments')).toHaveValue('{ invalid draft');
  });
  await fresh();
  await check('Fixed tabs form a protected leading group; movement preserves active draft identity',async()=>{
    await page.locator('#param-query').fill('stable draft');
    await command('tab-12','left');expect(await tabs().evaluateAll(nodes=>nodes.map(node=>node.dataset.document))).toEqual(['tab-12','tab-11']);
    expect(await currentId()).toBe('tab-11');await expect(page.locator('#param-query')).toHaveValue('stable draft');
    await command('tab-12','right');
    await command('tab-12','pin');
    await expect(page.locator('[data-action="close-tab"][data-tab="tab-12"]')).toBeDisabled();
    await menu('tab-12');await expect(action('tab-command-pin')).toHaveAttribute('aria-checked','true');await expect(action('tab-command-right')).toBeDisabled();
    await page.keyboard.press('Escape');
    await command('tab-11','duplicate');const duplicate=await currentId();
    await command('tab-11','close-right');await expect(page.locator(`[data-document="${duplicate}"]`)).toHaveCount(0);
    await expect(page.locator('[data-document="tab-12"]')).toBeVisible();expect(await currentId()).toBe('tab-11');
    await command('tab-11','duplicate');await command('tab-11','others');await expect(tabs()).toHaveCount(2);
    await command('tab-12','pin');await expect(page.locator('[data-action="close-tab"][data-tab="tab-12"]')).toBeEnabled();
  });
  await fresh();
  await check('Batch closing touches only current connection; same-URL personal connection stays isolated',async()=>{
    await page.locator('#active-server').selectOption('commerce-personal');
    await page.locator('[data-action="open-tool"][data-tool="search_products"]').click();
    const personal=await currentId();await page.locator('#param-query').fill('personal isolated');
    await action('tool-history').click();await expect(page.locator('[data-action="select-tool-run"]')).toHaveCount(0);
    await action('return-debug').first().click();await page.locator('#active-server').selectOption('commerce-main');
    await command('tab-11','others');await expect(tabs()).toHaveCount(1);
    await page.locator('#active-server').selectOption('commerce-personal');expect(await currentId()).toBe(personal);await expect(page.locator('#param-query')).toHaveValue('personal isolated');
    await action('projects').click();await page.locator('[data-action="switch-project"][data-project="knowledge"]').click();await expect(tabs()).toHaveCount(2);
  });
  await check('A running tab is excluded from batch close and single close',async()=>{
    const running=await context.newPage();await running.goto(url);
    await running.clock.install({time:new Date('2026-10-10T01:00:00Z')});await running.clock.pauseAt(new Date('2026-10-10T01:00:01Z'));
    await running.locator('[data-action="execute"]').click();await expect(running.locator('[data-action="close-tab"][data-tab="tab-11"]')).toBeDisabled();
    await running.locator('#tab-menu-tab-12').click();await expect(running.locator('[data-action="tab-command-others"]')).toBeDisabled();
    await running.keyboard.press('Escape');await running.locator('[data-action="duplicate-tab"]').click();
    const draft=new URL(running.url()).searchParams.get('tab');await running.locator(`#tab-menu-${draft}`).click();await running.locator('[data-action="tab-command-others"]').click();
    await expect(running.locator('[data-document="tab-11"]')).toBeVisible();await expect(running.locator('.document-tab')).toHaveCount(2);
    await running.clock.runFor(900);await running.locator('[data-action="select-tab"][data-tab="tab-11"]').click();await expect(running.locator('.result-status')).toContainText('成功');
    await running.close();
  });
  await fresh();
  await check('Theme and collapse preserve unsaved form, DOM and draft identity',async()=>{
    await page.locator('[data-page="servers"]').click();await page.locator('#server-name').fill('unsaved name');
    await page.locator('#server-name').evaluate(node=>node.dataset.probe='same-node');
    await action('toggle-sidebar').click();expect((await page.locator('.app-sidebar').boundingBox()).width).toBe(80);
    await expect(action('toggle-sidebar')).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.mainnav [data-page="tools"]')).toHaveAccessibleName('工具调试');
    await action('toggle-theme').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(page.locator('#server-name')).toHaveValue('unsaved name');await expect(page.locator('#server-name')).toHaveAttribute('data-probe','same-node');
    await action('toggle-sidebar').click();expect((await page.locator('.app-sidebar').boundingBox()).width).toBe(192);
    await expect(action('toggle-sidebar')).toHaveAttribute('aria-expanded','true');
    await page.locator('[data-page="tools"]').click();await page.locator('#param-query').fill('theme keeps draft');
    await page.locator('#language-switch').selectOption('en-US');await expect(page.locator('#param-query')).toHaveValue('theme keeps draft');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.locator('#language-switch').selectOption('zh-CN');
    await capture('tools-dark');await action('toggle-theme').click();await capture('tools-light');
    await action('toggle-sidebar').click();await capture('sidebar-collapsed');await action('toggle-sidebar').click();
  });
  await check('Dark theme applies to scoped history and Secret editor with visible actions',async()=>{
    await action('toggle-theme').click();await action('tool-history').click();
    await expect(page.locator('.tool-history-page')).toContainText('commerce-run-01');await capture('tool-history-dark');
    await action('return-debug').first().click();
    await page.locator('[data-page="environment"]').click();
    await page.locator('[data-action="edit-variable"][data-variable="var-token"]').click();
    await expect(page.locator('#variable-value')).toHaveValue('');await expect(page.locator('#variable-value')).toHaveAttribute('type','password');
    await expect(page.locator('[data-submit="save-variable"]')).toBeInViewport();
    const colors=await page.getByRole('dialog').evaluate(node=>({background:getComputedStyle(node).backgroundColor,text:getComputedStyle(node).color}));
    expect(colors.background).not.toBe('rgb(255, 255, 255)');expect(colors.text).not.toBe(colors.background);
    await capture('secret-editor-dark');await page.keyboard.press('Escape');await page.locator('[data-page="tools"]').click();
  });
  await check('Both themes and locales keep primary controls and menu visible at four widths',async()=>{
    for(const theme of ['light','dark']){
      if(await page.locator('html').getAttribute('data-theme')!==theme)await action('toggle-theme').click();
      for(const locale of ['zh-CN','en-US']){
        await page.locator('#language-switch').selectOption(locale);
        for(const width of [1440,1024,820,390]){
          await page.setViewportSize({width,height:900});
          expect(await page.evaluate(()=>document.body.scrollWidth)).toBeLessThanOrEqual(width);
          for(const control of [action('account'),action('execute'),action('toggle-sidebar'),action('toggle-theme'),page.locator('#language-switch')])await expect(control).toBeInViewport();
          await menu('tab-11');await expect(page.getByRole('menu')).toBeInViewport();
          const box=await page.getByRole('menu').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
          await page.keyboard.press('Escape');
        }
      }
    }
  });
  await check('Theme preference persists only an enum; invalid preference is discarded',async()=>{
    await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    expect(await page.evaluate(()=>Object.keys(localStorage).sort())).toEqual(['mcp-inspector.locale','mcp-inspector.theme']);
    expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);
    await page.evaluate(()=>localStorage.setItem('mcp-inspector.theme','invalid'));await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    expect(await page.evaluate(()=>localStorage.getItem('mcp-inspector.theme'))).toBeNull();
    expect(errors).toEqual([]);expect(requests).toEqual([]);
  });
  await writeFile(`${assets}/controls-verification.json`,JSON.stringify({date:'2026-10-10',scope:'Standalone design prototype: scoped tool history, tab actions, themes, sidebar, account and shared components',checks,errors,requests,screenshots:['tool-history','tool-history-detail','tool-tab-menu','tools-dark','tools-light','sidebar-collapsed','tool-history-dark','secret-editor-dark']},null,2));
  console.log(JSON.stringify({passed:checks.length,errors}));
} finally {await browser.close();}
