import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory=fileURLToPath(new URL('./tools-design-assets/',import.meta.url));
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PREVIEW_BROWSER||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[],requests=[],checks=[];
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8861/tools-designs.html';
const origin=new URL(base).origin;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith(`${origin}/`))requests.push(request.url());});
const action=name=>page.locator(`[data-action="${name}"]:visible`);
const variant=key=>page.locator(`#switcher [data-variant="${key}"]`);
async function check(name,callback){await callback();checks.push(name);}
async function capture(name){await page.locator('#toast').evaluate(element=>element.hidden=true);await page.screenshot({path:`${directory}/${name}.png`});}
async function noOverflow(){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
try {
  await page.goto(`${base}?variant=A`);
  await check('A Studio initial example clearly labeled',async()=>{
    await expect(page.getByRole('heading',{name:'查找商品',exact:true})).toBeVisible();
    await expect(page.getByText('初始示例结果 · 尚未执行',{exact:true})).toBeVisible();
    await expect(page.getByRole('region',{name:'请求参数',exact:true})).toBeVisible();
    await noOverflow();
  });
  await capture('studio');
  await check('B discovery hierarchy and group / description search',async()=>{
    await variant('B').click();await expect(page).toHaveURL(/variant=B/);
    await expect(page.locator('#catalog-list .tool-card')).toHaveCount(4);
    await capture('catalog');
    await page.locator('#catalog-search').fill('仓库');
    await expect(page.locator('#catalog-list .tool-card')).toHaveCount(1);
    await expect(page.locator('#catalog-list')).toContainText('查看库存');
    await page.locator('#catalog-search').fill('');
    await page.locator('[data-filter="订单"]').click();
    await expect(page.locator('#catalog-list .tool-card')).toHaveCount(1);
    await page.locator('[data-filter="全部"]').click();
  });
  await check('C sequential notebook and independent context inspector',async()=>{
    await variant('C').click();await page.locator('[data-mode="json"]:visible').click();
    await expect(page.getByRole('complementary',{name:'会话检查器'})).toBeVisible();
    await expect(page.locator('#raw-arguments')).toHaveValue(/无线键盘/);
    await noOverflow();await capture('notebook');
  });
  await check('Variants preserve draft; form and JSON synchronize',async()=>{
    await variant('A').click();await page.locator('[data-mode="form"]:visible').click();
    await page.locator('#field-query').fill('机械键盘');
    await expect(page.getByText('参数已修改 · 下方仍为上次调用结果，运行后更新。')).toBeVisible();
    await variant('C').click();await page.locator('[data-mode="json"]:visible').click();
    await expect(page.locator('#raw-arguments')).toHaveValue(/机械键盘/);
    await page.locator('#raw-arguments').fill('{"query":"人体工学键盘","limit":10,"locale":"zh-CN","include_archived":false}');
    await page.locator('[data-mode="form"]:visible').click();
    await expect(page.locator('#field-query')).toHaveValue('人体工学键盘');
  });
  await check('Invalid input blocks execution and keeps draft',async()=>{
    await page.locator('[data-mode="json"]:visible').click();await page.locator('#raw-arguments').fill('{oops');
    await action('execute').click();await expect(page.getByRole('alert')).toContainText('JSON 格式无效');
    await expect(page.locator('#raw-arguments')).toHaveValue('{oops');await expect(action('cancel')).toHaveCount(0);
    await page.locator('#raw-arguments').fill('{"query":"快照键盘","limit":0}');await action('execute').click();
    await expect(page.getByRole('alert')).toContainText('1–100');
  });
  await check('Execution snapshot stays fixed while draft changes',async()=>{
    await page.locator('#raw-arguments').fill('{"query":"快照键盘","limit":10,"locale":"zh-CN","include_archived":false}');
    await action('execute').click();await expect(action('cancel')).toBeVisible();
    await page.locator('#raw-arguments').fill('{"query":"下一次参数","limit":10}');
    await expect(page.locator('.result-status strong')).toHaveText('调用完成');
    await expect(page.locator('.product-table')).toContainText('快照键盘 K2');
    await expect(page.locator('.product-table')).not.toContainText('下一次参数');
    await expect(page.locator('.stale')).toBeVisible();
    await capture('snapshot');
  });
  await check('Cancellation records a terminal simulated run',async()=>{
    await action('execute').click();await action('cancel').click();
    await expect(page.locator('.result-status strong')).toHaveText('已取消');
    await action('history').first().click();await expect(page.getByRole('dialog')).toContainText('run_006 · 已取消');
    await action('close').click();
  });
  await check('Server-declared Tool errors are distinct and do not auto-retry',async()=>{
    await page.locator('#simulate-error').check();await action('execute').click();
    await expect(page.locator('.result-status strong')).toHaveText('Tool 返回错误');
    await expect(page.getByRole('alert')).toContainText('未自动重试');
    await capture('tool-error');await page.locator('#simulate-error').uncheck();
  });
  await check('History details read captured inputs; restore is unexecuted',async()=>{
    await action('history').first().click();await page.locator('[data-action="inspect-run"][data-run="run_005"]').click();
    await expect(page.getByRole('dialog')).toContainText('快照键盘');
    await page.getByRole('dialog').locator('[data-action="history"]').click();await page.locator('[data-action="restore"][data-run="run_005"]').click();
    await expect(page.locator('#raw-arguments')).toHaveValue(/快照键盘/);
    await expect(page.locator('.result-status strong')).toHaveText('等待执行');
    await expect(action('cancel')).toHaveCount(0);
  });
  await check('Tool discovery selection loads matching schema and sample',async()=>{
    await action('library').click();await page.locator('#library-search').fill('仓库');
    await expect(page.locator('#library-list .tool-card')).toHaveCount(1);
    await page.locator('#library-list [data-tool="get_inventory"]').click();
    await expect(page.getByRole('heading',{name:'查看库存',exact:true})).toBeVisible();
    await expect(page.locator('#raw-arguments')).toHaveValue(/product_id/);
    await action('execute').click();await expect(page.locator('.result-status strong')).toHaveText('调用完成');
    await expect(page.locator('.result-body')).toContainText('warehouses');
  });
  await check('Keyboard comparison and editable arrow keys',async()=>{
    await page.locator('#raw-arguments').focus();await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/variant=C/);
    await variant('A').focus();await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/variant=A/);
    await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/variant=B/);
  });
  for(const width of [1024,820,390]) {
    await page.setViewportSize({width,height:900});
    for(const key of ['A','B','C']) {
      await page.goto(`${base}?variant=${key}`);
      await check(`${key} layout at ${width}px`,async()=>{await noOverflow();await expect(page.getByRole('heading',{name:key==='B'?'找到工具，开始调试。':'查找商品',exact:true})).toBeVisible();});
      if(width===390||width===1024)await capture(`${key.toLowerCase()}-${width}`);
    }
  }
  await check('No runtime errors, remote requests or browser persistence',async()=>{
    expect(errors).toEqual([]);expect(requests).toEqual([]);
    expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  });
  await writeFile(`${directory}/verification.json`,JSON.stringify({passed:checks.length,checks,errors,unexpectedRequests:requests},null,2));
  console.log(JSON.stringify({passed:checks.length,errors,screenshots:11,report:`${directory}/verification.json`},null,2));
} finally {await browser.close();}
