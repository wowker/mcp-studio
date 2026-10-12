import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const assets=fileURLToPath(new URL('./preview-assets/',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.PREVIEW_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
const errors=[],requests=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8861/'))requests.push(request.url());});
const url='http://127.0.0.1:8861/workbench-preview.html?page=tools&project=commerce&tab=tab-11';
const action=name=>page.locator(`[data-action="${name}"]:visible`);
const fresh=()=>page.goto(url);
async function check(name,fn){await fn();checks.push(name);console.log(`PASS ${name}`);}
async function capture(name){await page.locator('#notification').evaluate(node=>node.hidden=true);await page.screenshot({path:`${assets}/${name}.png`,animations:'disabled'});}
async function raw(){await action('input-json').click();return JSON.parse(await page.locator('#raw-arguments').inputValue());}
try{
  await check('Shared application validator distinguishes missing, empty, null, zero, false and empty collections',async()=>{
    const sandbox={window:{},structuredClone};
    vm.runInNewContext(await readFile(new URL('./vendor/preview-schema.js',import.meta.url),'utf8'),sandbox);
    vm.runInNewContext(await readFile(new URL('./workbench-parameters.js',import.meta.url),'utf8'),sandbox);
    const validate=sandbox.window.previewSchema;
    const schema={type:'object',properties:{n:{type:'integer',minimum:0},flag:{type:'boolean'},text:{type:'string',minLength:1},items:{type:'array',minItems:0}},required:['n','flag']};
    expect(validate(schema,{n:0,flag:false,items:[]}).issues).toEqual([]);
    expect(validate(schema,{n:null,flag:false}).issues[0].keyword).toBe('type');
    expect(validate(schema,{n:0,flag:false,text:''}).issues[0].keyword).toBe('minLength');
    expect(validate(schema,{flag:false}).issues[0].keyword).toBe('required');
    expect(validate(schema,{n:0,flag:false,text:' '}).issues).toEqual([]); // No invented trim constraint.
    expect(sandbox.window.workbenchParameters.initialValue({type:'array'})).toEqual([]);
    expect(sandbox.window.workbenchParameters.initialValue({type:'boolean'})).toBe(false);
    expect(sandbox.window.workbenchParameters.initialValue({type:'integer'})).toBe(null);
    expect(sandbox.window.workbenchParameters.initialValue({type:'integer',default:0})).toBe(0);
    const editor=sandbox.window.workbenchParameters.create({escape:String,t:key=>key,validateSchema:validate});
    const tool={name:'schema_fixture',inputSchema:{type:'object',properties:{n:{type:'integer',minimum:0},flag:{type:'boolean'},items:{type:'array',minItems:0},object:{type:'object'}},required:['flag']}};
    const tab={arguments:{n:0,flag:false,items:[],object:{}},arrayDrafts:{items:'invalid'},parameterErrors:{items:'invalid'},error:''};
    expect(editor.issues(tab,tool)).toEqual([]);
    expect(editor.input({dataset:{skipParam:'flag'},checked:true},tab,tool)).toBe(false);
    expect(Object.hasOwn(tab.arguments,'flag')).toBe(true);
    for(const key of ['n','items','object']){editor.input({dataset:{skipParam:key},checked:true},tab,tool);expect(Object.hasOwn(tab.arguments,key)).toBe(false);}
    expect(tab.arrayDrafts.items).toBeUndefined();expect(tab.parameterErrors.items).toBeUndefined();
    for(const key of ['items','object'])editor.input({dataset:{skipParam:key},checked:false},tab,tool);
    expect(tab.arguments.items).toEqual([]);expect(tab.arguments.object).toEqual({});expect(editor.issues(tab,tool)).toEqual([]);
    const enumTool={name:'enum_fixture',inputSchema:{type:'object',properties:{choice:{enum:['',false,null,3,'3']}},required:[]}};
    for(const [index,value] of enumTool.inputSchema.properties.choice.enum.entries()){
      editor.input({dataset:{param:'choice',type:'enum'},value:String(index),selectedOptions:[{dataset:{index:String(index)}}]},tab,enumTool);
      expect(tab.arguments.choice).toBe(value);
    }


  });
  await fresh();
  await check('Fields follow Schema, compact control sizes, two columns and all four controls fit the default pane',async()=>{
    await expect(page.locator('[data-skip-param]')).toHaveCount(3);await expect(page.locator('#skip-query')).toHaveCount(0);
    await expect(page.locator('#param-query')).toHaveAttribute('aria-required','true');
    const query=await page.locator('#param-query').boundingBox(),limit=await page.locator('#param-limit').boundingBox();
    expect(query.height).toBe(36);expect(limit.height).toBe(36);expect(limit.width).toBeLessThanOrEqual(180);expect(limit.x).toBeGreaterThan(query.x+query.width);
    const pane=await page.locator('.request-pane .pane-scroll').boundingBox();
    for(const key of ['query','limit','locale','include_archived']){const box=await page.locator('#param-'+key).boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(pane.y+pane.height);}
    await capture('parameters-refined');
  });
  await check('New drafts omit optional defaults; unskip and focus without edits defer visible validation',async()=>{
    for(const key of ['limit','locale','include_archived']){await expect(page.locator('#skip-'+key)).toBeChecked();await expect(page.locator('#param-'+key)).toBeDisabled();}
    await page.locator('[data-action="open-tool"][data-tool="list_categories"]').click();
    await expect(page.locator('#skip-parent_id')).toBeChecked();
    await page.locator('#skip-parent_id').uncheck();await expect(page.locator('#array-error-parent_id')).toBeEmpty();
    await page.locator('#param-parent_id').focus();await action('input-form').click();
    await expect(page.locator('#array-error-parent_id')).toBeEmpty();await expect(page.locator('#param-parent_id')).toHaveAttribute('aria-invalid','false');
    await expect(page.locator('#parameter-summary')).not.toContainText('待修正');
    await action('execute').click();await expect(page.locator('#array-error-parent_id')).toContainText('至少输入 1');await expect(action('cancel-run')).toHaveCount(0);
    await fresh();
  });
  await check('Skip disables but retains optional fields in Form and omits them from Raw JSON',async()=>{
    for(const name of ['limit','locale','include_archived'])await page.locator(`#skip-${name}`).check();
    for(const name of ['limit','locale','include_archived'])await expect(page.locator(`#param-${name}`)).toBeDisabled();
    expect(await raw()).toEqual({query:'无线键盘'});await action('input-form').click();
    await expect(page.locator('[data-field]')).toHaveCount(4);await expect(page.locator('#skip-limit')).toBeChecked();await capture('parameters-skipped');
  });
  await check('The exact omitted payload is saved and recorded in scoped history',async()=>{
    await action('save-request').click();await expect(page.locator('.record-snapshots')).not.toContainText('include_archived');
    await page.locator('#record-name').fill('省略可选字段');await action('records-submit').click();
    await action('records-load').click();await expect(page.locator('#skip-limit')).toBeChecked();await expect(page.locator('#param-limit')).toBeDisabled();
    await action('execute').click();await expect(page.locator('.result-status')).toContainText('成功');
    await action('tool-history').click();await page.locator('[data-action="select-tool-run"]').first().click();
    const snapshot=page.locator('.snapshot-content').first();await expect(snapshot).toContainText('无线键盘');await expect(snapshot).not.toContainText('limit');await expect(snapshot).not.toContainText('locale');await expect(snapshot).not.toContainText('include_archived');
  });
  await fresh();
  await check('Cleared required strings and number null show local errors and prevent execution',async()=>{
    await page.locator('#param-query').fill('');await expect(page.locator('#param-query')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#array-error-query')).toContainText('至少输入 1');
    await action('execute').click();await expect(action('cancel-run')).toHaveCount(0);await expect(page.locator('#param-query')).toBeFocused();
    await page.locator('#param-query').fill('valid');await page.locator('#skip-limit').uncheck();await page.locator('#param-limit').fill('');await expect(page.locator('#array-error-limit')).toContainText('integer');
    await action('execute').click();await expect(action('cancel-run')).toHaveCount(0);await capture('parameters-errors');
    await page.locator('#skip-limit').check();await expect(page.locator('#array-error-limit')).toBeEmpty();await expect(page.locator('#parameter-summary')).toContainText('校验通过');
    await page.locator('#skip-limit').uncheck();await expect(page.locator('#param-limit')).toHaveValue('10'); // Schema default, not the removed value.
  });
  await check('Numeric constraints and boolean false are validated without treating false as empty',async()=>{
    await page.locator('#param-limit').fill('0');await expect(page.locator('#array-error-limit')).toContainText('不能小于 1');
    await page.locator('#param-limit').fill('1.5');await expect(page.locator('#array-error-limit')).toContainText('integer');
    await page.locator('#param-limit').fill('101');await expect(page.locator('#array-error-limit')).toContainText('不能大于 100');
    await page.locator('#param-limit').fill('10');await page.locator('#skip-include_archived').uncheck();await page.locator('#param-include_archived').uncheck();expect((await raw()).include_archived).toBe(false);await action('input-form').click();
    await expect(page.locator('#parameter-summary')).toContainText('校验通过');
  });
  await check('Optional empty string is validated until skipped; re-enable initializes by schema type',async()=>{
    await page.locator('[data-action="open-tool"][data-tool="list_categories"]').click();
    await page.locator('#skip-parent_id').uncheck();await page.locator('#param-parent_id').fill('x');await page.locator('#param-parent_id').fill('');await expect(page.locator('#array-error-parent_id')).toContainText('至少输入 1');
    await page.locator('#skip-parent_id').check();expect(await raw()).toEqual({});await action('input-form').click();
    await expect(page.locator('#param-parent_id')).toBeDisabled();await page.locator('#skip-parent_id').uncheck();await expect(page.locator('#param-parent_id')).toHaveValue('');await expect(page.locator('#array-error-parent_id')).toBeEmpty();
    await action('execute').click();await expect(action('cancel-run')).toHaveCount(0);await expect(page.locator('#array-error-parent_id')).toContainText('至少输入 1');
  });
  await fresh();
  await check('Raw omissions reappear as skipped fields; enum values respect their schema',async()=>{
    await action('input-json').click();await page.locator('#raw-arguments').fill('{"query":"raw draft","locale":"fr-FR"}');await action('input-form').click();
    await expect(page.locator('#skip-limit')).toBeChecked();await expect(page.locator('#skip-include_archived')).toBeChecked();await expect(page.locator('#skip-locale')).not.toBeChecked();
    await action('execute').click();await expect(page.locator('#array-error-locale')).toContainText('允许的选项');await expect(action('cancel-run')).toHaveCount(0);
    await page.locator('#param-locale').selectOption({label:'en-US'});await expect(page.locator('#parameter-summary')).toContainText('校验通过');
  });
  await check('Skip state and validation remain isolated by tab and project and survive theme and locale changes',async()=>{
    await page.locator('#skip-locale').check();await page.locator('#param-query').fill('isolated draft');
    await action('toggle-theme').click();await page.locator('#language-switch').selectOption('en-US');await expect(page.locator('#skip-locale')).toBeChecked();await expect(page.locator('#param-query')).toHaveValue('isolated draft');await capture('parameters-dark-en');
    await page.locator('[data-action="select-tab"][data-tab="tab-12"]').click();await expect(page.locator('#param-product_id')).toHaveValue('prd_1042');
    await page.locator('[data-action="select-tab"][data-tab="tab-11"]').click();await expect(page.locator('#skip-locale')).toBeChecked();
    await action('projects').click();await page.locator('[data-action="switch-project"][data-project="knowledge"]').click();await expect(page.locator('#skip-limit')).toBeChecked();
    await action('projects').click();await page.locator('[data-action="switch-project"][data-project="commerce"]').click();await expect(page.locator('#skip-locale')).toBeChecked();
  });
  await fresh();await page.locator('#language-switch').selectOption('zh-CN');
  await check('Arrays keep invalid drafts, validate type and item constraints and block mode changes only for parse errors',async()=>{
    await page.locator('[data-action="open-tool"][data-tool="get_store_product_mapping"]').click();await action('expand-request').click();
    const size=await page.locator('#param-product_ids').boundingBox();expect(size.height).toBe(132);await expect(page.locator('#skip-product_ids')).toHaveCount(0);
    await page.locator('#param-product_ids').fill('[invalid');await action('input-json').click();await expect(page.locator('#param-product_ids')).toHaveValue('[invalid');
    await page.locator('#param-product_ids').fill('[]');await expect(page.locator('#array-error-product_ids')).toContainText('至少需要 1');
    await page.locator('#param-product_ids').fill('[""]');await expect(page.locator('#array-error-product_ids')).toContainText('至少输入 1');
    await page.locator('#param-product_ids').fill('[1]');await expect(page.locator('#array-error-product_ids')).toContainText('string');
    await page.locator('#param-product_ids').fill('["prd_9001"]');expect((await raw()).product_ids).toEqual(['prd_9001']);await action('input-form').click();await expect(page.locator('#param-product_ids')).toHaveValue(/prd_9001/);await capture('parameters-array');
  });
  await check('No-input tools show an empty state and disable Raw JSON mode',async()=>{
    await page.locator('[data-action="open-tool"][data-tool="get_account"]').click();await expect(action('input-json')).toBeDisabled();await expect(page.locator('[data-field]')).toHaveCount(0);
    await action('execute').click();await expect(page.locator('.result-status')).toContainText('成功');
  });
  await check('Both themes and locales remain within their scroll containers across desktop and mobile widths',async()=>{
    for(const width of [1440,1024,820,390]){
      await page.setViewportSize({width,height:900});await fresh();await page.locator('#language-switch').selectOption('zh-CN');
      for(const language of ['zh-CN','en-US']){
        await page.locator('#language-switch').selectOption(language);
        for(let theme=0;theme<2;theme++){
          await action('toggle-theme').click();
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
          expect(await page.locator('.parameter-fields').evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
          await expect(page.locator('#param-query')).toBeVisible();
        }
      }
    }
  });
  expect(errors).toEqual([]);expect(requests).toEqual([]);
  await writeFile(`${assets}/parameters-verification.json`,JSON.stringify({date:'2026-10-10',checks,errors,unexpectedRequests:requests,screenshots:['parameters-refined','parameters-skipped','parameters-errors','parameters-dark-en','parameters-array']},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,errors,unexpectedRequests:requests}));
}finally{await browser.close();}
