import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {bootstrap,createProject,createService,fixtureStats,requestData} from './production-helpers';
import {verifyRequiredLayout,verifyReachableControl} from './v01-required-layout';
import * as wire from '../../apps/web/src/generated/platform';

const selectors=['.workbench-content','.tools-layout','.tools-catalog','.tools-workspace','.tools-document','.tools-document [role=tabpanel]','.ui-debugger-layout','.ui-debugger-split','.ui-debugger-request','.ui-debugger-result'] as const;
test('V01 A30 production: required panes and bottom bar remain nonzero, unclipped and reachable in the bilingual theme/window matrix',async({page,request})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',()=>errors.push('pageerror'));const dir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/v01-a30-a38-focused/layout';await mkdir(dir,{recursive:true});
 await bootstrap(page,request);const projectId=await createProject(page);await createService(page,'A30 long service name · 很长的服务名称',process.env.PLAYWRIGHT_MCP_ORIGIN+'/mcp');await page.getByRole('button',{name:'连接',exact:true}).click();await expect(page.getByText(/已连接.*m2-controlled-fixture/)).toBeVisible();await page.getByRole('button',{name:'工具',exact:true}).click();await page.getByRole('button',{name:'打开 echo',exact:true}).click();await page.locator('.workbench-preferences select').selectOption('en-US');await page.getByRole('button',{name:'Raw JSON',exact:true}).click();
 const draft=JSON.stringify({text:'Long result · 长结果 '.repeat(200),count:0,enabled:false,note:null});await page.getByLabel('Raw parameters',{exact:true}).fill(draft);await page.getByRole('button',{name:'Execute tool',exact:true}).click();await expect(page.locator('.tool-execution > p[role=status]').filter({hasText:'Succeeded'})).toBeVisible();await expect.poll(async()=>(await requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema)).items.length).toBe(1);
 const before=await fixtureStats(request),record=(await requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema)).items[0];const metrics=[];
 for(const language of ['en-US','zh-CN'] as const)for(const appearance of ['light','dark'] as const){
  await page.locator('.workbench-preferences select').selectOption(language);if(await page.locator('html').getAttribute('data-theme')!==appearance)await page.getByRole('button',{name:language==='en-US'?'Toggle theme':'切换主题',exact:true}).click();
  for(const viewport of [{width:390,height:844},{width:820,height:640},{width:1024,height:640},{width:1440,height:640},{width:1024,height:480}]){
   await page.setViewportSize(viewport);const geometry=await verifyRequiredLayout(page,selectors);await expect(page.getByLabel(language==='en-US'?'Raw parameters':'原始参数',{exact:true})).toHaveValue(draft);
   const parameterAction=await verifyReachableControl(page.getByRole('button',{name:language==='en-US'?'Validate parameters':'校验参数',exact:true}));
   const resultAction=await verifyReachableControl(page.getByRole('button',{name:language==='en-US'?'Copy redacted snapshot':'复制脱敏快照',exact:true}));
   const sidebarLanguage=await verifyReachableControl(page.locator('.workbench-preferences select'));
   metrics.push({language,appearance,viewport,geometry,parameterAction,resultAction,sidebarLanguage});
   if(viewport.width===390||viewport.width===1440)await page.screenshot({path:`${dir}/a30-bottom-${language}-${appearance}-${viewport.width}.png`});
  }
 }
 // Controlled CSS probes prove the new oracle catches the two formerly missing
 // assertions. They are harness checks, never reported as product defects.
 const pane=page.locator('.ui-debugger-request'),originalPane=await pane.getAttribute('style');
 try{await pane.evaluate(element=>{element.style.cssText='height:0;max-height:0;min-height:0;padding:0;border:0';});await expect(verifyRequiredLayout(page,selectors)).rejects.toThrow('.ui-debugger-request height');}finally{await pane.evaluate((element,style)=>{if(style===null)element.removeAttribute('style');else element.setAttribute('style',style);},originalPane);}
 const footer=page.locator('.workbench-footer'),originalFooter=await footer.getAttribute('style');
 try{await footer.evaluate(element=>{element.style.transform='translateY(100%)';});await expect(verifyRequiredLayout(page,selectors)).rejects.toThrow('bottom bar bottom stays in viewport');}finally{await footer.evaluate((element,style)=>{if(style===null)element.removeAttribute('style');else element.setAttribute('style',style);},originalFooter);}
 await verifyRequiredLayout(page,selectors);expect(await fixtureStats(request)).toEqual(before);expect((await requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema)).items).toEqual([record]);expect(errors).toEqual([]);
 await writeFile(`${dir}/required-pane-footer-metrics.json`,JSON.stringify({scope:'Controlled Chromium geometry + hit testing + focus/trial click; T02/T32b/native/manual/media and formal A30 pending',requiredSelectors:selectors,cells:metrics.length,metrics,oracleProbes:{zeroHeightRejected:true,clippedBottomRejected:true,restored:true,productDefects:false},upstream:before,runId:record.snapshot.runId,pageErrors:errors},null,2)+'\n');
});
