import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const assets=fileURLToPath(new URL('./preview-assets/',import.meta.url));
await mkdir(assets,{recursive:true});
const resources={window:{}};
vm.runInNewContext(await readFile(new URL('./preview-locales.js',import.meta.url),'utf8'),resources);
expect(Object.keys(resources.window.previewLocales['zh-CN']).sort()).toEqual(Object.keys(resources.window.previewLocales['en-US']).sort());
for(const language of Object.values(resources.window.previewLocales))for(const value of Object.values(language))expect(value.trim()).not.toBe('');
const browser=await chromium.launch({headless:true,executablePath:process.env.PREVIEW_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const errors=[],requests=[],checks=['Chinese and English resources match'];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8861/'))requests.push(request.url());});
const url='http://127.0.0.1:8861/workbench-preview.html';
const action=name=>page.locator(`[data-action="${name}"]:visible`);
const fresh=()=>page.goto(`${url}?page=tools&project=commerce&tab=tab-11`);
const goHistory=()=>page.locator('[data-page="history"]').click();
const goSaved=()=>page.locator('[data-action="records-global-view"][data-view="saved"]').click();
async function check(name,fn){await fn();checks.push(name);console.log(`PASS ${name}`);}
async function capture(name){await page.locator('#notification').evaluate(node=>node.hidden=true);await page.screenshot({path:`${assets}/${name}.png`,animations:'disabled'});}
try {
  await fresh();
  await check('Platform history and saved records are pages under the existing four navigation entries',async()=>{
    await expect(page.locator('.mainnav button')).toHaveCount(4);
    await goHistory();await expect(page.locator('.records-global-nav')).toContainText('已保存');
    await expect(page.locator('.history-table')).toContainText('平台已记录');
    await expect(page.locator('.history-table')).toContainText('上传失败');
    await expect(page.locator('.history-table')).toContainText('等待上传');
    await goSaved();await expect(page).toHaveURL(/page=history.*collection=saved/);
    await expect(action('records-select')).toHaveCount(2);
    await capture('saved-records');
    await page.locator('[data-action="records-global-view"][data-view="calls"]').click();
    await page.locator('[data-action="select-run"][data-run="commerce-run-01"]').click();
    await expect(page.locator('.run-snapshots')).toContainText('无线机械键盘 K87');
    await expect(page.locator('.run-page-scroll')).toContainText('平台保存请求参数');
    expect(await page.locator('#overlay').evaluate(node=>node.open)).toBe(false);
  });
  await fresh();
  await check('Saving a request takes a frozen draft snapshot, preserves fields across locale changes and omits stale response',async()=>{
    await page.locator('#param-query').fill('saved draft only');
    await action('save-request').click();await expect(page).toHaveURL(/view=save-record/);
    await page.locator('#record-name').fill('研发检索请求');await page.locator('#record-note').fill('仅保存当前参数');
    await expect(page.locator('.record-snapshots')).not.toContainText('无线机械键盘 K87');
    await page.locator('#record-visibility').selectOption('project');
    await page.locator('#language-switch').selectOption('en-US');
    await expect(page.locator('#record-name')).toHaveValue('研发检索请求');await expect(page.locator('#record-note')).toHaveValue('仅保存当前参数');
    await expect(page.locator('#record-visibility')).toHaveValue('project');await expect(action('records-submit')).toHaveText('Save to platform');
    await page.locator('#language-switch').selectOption('zh-CN');
    await capture('save-request');
    await action('records-submit').click();await expect(page).toHaveURL(/view=saved-detail.*record=commerce-saved-/);
    await expect(page.locator('.record-snapshots')).toContainText('saved draft only');
    await expect(page.locator('.record-snapshots')).toContainText('未保存响应');
    await action('records-back').click();await expect(action('records-select')).toHaveCount(2);
  });
  await fresh();
  await check('Saving a call captures executed arguments and response rather than later edits',async()=>{
    await page.locator('#param-query').fill('later unsent draft');
    await action('save-call-record').click();
    await expect(page.locator('.record-snapshots')).toContainText('无线键盘');
    await expect(page.locator('.record-snapshots')).not.toContainText('later unsent draft');
    await expect(page.locator('.record-snapshots')).toContainText('无线机械键盘 K87');
    await page.locator('#record-name').fill('商品查询响应快照');await action('records-submit').click();
    const id=new URL(page.url()).searchParams.get('record');
    await capture('saved-record-detail');
    await action('return-debug').first().click();await page.locator('#param-query').fill('changed again');
    await action('tool-saved').click();await page.locator(`[data-action="records-select"][data-record="${id}"]`).click();
    await expect(page.locator('.record-snapshots')).not.toContainText('changed again');
    await expect(page.locator('.record-snapshots')).toContainText('无线机械键盘 K87');
  });
  await fresh();
  await check('Invalid raw JSON stays in debugger; empty save name preserves page and shows a local error',async()=>{
    await action('input-json').click();await page.locator('#raw-arguments').fill('{ invalid');
    await action('save-request').click();await expect(page.locator('#raw-arguments')).toHaveValue('{ invalid');
    await expect(page.locator('.record-editor-page')).toHaveCount(0);
    await page.locator('#raw-arguments').fill('{"query":"valid","limit":10,"locale":"zh-CN","include_archived":false}');
    await action('save-request').click();await page.locator('#record-name').fill('   ');await action('records-submit').click();
    await expect(page.locator('#record-error')).toHaveText('请输入记录名称。');
    await expect(page.locator('.record-editor-page')).toBeVisible();
    await action('records-cancel').click();await expect(page.locator('#raw-arguments')).toHaveValue('{"query":"valid","limit":10,"locale":"zh-CN","include_archived":false}');
  });
  await fresh();
  await check('Named record details are scoped by project, exact connection and tool, including deep links',async()=>{
    await action('tool-saved').click();await expect(action('records-select')).toHaveCount(1);
    await page.locator('#active-server').selectOption('commerce-personal');await action('tool-saved').click();
    await expect(action('records-select')).toHaveCount(0);
    await page.goto(`${url}?page=tools&project=commerce&tab=tab-12&view=saved-detail&record=commerce-saved-fixture-01`);
    await expect(page.getByRole('heading',{name:'记录不存在'})).toBeVisible();
    await page.goto(`${url}?page=saved-detail&project=knowledge&record=commerce-saved-fixture-01`);
    await expect(page.getByRole('heading',{name:'记录不存在'})).toBeVisible();
    await page.goto(`${url}?page=tools&project=commerce&tab=tab-11&view=saved-detail&record=commerce-saved-fixture-01`);
    await expect(page.getByRole('heading',{name:'键盘商品检索'})).toBeVisible();
    await page.reload();await expect(page.getByRole('heading',{name:'键盘商品检索'})).toBeVisible();
    await action('records-back').click();await page.goBack();await expect(page).toHaveURL(/view=saved-detail/);
  });
  await fresh();
  await check('Loading a saved request creates an independent unexecuted tab; original response remains read-only',async()=>{
    await action('tool-saved').click();await action('records-select').click();await action('records-load').click();
    await expect(page.locator('.document-tab')).toHaveCount(3);await expect(page.locator('.empty-result')).toContainText('等待执行');
    await expect(page.locator('#param-query')).toHaveValue('无线键盘');
    await page.locator('#param-query').fill('restored only');
    await page.locator('[data-action="select-tab"][data-tab="tab-11"]').click();
    await expect(page.locator('.record-snapshots')).toContainText('无线键盘');await expect(page.locator('.record-snapshots')).not.toContainText('restored only');
    await expect(action('cancel-run')).toHaveCount(0);
  });
  await fresh();
  await check('Global call details can save a failed response with its source identity',async()=>{
    await goHistory();await page.locator('[data-action="select-run"][data-run="commerce-run-02"]').click();
    await action('save-history-record').click();await expect(page).toHaveURL(/page=record-editor/);
    await page.locator('#record-name').fill('授权失败排查');await action('records-submit').click();
    await expect(page).toHaveURL(/page=saved-detail/);await expect(page.locator('.record-snapshots')).toContainText('AUTHORIZATION_REQUIRED');
    await action('records-edit').click();await page.locator('#record-note').fill('等待重新授权');await action('records-submit').click();
    await expect(page.locator('.record-description').first()).toHaveText('等待重新授权');
    await action('records-back').click();await page.locator('#saved-record-search').fill('授权失败');await expect(action('records-select')).toHaveCount(1);
    await page.locator('[data-page="tools"]').click();await action('tool-saved').click();await expect(page.locator('#saved-record-search')).toHaveValue('');
  });
  await fresh();
  await check('Sensitive request fields and HTML names remain masked or inert in saved snapshots',async()=>{
    await action('input-json').click();await page.locator('#raw-arguments').fill(JSON.stringify({query:'normal',api_key:'fixture-secret',nested:{authorization:'Bearer fixture-token'},limit:10}));
    await action('save-request').click();await expect(page.locator('.record-snapshots')).not.toContainText('fixture-secret');
    await expect(page.locator('.record-snapshots')).not.toContainText('fixture-token');await expect(page.locator('.record-snapshots')).toContainText('[REDACTED]');
    await page.locator('#record-name').fill('<img src=x onerror=alert(1)>');await action('records-submit').click();
    await expect(page.locator('main img')).toHaveCount(0);await expect(page.getByRole('heading',{name:'<img src=x onerror=alert(1)>'})).toBeVisible();
    expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>!['mcp-inspector.locale','mcp-inspector.theme'].includes(key)))).toBe(false);
  });
  await fresh();
  await check('Retrying history upload changes only its recording state and does not repeat the tool call',async()=>{
    await goHistory();await expect(action('select-run')).toHaveCount(5);await action('retry-history-upload').click();
    await expect(action('retry-history-upload')).toHaveCount(0);await expect(action('select-run')).toHaveCount(5);
    await page.locator('[data-page="tools"]').click();await expect(action('cancel-run')).toHaveCount(0);
    await expect(page.locator('#param-query')).toHaveValue('无线键盘');
  });
  await fresh();
  await check('Viewer cannot save, edit or load; Developer saves privately without sharing rights',async()=>{
    await action('account').click();await page.locator('#preview-role').selectOption('Viewer');
    await expect(action('save-request')).toBeDisabled();await expect(action('save-call-record')).toBeDisabled();
    await action('tool-saved').click();await action('records-select').click();await expect(action('records-edit')).toBeDisabled();await expect(action('records-load')).toBeDisabled();
    await action('account').click();await page.locator('#preview-role').selectOption('Developer');
    await action('return-debug').first().click();await action('save-request').click();
    await expect(page.locator('#record-visibility option[value="project"]')).toBeDisabled();
    await page.locator('#record-name').fill('私人调试请求');await action('records-submit').click();await expect(page.locator('.record-summary')).toContainText('仅本人');
  });
  await fresh();
  await check('Source navigation and cancelling a save stay within the original tool history page',async()=>{
    await action('tool-saved').click();await action('records-select').click();await action('records-source').click();
    await expect(page).toHaveURL(/page=tools.*view=history-detail.*run=commerce-run-01/);
    await action('save-history-record').click();await page.locator('#record-name').fill('cancelled save');
    await action('records-cancel').click();await expect(page).toHaveURL(/page=tools.*view=history-detail.*run=commerce-run-01/);
    await expect(page.locator('.tool-history-detail')).toContainText('commerce-run-01');
  });
  await fresh();
  await check('Saved snapshots survive clearing their unpinned source history',async()=>{
    await goHistory();await page.locator('[data-action="select-run"][data-run="commerce-run-02"]').click();
    await action('save-history-record').click();await page.locator('#record-name').fill('保留失败响应');await action('records-submit').click();
    const id=new URL(page.url()).searchParams.get('record');await goHistory();
    await page.locator('[data-action="records-global-view"][data-view="calls"]').click();
    await action('clear-history').click();await page.locator('#overlay button[type="submit"]').click();
    await goSaved();await page.locator(`[data-action="records-select"][data-record="${id}"]`).click();
    await expect(page.locator('.record-snapshots')).toContainText('AUTHORIZATION_REQUIRED');
    await expect(action('records-source')).toHaveCount(0);
  });
  await fresh();
  await check('Both languages and themes keep core record actions reachable at four widths',async()=>{
    for(const width of [1440,1024,820,390]) {
      await page.setViewportSize({width,height:900});
      for(const language of ['zh-CN','en-US']) {
        await page.locator('#language-switch').selectOption(language);
        for(const theme of ['light','dark']) {
          if(await page.locator('html').getAttribute('data-theme')!==theme)await action('toggle-theme').click();
          await goHistory();await goSaved();await expect(action('records-select').first()).toBeVisible();
          await action('records-select').first().click();await expect(action('records-load')).toBeVisible();
          await action('records-edit').click();await expect(action('records-submit')).toBeVisible();
          await expect(page.locator('#record-name')).toBeVisible();
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
          await action('records-cancel').click();
          if(width===1440 && language==='en-US' && theme==='dark')await capture('saved-records-dark-en');
        }
      }
    }
  });
  expect(errors).toEqual([]);expect(requests).toEqual([]);
  await writeFile(`${assets}/records-verification.json`,JSON.stringify({status:'pass',checks,errors,externalRequests:requests},null,2));
  console.log(JSON.stringify({passed:checks.length,errors,externalRequests:requests},null,2));
} catch(error) {
  await writeFile(`${assets}/records-verification.json`,JSON.stringify({status:'fail',checks,errors,error:String(error)},null,2));
  await page.screenshot({path:`${assets}/records-failure.png`}).catch(()=>{});
  throw error;
} finally {await browser.close();}
