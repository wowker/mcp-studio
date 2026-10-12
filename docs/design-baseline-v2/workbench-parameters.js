/* SchemaArgumentEditor preview: schema owns fields; the tab owns canonical values. */
(() => {
  'use strict';
  const text = {type:'string',minLength:1};
  const limit = {type:'integer',minimum:1,maximum:100,default:10};
  const schemas = {
    search_products:{properties:{query:{...text},limit:{...limit},locale:{type:'string',enum:['zh-CN','en-US'],default:'zh-CN'},include_archived:{type:'boolean',default:false}},required:['query']},
    search_documents:{properties:{query:{...text},limit:{...limit}},required:['query']},
    get_product:{properties:{product_id:{...text}},required:['product_id']},
    get_inventory:{properties:{product_id:{...text}},required:['product_id']},
    get_order:{properties:{order_id:{...text}},required:['order_id']},
    get_document:{properties:{document_id:{...text}},required:['document_id']},
    list_categories:{properties:{parent_id:{...text}},required:[]},
    list_orders:{properties:{status:{type:'string',enum:['pending','completed']},limit:{...limit}},required:['status']},
    get_account:{properties:{},required:[]},get_permissions:{properties:{},required:[]},
    preview_order:{$defs:{region:{type:'string',enum:['CN','US']}},properties:{fulfillment:{type:'object',oneOf:[{title:'delivery',type:'object',properties:{kind:{const:'delivery'},address:{type:'string',minLength:1}},required:['kind','address']},{title:'pickup',type:'object',properties:{kind:{const:'pickup'},store_id:{type:'string',minLength:1}},required:['kind','store_id']}]},routing:{type:'object',allOf:[{required:['region'],properties:{region:{$ref:'#/$defs/region'}}},{required:['priority'],properties:{priority:{type:'integer',minimum:1,maximum:5}}}]},contact:{type:'object',anyOf:[{required:['email'],properties:{email:{type:'string',minLength:3}}},{required:['phone'],properties:{phone:{type:'string',minLength:3}}}]},customer:{type:'object',properties:{name:{type:'string',minLength:1},region:{type:'string',enum:['CN','US']},note:{type:['string','null'],minLength:1}},required:['name','region']},items:{type:'array',minItems:1,maxItems:5,items:{type:'object',properties:{product_id:{type:'string',minLength:1},quantity:{type:'integer',minimum:1,maximum:999},discount:{type:'number',minimum:0,maximum:100},gift:{type:'boolean'}},required:['product_id','quantity']}},options:{type:'object',properties:{notify:{type:'boolean',default:false},reference:{type:['string','null']}},required:[]}},required:['customer','items']},
    get_store_product_mapping:{properties:{product_ids:{type:'array',items:{type:'string',minLength:1},minItems:1,maxItems:20}},required:['product_ids']},
  };
  const schemaFor = tool => ({type:'object',properties:{},required:[],...(tool.inputSchema || schemas[tool.name] || {})});
  function requiredExample(schema,value) {
    if(schema.type==='object' && value && typeof value==='object' && !Array.isArray(value))return Object.fromEntries((schema.required||[]).filter(key=>Object.hasOwn(value,key)).map(key=>[key,requiredExample(schema.properties[key],value[key])]));
    if(schema.type==='array' && Array.isArray(value))return value.map(item=>requiredExample(schema.items,item));
    return structuredClone(value);
  }
  function initialArguments(tool, examples={}) {
    const schema=schemaFor(tool);
    return Object.fromEntries(schema.required.filter(key=>Object.hasOwn(schema.properties,key)).map(key=>[key,Object.hasOwn(examples,key) ? requiredExample(schema.properties[key],examples[key]) : initialValue(schema.properties[key])]));
  }
  function initialValue(schema) {
    if(Object.hasOwn(schema,'default'))return structuredClone(schema.default);
    const type=Array.isArray(schema.type) ? schema.type.find(type=>type!=='null') : schema.type;
    if(type==='object')return Object.fromEntries((schema.required||[]).map(key=>[key,initialValue(schema.properties[key])]));
    return ({string:'',boolean:false,array:[]})[type] ?? null;
  }
  function create({escape,t,icon,jsonView,validateSchema}) {
    const fields = tool => Object.entries(schemaFor(tool).properties);
    function issues(tab,tool) {const result=validateSchema(schemaFor(tool),tab.arguments);return result.warning?[{path:'',keyword:'unsupported',message:result.warning}]:result.issues;}
    const segments=path=>path.split('/').slice(1).map(key=>key.replace(/~1/g,'/').replace(/~0/g,'~'));
    const pointer=keys=>'/'+keys.map(key=>String(key).replace(/~/g,'~0').replace(/\//g,'~1')).join('/');
    const nodeId=path=>'nested-'+encodeURIComponent(path);
    function pathSchema(tool,path) {function child(schema,key){if(!schema)return undefined;if(schema.type==='array')return schema.items;if(schema.properties?.[key])return schema.properties[key];for(const branch of [...(schema.allOf||[]),...(schema.anyOf||[]),...(schema.oneOf||[])]){const result=child(branch,key);if(result)return result;}}return segments(path).reduce(child,schemaFor(tool));}
    function issueMessage(tool,issue) {
      const schema=pathSchema(tool,issue.path)||{},keyword=issue.keyword;
      if(keyword==='unsupported')return t('baseline.unsupported');
      if(keyword==='required')return t('parameters.requiredError');
      if(keyword==='minLength')return t('parameters.minLengthError',{count:schema.minLength});
      if(keyword==='type')return t('parameters.typeError',{type:Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type});
      if(keyword==='minimum')return t('parameters.minimumError',{value:schema.minimum});
      if(keyword==='maximum')return t('parameters.maximumError',{value:schema.maximum});
      if(keyword==='minItems')return t('parameters.minItemsError',{count:schema.minItems});
      if(keyword==='maxItems')return t('parameters.maxItemsError',{count:schema.maxItems});
      if(keyword==='enum')return t('parameters.enumError');
      return t('parameters.schemaError',{path:issue.path});
    }
    function isVisible(tab,issue) {const top=segments(issue.path)[0];return Boolean((tab.parameterSubmitted||tab.parameterTouched?.[top]) && !(tab.parameterQuietPaths||[]).some(path=>issue.path===path||issue.path.startsWith(path+'/')));}
    function quiet(tab,path) {tab.parameterQuietPaths=[...(tab.parameterQuietPaths||[]).filter(item=>item!==path),path];}
    function quietLeaves(tab,schema,path) {if(schema.type==='object'){for(const [key,child] of Object.entries(schema.properties||{}))quietLeaves(tab,child,path+pointer([key]));}else quiet(tab,path);}
    function edited(tab,path) {tab.parameterQuietPaths=(tab.parameterQuietPaths||[]).filter(item=>!(path===item||path.startsWith(item+'/')||item.startsWith(path+'/')));}
    function fieldIssue(tab,tool,key,visibleOnly=false) {
      if(tab.parameterErrors[key])return tab.parameterErrors[key];
      const issue=issues(tab,tool).find(item=>(!visibleOnly||isVisible(tab,item))&&(item.path===pointer([key]) || item.path.startsWith(pointer([key])+'/')));
      return issue ? issueMessage(tool,issue) : '';
    }
    function pathErrors(tab,tool,key) {
      if(!tab.parameterSubmitted && !tab.parameterTouched?.[key])return '';
      return issues(tab,tool).filter(issue=>isVisible(tab,issue)&&(issue.path===pointer([key]) || issue.path.startsWith(pointer([key])+'/'))).map(issue=>`<li><button type="button" data-action="parameter-focus" data-path="${escape(issue.path)}"><code>${escape(issue.path)}</code><span>${escape(issueMessage(tool,issue))}</span></button></li>`).join('');
    }
    function getValue(tab,path) {return segments(path).reduce((value,key)=>value?.[key],tab.arguments);}
    function setValue(tab,path,value,omit=false,tool) {
      const keys=segments(path),key=keys.pop();if([...keys,key].some(key=>['__proto__','constructor','prototype'].includes(key)))return false;
      let parent=tab.arguments;
      for(let index=0;index<keys.length;index++) {const part=keys[index];if(parent[part]===undefined || parent[part]===null)parent[part]=pathSchema(tool,pointer(keys.slice(0,index+1)))?.type==='array' ? [] : {};if(typeof parent[part]!=='object')return false;parent=parent[part];}
      if(omit)delete parent[key];else parent[key]=value;
      const root=keys[0]||key;delete tab.arrayDrafts[root];delete tab.parameterErrors[root];tab.raw=JSON.stringify(tab.arguments,null,2);return true;
    }
    function nested(tab,tool,schema,value,path,required=true,disabled=false,label=segments(path).at(-1)) {
      const type=Array.isArray(schema.type) ? schema.type.find(type=>type!=='null') : schema.type;
      const complex=['object','array'].includes(type),id=nodeId(path),omitted=value===undefined&&!required,locked=disabled||omitted;
      const top=segments(path)[0],invalid=issues(tab,tool).some(issue=>issue.path===path&&isVisible(tab,issue));
      const attrs=`id="${id}" ${locked ? 'disabled' : ''} aria-label="${escape(path)}" aria-invalid="${Boolean(!locked&&invalid)}" aria-describedby="${id}-error path-errors-${escape(top)}" data-nested="${escape(path)}" aria-required="${required}"`;
      let control='';
      if(type==='object') control=`<fieldset ${locked ? 'disabled' : ''} class="nested-object">${Object.entries(schema.properties||{}).map(([key,child])=>nested(tab,tool,child,value?.[key],path+pointer([key]),(schema.required||[]).includes(key),locked,key)).join('')}</fieldset>`;
      else if(type==='array') control=`<div class="nested-array">${(Array.isArray(value)?value:[]).map((item,index)=>`<details class="nested-array-item" data-parameter-disclosure="${escape(path+pointer([index]))}" ${tab.collapsedParameterPaths?.includes(path+pointer([index])) ? '' : 'open'}><summary>${escape(t('debugger.item',{index:index+1}))}${icon('CaretDown')}${buttonSmall('parameter-remove',t('debugger.remove',{index:index+1}),`data-path="${escape(path)}" data-index="${index}" ${locked ? 'disabled' : ''}`)}</summary>${nested(tab,tool,schema.items,item,path+pointer([index]),true,locked,String(index))}</details>`).join('')}${buttonSmall('parameter-add',t('debugger.add'),`data-path="${escape(path)}" ${locked || (schema.maxItems && value?.length>=schema.maxItems) ? 'disabled' : ''}`)}</div>`;
      else if(schema.enum)control=`<select ${attrs} data-nested-type="enum"><option value="">${escape(t('parameters.select'))}</option>${schema.enum.map((option,index)=>`<option value="${index}" ${Object.is(value,option) ? 'selected' : ''}>${escape(option)}</option>`).join('')}</select>`;
      else if(type==='boolean')control=`<label class="parameter-switch"><input ${attrs} type="checkbox" ${value===true ? 'checked' : ''}><span class="parameter-switch-track" aria-hidden="true"></span><span>${escape(t(value===true ? 'parameters.on' : 'parameters.off'))}</span></label>`;
      else control=`<input ${attrs} type="${['integer','number'].includes(type) ? 'number' : 'text'}" data-nested-type="${type}" value="${escape(value??'')}" ${value===null && Array.isArray(schema.type)&&schema.type.includes('null') ? 'disabled' : ''} ${type==='integer' ? 'step="1"' : ''} ${schema.minimum!==undefined ? `min="${schema.minimum}"` : ''} ${schema.maximum!==undefined ? `max="${schema.maximum}"` : ''} placeholder="${escape(t(required ? 'common.requiredParameterPlaceholder' : 'parameters.optionalPlaceholder'))}">`;
      const nullToggle=Array.isArray(schema.type)&&schema.type.includes('null')&&!omitted ? `<label class="parameter-skip"><input type="checkbox" data-null-path="${escape(path)}" aria-label="${escape(t('debugger.nullToggle',{name:path}))}" ${value===null ? 'checked' : ''} ${locked ? 'disabled' : ''}>${escape(t('debugger.nullValue'))}</label>` : '';
      const skip=required ? '' : `<label class="parameter-skip"><input type="checkbox" data-nested-skip="${escape(path)}" aria-label="${escape(t('parameters.skipLabel',{name:path}))}" ${omitted ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${escape(t('parameters.skip'))}</label>`;
      return `<div class="nested-field ${complex ? 'nested-field--complex' : ''}"><div class="nested-heading"><label for="${id}">${escape(label)}${required ? ' <span class="required">*</span>' : ''}</label><span class="inline">${nullToggle}${skip}</span></div>${!complex ? `<div class="parameter-metadata nested-meta">${constraints(schema)}</div>` : ''}${control}${!complex ? `<span id="${id}-error" class="parameter-error" ${invalid ? 'role="alert"' : ''}>${invalid ? escape(issueMessage(tool,issues(tab,tool).find(issue=>issue.path===path&&isVisible(tab,issue)))) : ''}</span>` : ''}</div>`;
    }
    function buttonSmall(action,label,attrs='') {return `<button type="button" class="btn quiet" data-action="${action}" ${attrs}>${escape(label)}</button>`;}
    function counts(tab,tool) {
      const schema=schemaFor(tool),errors=issues(tab,tool);
      const keys=new Set([...errors.map(item=>item.path.split('/')[1]),...Object.keys(tab.parameterErrors)]);
      const visible=new Set([...errors.filter(issue=>isVisible(tab,issue)).map(issue=>segments(issue.path)[0]),...Object.keys(tab.parameterErrors).filter(key=>tab.parameterSubmitted||tab.parameterTouched?.[key])]);
      return {required:schema.required.length,completed:schema.required.filter(key=>Object.hasOwn(tab.arguments,key)&&!keys.has(key)).length,errors:visible.size,pending:keys.size>visible.size,skipped:fields(tool).filter(([key])=>!schema.required.includes(key)&&!Object.hasOwn(tab.arguments,key)).length};
    }
    function summary(tab,tool) {
      const count=counts(tab,tool);
      return `<span>${escape(t('parameters.requiredCount',{done:count.completed,total:count.required}))}</span><span class="${count.errors ? 'error' : count.pending ? 'muted' : 'success'}">${icon(count.errors ? 'WarningCircle' : count.pending ? 'Info' : 'CheckCircle')}${escape(t(count.errors ? 'parameters.errorCount' : count.pending ? 'parameters.pending' : 'parameters.valid',{count:count.errors}))}</span><span class="push">${escape(t('parameters.skippedCount',{count:count.skipped}))}</span>`;
    }
    function describe(key) {
      return t(key==='query' ? 'common.searchKeywordsInProductNamesOr' : key==='limit' ? 'common.resultsPerPageFrom1To' : key==='locale' ? 'common.responseLanguage' : key==='status' ? 'common.orderStatus' : key==='include_archived' ? 'common.includeArchivedProducts' : key==='product_ids' ? 'common.enter120ProductIdsAs' : 'common.identifierOfTheRequestedRecord');
    }
    function constraints(schema) {
      const parts=[schema.type==='array' ? `array<${schema.items?.type || 'unknown'}>` : Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type];
      if(schema.enum)parts.push(t('parameters.optionCount',{count:schema.enum.length}));
      if(schema.minimum!==undefined || schema.maximum!==undefined)parts.push(`${schema.minimum ?? '−∞'}–${schema.maximum ?? '∞'}`);
      if(schema.minLength)parts.push(t('parameters.minLength',{count:schema.minLength}));
      if(schema.minItems!==undefined)parts.push(t('parameters.itemRange',{min:schema.minItems,max:schema.maxItems ?? '∞'}));
      return parts.map(item=>`<span>${escape(item)}</span>`).join('');
    }
    function render(tab,tool) {
      if(!fields(tool).length)return `<div class="notice">${escape(t('common.noInput'))}</div>`;
      const content=fields(tool).map(([key,schema])=>{
        const required=schemaFor(tool).required.includes(key),skipped=!required&&!Object.hasOwn(tab.arguments,key),value=tab.arguments[key];
        const error=fieldIssue(tab,tool,key,true),visibleError=Boolean(error&&(tab.parameterTouched?.[key]||tab.parameterSubmitted));
        const complex=['array','object'].includes(schema.type),id=`param-${key}`;
        const attrs=`id="${escape(id)}" ${skipped ? 'disabled' : ''} aria-required="${required}" aria-invalid="${!skipped&&visibleError}" aria-describedby="param-description-${escape(key)} param-meta-${escape(key)} array-error-${escape(key)}"`;
        let control;
        if(complex) {
          const advanced=Boolean(schema.oneOf||schema.anyOf||schema.allOf||schema.$ref),mode=advanced?'json':tab.complexModes?.[key]||'structure',canStructure=!advanced&&(value===undefined || (schema.type==='array' ? Array.isArray(value) : value!==null&&typeof value==='object'&&!Array.isArray(value)));
          control=`${schema.oneOf?`<label class="field"><span>${escape(t('baseline.branch'))}</span><select id="branch-${escape(key)}" data-oneof="${escape(key)}" ${skipped?'disabled':''}><option value="">${escape(t('baseline.chooseBranch'))}</option>${schema.oneOf.map((branch,i)=>`<option value="${i}" ${value?.kind===branch.properties.kind.const?'selected':''}>${escape(t('baseline.'+branch.title))}</option>`).join('')}</select></label>`:''}<div class="parameter-complex-tools"><div class="segmented">${buttonSmall('parameter-mode',t('debugger.structure'),`data-key="${escape(key)}" data-mode="structure" aria-pressed="${mode==='structure'}" ${skipped||!canStructure||tab.parameterErrors[key] ? 'disabled' : ''}`)}${buttonSmall('parameter-mode','JSON',`data-key="${escape(key)}" data-mode="json" aria-pressed="${mode==='json'}" ${skipped ? 'disabled' : ''}`)}</div>${buttonSmall('parameter-example',t('debugger.example'),`data-key="${escape(key)}" ${skipped ? 'disabled' : ''}`)}${buttonSmall('parameter-format',t('debugger.format'),`data-key="${escape(key)}" ${skipped||tab.parameterErrors[key] ? 'disabled' : ''}`)}</div>${mode==='structure'&&canStructure ? `<div class="parameter-tree" id="${escape(id)}" tabindex="-1" role="group" aria-labelledby="param-label-${escape(key)}" aria-describedby="param-description-${escape(key)} array-error-${escape(key)}" aria-invalid="${visibleError&&issues(tab,tool).some(issue=>issue.path===pointer([key]))}">${nested(tab,tool,schema,value,pointer([key]),true,skipped,key)}</div>` : `<div class="parameter-json-head"><span id="array-count-${escape(key)}">${escape(skipped ? t('parameters.omitted') : schema.type==='array'&&Array.isArray(value) ? t('common.arrayCount',{count:value.length}) : 'JSON')}</span><span>JSON</span></div><textarea ${attrs} class="array-editor mono" data-array="${escape(key)}" spellcheck="false" placeholder="${schema.type==='array' ? '[]' : '{}'}">${escape(skipped ? '' : tab.arrayDrafts[key] ?? JSON.stringify(value,null,2) ?? '')}</textarea>`}<ul class="parameter-path-errors" id="path-errors-${escape(key)}">${pathErrors(tab,tool,key)}</ul>`;
        }
        else if(schema.enum)control=`<select ${attrs} data-param="${escape(key)}" data-type="enum"><option value="" ${!schema.enum.includes(value) ? 'selected' : ''}>${escape(t('parameters.select'))}</option>${schema.enum.map((option,index)=>`<option value="${index}" ${Object.is(value,option) ? 'selected' : ''} data-index="${index}">${escape(option)}</option>`).join('')}</select>`;
        else if(schema.type==='boolean')control=`<label class="parameter-switch"><input ${attrs} type="checkbox" data-param="${escape(key)}" ${value===true ? 'checked' : ''}><span class="parameter-switch-track" aria-hidden="true"></span><span data-boolean-state="${escape(key)}">${escape(t(value===true ? 'parameters.on' : 'parameters.off'))}</span></label>`;
        else control=`<input ${attrs} data-param="${escape(key)}" data-type="${['number','integer'].includes(schema.type) ? 'number' : 'string'}" type="${['number','integer'].includes(schema.type) ? 'number' : 'text'}" value="${escape(value)}" ${schema.type==='integer' ? 'step="1"' : ''} ${schema.minimum!==undefined ? `min="${schema.minimum}"` : ''} ${schema.maximum!==undefined ? `max="${schema.maximum}"` : ''} placeholder="${escape(t(required ? 'common.requiredParameterPlaceholder' : 'parameters.optionalPlaceholder'))}">`;
        return `<div class="parameter-field ${complex ? 'parameter-field--json' : ''}" data-field="${escape(key)}" data-skipped="${skipped}"><div class="parameter-field-heading"><label id="param-label-${escape(key)}" for="${escape(id)}">${escape(key)} ${required ? '<span class="required">*</span>' : ''}</label>${required ? `<span class="parameter-required">${escape(t('common.required'))}</span>` : `<label class="parameter-skip" title="${escape(t('parameters.skipHint'))}"><input id="skip-${escape(key)}" type="checkbox" data-skip-param="${escape(key)}" ${skipped ? 'checked' : ''} aria-label="${escape(t('parameters.skipLabel',{name:key}))}">${escape(t('parameters.skip'))}</label>`}</div><div class="parameter-field-detail"><p id="param-description-${escape(key)}" class="parameter-description">${escape(tool.name==='preview_order' ? t('debugger.description.'+key) : describe(key))}</p><div id="param-meta-${escape(key)}" class="parameter-metadata">${constraints(schema)}</div></div><div class="parameter-control parameter-control--${schema.enum ? 'enum' : schema.type}">${control}</div><span id="array-error-${escape(key)}" class="parameter-error error small" ${visibleError ? 'role="alert"' : ''}>${escape(visibleError ? error : '')}</span></div>`;
      }).join('');
      return `${issues(tab,tool).some(issue=>issue.keyword==='unsupported')?`<div class="notice" role="alert">${escape(t('baseline.unsupported'))}</div>`:''}<div class="parameter-summary" id="parameter-summary" aria-live="polite">${summary(tab,tool)}</div><div class="parameter-fields">${content}</div><p class="parameter-omission-hint">${icon('Info')}${escape(t('parameters.skipHint'))}</p><details class="parameter-schema"><summary>${escape(t('tools.inputSchema'))}</summary>${jsonView(schemaFor(tool))}</details>`;
    }
    function refresh(tab,tool) {
      const summaryNode=document.getElementById('parameter-summary');if(summaryNode)summaryNode.innerHTML=summary(tab,tool);
      for(const [key,schema] of fields(tool)){
        const pathNode=document.getElementById(`path-errors-${key}`);if(pathNode)pathNode.innerHTML=pathErrors(tab,tool,key);
        const node=document.getElementById(`param-${key}`);if(!node)continue;
        const error=fieldIssue(tab,tool,key,true),show=Boolean(error&&(tab.parameterTouched?.[key]||tab.parameterSubmitted));
        node.setAttribute('aria-invalid',String(!node.disabled&&show));
        const message=document.getElementById(`array-error-${key}`);message.textContent=show ? error : '';
        if(show)message.setAttribute('role','alert');else message.removeAttribute('role');
        const count=document.getElementById(`array-count-${key}`);
        if(count)count.textContent=tab.parameterErrors[key] ? t('common.jsonArrayFixTheFormat') : Array.isArray(tab.arguments[key]) ? t('common.arrayCount',{count:tab.arguments[key].length}) : 'JSON';
        const bool=document.querySelector(`[data-boolean-state="${key}"]`);if(bool)bool.textContent=t(tab.arguments[key]===true ? 'parameters.on' : 'parameters.off');
      }
    }
    function input(target,tab,tool) {
      if(target.dataset.nested || target.dataset.nestedSkip || target.dataset.nullPath) {
        const path=target.dataset.nested||target.dataset.nestedSkip||target.dataset.nullPath,schema=pathSchema(tool,path);if(!schema||target.disabled)return false;
        const root=segments(path)[0];tab.parameterTouched??={};tab.error='';
        const isSkip=Boolean(target.dataset.nestedSkip);
        const value=isSkip||target.dataset.nullPath ? target.checked ? null : initialValue(schema) : schema.enum ? target.value==='' ? undefined : schema.enum[Number(target.value)] : target.type==='checkbox' ? target.checked : ['integer','number'].includes(target.dataset.nestedType) ? target.value==='' ? null : Number(target.value) : target.value;
        if(!setValue(tab,path,value,isSkip&&target.checked || value===undefined,tool))return false;
        if(isSkip)quiet(tab,path);else {edited(tab,path);tab.parameterTouched[root]=true;}
        return 'render';
      }
      const key=target.dataset.param || target.dataset.array || target.dataset.skipParam;
      if(!key)return false;
      const schema=schemaFor(tool).properties[key];if(!schema||target.disabled)return false;
      tab.parameterTouched ??={};tab.parameterTouched[key]=true;tab.error='';
      if(target.dataset.skipParam){
        if(schemaFor(tool).required.includes(key))return false;
        if(target.checked)delete tab.arguments[key];else tab.arguments[key]=initialValue(schema);
        delete tab.arrayDrafts[key];delete tab.parameterErrors[key];delete tab.parameterTouched[key];quiet(tab,pointer([key]));
      } else if(target.dataset.array){
        edited(tab,pointer([key]));
        tab.arrayDrafts[key]=target.value;
        try{tab.arguments[key]=JSON.parse(target.value);delete tab.parameterErrors[key];}
        catch{tab.parameterErrors[key]=t('parameters.jsonSyntaxError');}
      } else if(target.dataset.type==='enum'){
        edited(tab,pointer([key]));
        if(target.value==='')delete tab.arguments[key];else tab.arguments[key]=schema.enum[Number(target.selectedOptions[0].dataset.index)];
      } else {edited(tab,pointer([key]));tab.arguments[key]=target.type==='checkbox' ? target.checked : target.dataset.type==='number' ? target.value==='' ? null : Number(target.value) : target.value;}
      tab.raw=JSON.stringify(tab.arguments,null,2);
      return target.dataset.skipParam || target.dataset.type==='enum'&&target.value==='' ? 'render' : 'refresh';
    }
    function action(action,element,tab,tool) {
      if(!action.startsWith('parameter-'))return false;
      const key=element.dataset.key,path=element.dataset.path;
      tab.complexModes??={};
      if(action==='parameter-focus') {
        const node=document.getElementById(nodeId(path))||document.getElementById('param-'+segments(path)[0])||document.getElementById('raw-arguments');
        if(node) {for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;node.focus();}
        return 'focus';
      }
      if(action==='parameter-mode') {if(!tab.parameterErrors[key])tab.complexModes[key]=element.dataset.mode;return 'view';}
      if(action==='parameter-format') {tab.arrayDrafts[key]=JSON.stringify(tab.arguments[key],null,2);return 'view';}
      if(action==='parameter-example') {edited(tab,pointer([key]));if(!Object.hasOwn(tool.args,key))return 'view';tab.arguments[key]=structuredClone(tool.args[key]);delete tab.parameterErrors[key];delete tab.arrayDrafts[key];}
      if(action==='parameter-add' || action==='parameter-remove') {
        let value=getValue(tab,path);const schema=pathSchema(tool,path);if(schema?.type!=='array')return 'view';if(value===undefined&&action==='parameter-add'){setValue(tab,path,[],false,tool);value=getValue(tab,path);}if(!Array.isArray(value))return 'view';
        if(action==='parameter-add' && (!schema.maxItems||value.length<schema.maxItems)) {edited(tab,path);value.push(initialValue(schema.items));quietLeaves(tab,schema.items,path+pointer([value.length-1]));}
        if(action==='parameter-remove'){value.splice(Number(element.dataset.index),1);tab.collapsedParameterPaths=(tab.collapsedParameterPaths||[]).filter(item=>!item.startsWith(path+'/'));}
        const root=segments(path)[0];if(action==='parameter-remove')edited(tab,path);delete tab.arrayDrafts[root];delete tab.parameterErrors[root];tab.parameterTouched[root]=true;
      }
      tab.raw=JSON.stringify(tab.arguments,null,2);return 'changed';
    }
    function validation(tab,tool) {return issues(tab,tool).map(issue=>`<li><button type="button" data-action="parameter-focus" data-path="${escape(issue.path)}"><code>${escape(issue.path)}</code><span>${escape(issueMessage(tool,issue))}</span></button></li>`).join('');}
    return {render,input,refresh,issues,counts,action,validation};
  }
  window.workbenchParameters={create,schemaFor,initialValue,initialArguments};
})();
