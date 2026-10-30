import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {bootstrap,createProject,createService,fixtureStats,requestData} from './production-helpers';
import * as wire from '../../apps/web/src/generated/platform';

const evidenceDir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/v01-direct-assertions-focused/run-preferences';
const words={
 'zh-CN':{theme:'切换主题',raw:'原始参数',execute:'执行工具',cancel:'取消执行',close:'关闭 echo 的 Tab',running:'正在执行…',succeeded:'成功 · 工具结果',copy:'复制脱敏快照'},
 'en-US':{theme:'Toggle theme',raw:'Raw parameters',execute:'Execute tool',cancel:'Cancel execution',close:'Close tab for echo',running:'Running…',succeeded:'Succeeded · Tool result',copy:'Copy redacted snapshot'},
} as const;
type Locale=keyof typeof words;
async function preferences(page:Page,locale:Locale,theme:'light'|'dark'){
 await page.locator('.workbench-preferences select').selectOption(locale);
 await expect(page.locator('html')).toHaveAttribute('lang',locale);
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:words[locale].theme,exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
}

test('V01 A32 production: preference changes retain the in-flight call and completed Run identity, status and result',async({page,request,context,browser})=>{
 test.setTimeout(120000);
 const pageErrors:string[]=[];page.on('pageerror',()=>pageErrors.push('pageerror'));
 await bootstrap(page,request);
 const projectId=await createProject(page),connectionId=await createService(page,'V01 A32 live Run',process.env.PLAYWRIGHT_MCP_ORIGIN+'/mcp');
 // Explicit fixture release controls completion; the longer production timeout
 // leaves room for assertions without substituting a sleep for the barrier.
 await page.getByLabel('超时（毫秒）',{exact:true}).fill('120000');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await page.getByRole('button',{name:'连接',exact:true}).click();
 await expect(page.getByText(/已连接.*m2-controlled-fixture/)).toBeVisible();
 await page.getByRole('button',{name:'工具',exact:true}).click();
 await page.getByRole('button',{name:'打开 echo',exact:true}).click();
 await page.getByRole('button',{name:'原始 JSON',exact:true}).click();
 const draft='{"text":"fixture-slow-result","count":0,"enabled":false,"note":null}';
 await page.getByLabel(words['zh-CN'].raw,{exact:true}).fill(draft);
 const tab=page.getByRole('tab',{name:'echo',exact:true}),tabDOMId=await tab.getAttribute('id');
 expect(tabDOMId).toMatch(/^tool-tab-/u);const tabId=tabDOMId!.slice('tool-tab-'.length);
 const baseline=await fixtureStats(request);
 const history=()=>requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema);
 const baselineHistory=(await history()).items.length;
 const uploads:wire.RecordUploadInput[]=[];
 page.on('request',outgoing=>{if(outgoing.method()==='POST'&&new URL(outgoing.url()).pathname===`/api/v1/projects/${projectId}/record-uploads`)uploads.push(wire.recordUploadInputSchema.parse(outgoing.postDataJSON()));});
 await page.getByRole('button',{name:words['zh-CN'].execute,exact:true}).click();
 await expect.poll(async()=>(await fixtureStats(request)).delayedCalls).toBe(baseline.delayedCalls+1);
 const observations:{phase:'in-flight'|'completed';locale:Locale;theme:'light'|'dark'}[]=[];
 const assertContext=async()=>{
  const url=new URL(page.url());expect(url.searchParams.get('project')).toBe(projectId);expect(url.searchParams.get('connection')).toBe(connectionId);
  await expect(tab).toHaveAttribute('id',tabDOMId!);await expect(tab).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tabpanel')).toHaveAttribute('id',`tool-panel-${tabId}`);await expect(page.getByRole('tab')).toHaveCount(1);
 };
 for(const locale of ['en-US','zh-CN'] as const)for(const theme of ['dark','light'] as const){
  await preferences(page,locale,theme);await assertContext();
  await expect(page.getByLabel(words[locale].raw,{exact:true})).toHaveValue(draft);
  await expect(page.locator('.tool-execution').getByRole('status')).toHaveText(words[locale].running);
  await expect(page.getByRole('button',{name:words[locale].execute,exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:words[locale].cancel,exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:words[locale].close,exact:true})).toBeDisabled();
  const stats=await fixtureStats(request);expect(stats.toolsCall).toBe(baseline.toolsCall+1);expect(stats.initialize).toBe(baseline.initialize);expect(stats.releasedCalls).toBe(baseline.releasedCalls);
  expect((await history()).items).toHaveLength(baselineHistory);expect(uploads).toHaveLength(0);
  observations.push({phase:'in-flight',locale,theme});
 }
 await mkdir(evidenceDir,{recursive:true});await page.screenshot({path:`${evidenceDir}/in-flight-zh-CN-light.png`});
 const released=await request.post(process.env.PLAYWRIGHT_MCP_ORIGIN+'/release-tools');expect(released.status()).toBe(200);
 await expect(page.locator('.tool-execution').getByRole('status')).toHaveText(words['zh-CN'].succeeded);
 await expect.poll(async()=>(await history()).items.length).toBe(baselineHistory+1);
 const record=(await history()).items[0],snapshot=record.snapshot;
 expect(snapshot).toMatchObject({projectId,connectionId,tabId,toolName:'echo',runStatus:'succeeded',remoteOutcome:'known',resultKind:'success',executor:'browser'});expect(snapshot.runId).not.toBe('');
 expect(JSON.parse(snapshot.requestJSON)).toEqual(JSON.parse(draft));
 expect(JSON.parse(snapshot.responseJSON)).toMatchObject({content:[{type:'text',text:'fixture-slow-result'}],structuredContent:{text:'fixture-slow-result'}});
 expect(uploads).toHaveLength(1);expect(uploads[0].snapshot).toEqual(snapshot);
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const responseText=await page.locator('.tool-execution details[open] pre').textContent();expect(responseText).toBe(snapshot.responseJSON);
 const copy=async(locale:Locale)=>{await page.getByRole('button',{name:words[locale].copy,exact:true}).click();return wire.executionSnapshotSchema.parse(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())));};
 expect(await copy('zh-CN')).toEqual(snapshot);
 for(const locale of ['en-US','zh-CN'] as const)for(const theme of ['dark','light'] as const){
  await preferences(page,locale,theme);await assertContext();
  await expect(page.getByLabel(words[locale].raw,{exact:true})).toHaveValue(draft);
  await expect(page.locator('.tool-execution').getByRole('status')).toHaveText(words[locale].succeeded);
  await expect(page.getByRole('button',{name:words[locale].execute,exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:words[locale].cancel,exact:true})).toHaveCount(0);
  expect(await page.locator('.tool-execution details[open] pre').textContent()).toBe(responseText);
  expect(await copy(locale)).toEqual(snapshot);
  const records=await history();expect(records.items).toHaveLength(baselineHistory+1);expect(records.items[0]).toEqual(record);
  const stats=await fixtureStats(request);expect(stats.toolsCall).toBe(baseline.toolsCall+1);expect(stats.initialize).toBe(baseline.initialize);expect(stats.releasedCalls).toBe(baseline.releasedCalls+1);expect(uploads).toHaveLength(1);
  observations.push({phase:'completed',locale,theme});
 }
 await page.screenshot({path:`${evidenceDir}/completed-zh-CN-light.png`});expect(pageErrors).toEqual([]);
 await writeFile(`${evidenceDir}/run-preferences.json`,JSON.stringify({scope:'Production build, isolated PostgreSQL and synthetic MCP barrier; supplemental A32 automated assertions, no formal/manual/native/target-browser acceptance.',browser:browser.version(),identity:{projectId,connectionId,tabId,runId:snapshot.runId},observations,counters:{baseline,final:await fixtureStats(request),uploads:uploads.length},pageErrors},null,2)+'\n');
});
