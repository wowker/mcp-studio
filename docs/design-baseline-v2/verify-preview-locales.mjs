import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const assets = fileURLToPath(new URL('./preview-assets/',import.meta.url));
const sandbox = {window:{}};
vm.runInNewContext(await readFile(new URL('./preview-locales.js',import.meta.url),'utf8'),sandbox);
const resources = sandbox.window.previewLocales;
expect(Object.keys(resources['zh-CN']).sort()).toEqual(Object.keys(resources['en-US']).sort());
for(const catalog of Object.values(resources)) for(const value of Object.values(catalog)) expect(value.trim()).not.toBe('');
const source = await readFile(new URL('./workbench-preview.js',import.meta.url),'utf8') + await readFile(new URL('./workbench-components.js',import.meta.url),'utf8') + await readFile(new URL('./workbench-records.js',import.meta.url),'utf8') + await readFile(new URL('./workbench-parameters.js',import.meta.url),'utf8');
for(const match of source.matchAll(/'((?:common|tools|runs|servers|environment|parameters)\.[a-zA-Z0-9]+)'/g)) if(match[1] !== 'common.group') expect(resources['zh-CN'][match[1]]).toBeTruthy();
const browser = await chromium.launch({headless:true,executablePath:process.env.PREVIEW_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page = await context.newPage();
const errors=[],requests=[],checks=['Locale catalogs match and all static keys exist'];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8861/'))requests.push(request.url());});
const url = 'http://127.0.0.1:8861/workbench-preview.html?page=tools&project=commerce';
const action = name => page.locator(`[data-action="${name}"]:visible`);
async function check(name,callback){await callback();checks.push(name);}
async function capture(name){await page.bringToFront();await page.locator('#notification').evaluate(node=>node.hidden=true);await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:`${assets}/${name}.png`,animations:'disabled'});}
try {
  await page.goto(url);
  await check('Chinese default, single-language headings and language control at sidebar bottom',async()=>{
    await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
    await expect(page.locator('#language-switch')).toHaveValue('zh-CN');
    await expect(page.locator('.sidebar-bottom #language-switch')).toBeVisible();
    await expect(page.locator('.mainnav')).toContainText('工具调试');
    await expect(page.locator('.mainnav')).not.toContainText('Tools');
    await action('tool-definition').click();
    await expect(page.locator('.definition-heading')).not.toContainText('Tool definition');
    await action('return-debug').last().click();
  });
  await check('Language switch preserves tab, connection, draft, result, scroll and focus',async()=>{
    await page.locator('#param-query').fill('keep this draft');
    await page.locator('.result-pane .pane-scroll').evaluate(node=>node.scrollTop=100);
    const before=await page.evaluate(()=>({url:location.href,server:document.querySelector('#active-server').value,run:document.querySelector('.result-pane .pane-footer').textContent.split(' · ')[0],scroll:document.querySelector('.result-pane .pane-scroll').scrollTop}));
    await page.locator('#language-switch').selectOption('en-US');
    await expect(page.locator('html')).toHaveAttribute('lang','en-US');
    await expect(page.locator('.mainnav')).toContainText('Servers');
    await expect(page.locator('#param-query')).toHaveValue('keep this draft');
    expect(await page.evaluate(()=>({url:location.href,server:document.querySelector('#active-server').value,run:document.querySelector('.result-pane .pane-footer').textContent.split(' · ')[0],scroll:document.querySelector('.result-pane .pane-scroll').scrollTop}))).toEqual(before);
    await expect(page.locator('#language-switch')).toBeFocused();
    await capture('tools-en');
    await action('tool-definition').click();
    await expect(page.getByRole('heading',{name:'Tool definition',exact:true})).toBeVisible();
    await capture('tool-definition-en');
    await action('return-debug').last().click();
  });
  await check('Array errors, counts and drafts translate without modifying raw inputs',async()=>{
    await page.locator('[data-tool="get_store_product_mapping"]').click();
    await page.locator('#param-product_ids').fill('[invalid');
    await action('execute').click();
    await expect(page.locator('#arguments-error')).toContainText('Fix the array');
    await page.locator('#language-switch').selectOption('zh-CN');
    await expect(page.locator('#arguments-error')).toContainText('数组参数错误');
    await expect(page.locator('#param-product_ids')).toHaveValue('[invalid');
    await page.locator('#param-product_ids').fill('["prd_3001"]');
    await expect(page.locator('#array-count-product_ids')).toContainText('1 项');
    await page.locator('#language-switch').selectOption('en-US');
    await expect(page.locator('#array-count-product_ids')).toContainText('1 item');
    await expect(page.locator('#array-count-product_ids')).not.toContainText('1 items');
  });
  await check('Changing language during execution does not restart or duplicate a call',async()=>{
    await action('execute').click();
    await expect(action('cancel-run')).toBeVisible();
    await page.locator('#language-switch').selectOption('zh-CN');
    await expect(page.locator('.result-status')).toContainText('成功');
    await page.locator('#language-switch').selectOption('en-US');
    await expect(page.locator('.result-status')).toContainText('Success');
    await action('tool-history').click();
    await expect(page.locator('[data-action="select-tool-run"]')).toHaveCount(1);
    await page.locator('[data-action="select-tool-run"]').click();
    await expect(page.locator('.snapshot-content').first()).toContainText('prd_3001');
    await capture('history-detail-en');
  });
  await check('English configuration labels preserve canonical environment values and unsaved edits',async()=>{
    await page.locator('[data-page="servers"]').click();
    await expect(page.getByRole('heading',{name:'Servers',exact:true})).toBeVisible();
    await page.locator('#server-name').fill('Unsaved connection name');
    await page.locator('#language-switch').selectOption('zh-CN');
    await expect(page.locator('#server-name')).toHaveValue('Unsaved connection name');
    await expect(page.locator('#server-credential')).toHaveValue('项目凭据');
    await page.locator('#language-switch').selectOption('en-US');
    await expect(page.locator('#server-name')).toHaveValue('Unsaved connection name');
    await expect(page.locator('#server-credential')).toHaveValue('Project credentials');
    await action('toggle-config-connection').click();
    await page.locator('#server-profile').selectOption('预发环境');
    await expect(page.locator('#server-profile')).toHaveValue('预发环境');
    await page.locator('[data-page="environment"]').click();
    await page.locator('[data-profile="基础配置"]').click();
    await expect(page.locator('.detail-title h2')).toHaveText('Base');
    await expect(page.locator('table')).toContainText('REGION');
    await action('new-variable').click();
    await expect(page.getByRole('dialog')).toContainText('Variable name');
    await expect(page.locator('[data-submit="save-variable"]')).toBeInViewport();
    await page.keyboard.press('Escape');
    await action('members').click();
    await action('invite-member').click();
    await expect(page.locator('#invite-project-role')).toHaveValue('Developer');
    await expect(page.locator('[data-submit="create-invite"]')).toBeInViewport();
    await page.keyboard.press('Escape');
  });
  await check('Locale preference persists; invalid values fall back to Chinese; no business data stored',async()=>{
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang','en-US');
    expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual(['mcp-inspector.locale']);
    expect(await page.evaluate(()=>sessionStorage.length)).toBe(0);
    expect(await page.evaluate(()=>document.cookie)).toContain('mcp_inspector_locale=en-US');
    await page.evaluate(()=>localStorage.setItem('mcp-inspector.locale','<script>invalid</script>'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
    await page.locator('#language-switch').selectOption('en-US');
  });
  for(const locale of ['zh-CN','en-US']) for(const width of [1440,1024,820,390]) {
    await check(`${locale} controls remain reachable at ${width}px`,async()=>{
      await page.setViewportSize({width,height:900});
      await page.locator('#language-switch').selectOption(locale);
      await page.locator('[data-page="tools"]').click();
      await expect(action('execute')).toBeInViewport();
      await expect(page.locator('#language-switch')).toBeInViewport();
      await expect(action('toggle-connection')).toBeInViewport();
      expect(await page.evaluate(()=>document.body.scrollWidth)).toBeLessThanOrEqual(width);
      if(locale==='en-US' && [1024,390].includes(width))await capture(`tools-en-${width}`);
      for(const module of ['servers','environment','history']) {
        await page.locator(`[data-page="${module}"]`).click();
        expect(await page.evaluate(()=>document.body.scrollWidth)).toBeLessThanOrEqual(width);
        await expect(page.locator('#language-switch')).toBeInViewport();
      }
    });
  }
  expect(errors).toEqual([]);expect(requests).toEqual([]);
  await writeFile(`${assets}/locale-verification.json`,JSON.stringify({date:'2026-10-10',scope:'Standalone bilingual design preview; no production verification',checks,errors,unexpectedRequests:requests},null,2));
  console.log(JSON.stringify({passed:checks.length,errors}));
} finally {await browser.close();}
