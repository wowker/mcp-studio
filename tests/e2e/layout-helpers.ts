import {expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {verifyRequiredLayout} from './v01-required-layout';
const defaultDir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/m6-layout';
export async function verifyLayout(page:Page,viewName:string,{evidenceDir=defaultDir,screenshot=false}:{evidenceDir?:string;screenshot?:boolean}={}){
 const requiredGeometry=await verifyRequiredLayout(page,['.workbench-content']);
 const metrics=await page.evaluate(()=>{
  const shown=(element:Element)=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=='hidden';};
  const panes=[...document.querySelectorAll('.tools-layout,.tools-workspace,.ui-debugger-request,.ui-debugger-result,.workbench-content')].filter(shown).map(element=>({className:element.className,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}));
  const text=[...document.querySelectorAll('h1,h2,p,label,button,input,select,textarea,small,summary,th,td')].filter(shown);
  const sensitiveInput=[...document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')].some(field=>field.value!==''&&(field.type==='password'||/(password|密码|token|令牌|凭证|code|验证码|pairing|配对码)/iu.test([field.getAttribute('aria-label')??'',field.name,...[...(field.labels??[])].map(label=>label.textContent??'')].join(' '))));
  const tables=[...document.querySelectorAll('.ui-table-scroll')].filter(shown).map(region=>({regionWidth:region.getBoundingClientRect().width,tableWidth:region.querySelector('table')?.getBoundingClientRect().width??0,keyboardReachable:region.getAttribute('tabindex')==='0'}));
  return {tables,bodySize:parseFloat(getComputedStyle(document.body).fontSize),minimumTextSize:Math.min(...text.map(element=>parseFloat(getComputedStyle(element).fontSize))),auxiliarySizes:[...document.querySelectorAll('small')].filter(shown).map(element=>parseFloat(getComputedStyle(element).fontSize)),pageOverflow:document.documentElement.scrollWidth>innerWidth,panes,sensitiveInput};
 });
 expect(metrics.bodySize).toBe(14);expect(metrics.minimumTextSize).toBeGreaterThanOrEqual(11);for(const size of metrics.auxiliarySizes)expect(size).toBe(12);expect(metrics.pageOverflow).toBe(false);for(const pane of metrics.panes){expect(pane.width).toBeGreaterThan(0);expect(pane.height).toBeGreaterThan(0);}
 for(const table of metrics.tables){expect(table.tableWidth).toBeGreaterThanOrEqual(640);if(table.regionWidth<640)expect(table.keyboardReachable).toBe(true);}
 await mkdir(evidenceDir,{recursive:true});const screenshotState=!screenshot?'not-requested':metrics.sensitiveInput?'withheld-sensitive-input':'captured';if(screenshotState==='captured')await page.screenshot({path:`${evidenceDir}/${viewName}.png`});
 return {name:viewName,...metrics,requiredGeometry,screenshot:screenshotState};
}
export async function axeScan(page:Page,viewName:string,evidenceDir=defaultDir){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 // Never persist HTML, form values, raw URLs, or axe diagnostic strings.
 const summarize=(item:typeof result.violations[number])=>({id:item.id,impact:item.impact,targets:item.nodes.flatMap(node=>node.target.map(target=>String(target).replace(/\[[^\]]*\]/gu,'[attribute]')))});
 const report={engine:result.testEngine,timestamp:result.timestamp,scope:'WCAG 2/2.1 A/AA automatic axe scan; incomplete checks require human review.',passes:result.passes.map(item=>item.id),incomplete:result.incomplete.map(summarize),violations:result.violations.map(summarize)};
 await mkdir(evidenceDir,{recursive:true});await writeFile(`${evidenceDir}/${viewName}-axe.json`,JSON.stringify(report,null,2));expect(report.violations,`${viewName} axe WCAG A/AA violations`).toEqual([]);return report;
}
