/* Three structurally different Tools concepts, switchable via ?variant=A|B|C.
 * Design-only; all execution is simulated, no network, storage, auth or secret handling. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = name => window.previewIcons[name] || '';
  const button = (action, label, symbol, className = '', extra = '') => `<button type="button" class="btn ${className}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label}</button>`;
  const tools = [
    {id:'search_products',name:'查找商品',description:'按关键词搜索商品，返回价格、库存和商品详情。',group:'商品',icon:'MagnifyingGlass',required:1,fields:4,args:{query:'无线键盘',limit:10,locale:'zh-CN',include_archived:false}},
    {id:'get_product',name:'获取商品详情',description:'通过商品 ID 查看规格、价格和当前库存。',group:'商品',icon:'Stack',required:1,fields:1,args:{product_id:'prod_1042'}},
    {id:'list_orders',name:'查询订单',description:'查看指定客户的订单与履约状态。',group:'订单',icon:'FileCode',required:1,fields:2,args:{customer_id:'cus_0801',limit:10}},
    {id:'get_inventory',name:'查看库存',description:'获取商品在各仓库的可用数量。',group:'库存',icon:'HardDrives',required:1,fields:1,args:{product_id:'prod_1042'}}
  ];
  const variants = {A:'调试 Studio',B:'工具目录',C:'请求笔记本'};
  const initialVariant = new URL(location.href).searchParams.get('variant');
  const state = {variant:variants[initialVariant] ? initialVariant : 'A',tool:'search_products',mode:initialVariant==='C'?'json':'form',view:'content',filter:'全部',query:'',args:structuredClone(tools[0].args),raw:JSON.stringify(tools[0].args,null,2),error:'',run:null,running:false,timer:null,history:[],sequence:4,failure:false,draftVersion:1,modal:''};
  const seedArgs = structuredClone(state.args);
  state.run = {id:'run_004',tool:state.tool,args:seedArgs,status:'success',duration:248,version:1,example:true,serverId:'commerce-shared',environmentId:'development',credentialBindingId:'project-service-token'};
  state.history = [state.run,{...structuredClone(state.run),id:'run_003',duration:231},{...structuredClone(state.run),id:'run_002',duration:286}];
  const activeTool = () => tools.find(tool => tool.id === state.tool);
  const badge = (label,type='') => `<span class="badge ${type}">${esc(label)}</span>`;
  const statusLabel = run => ({success:'调用完成',failed:'Tool 返回错误',cancelled:'已取消',running:'正在调用'})[run?.status] || '等待执行';
  const toast = message => { $('#toast').textContent=message;$('#toast').hidden=false;setTimeout(()=>{$('#toast').hidden=true;},2400); };
  function sidebar(compact=false) {
    const items=[['tools','Tools 调试','Wrench'],['server','Server 配置','Plugs'],['environment','环境变量','BracketsCurly'],['history','调用历史','ClockCounterClockwise']];
    if(compact) return `<aside class="sidebar"><div class="brand"><span class="brandmark">${icon('Plug')}</span></div><nav class="icon-navigation" aria-label="主要功能">${items.map(([action,label,symbol])=>`<button type="button" data-action="${action}" class="${action==='tools'?'active':''}" aria-label="${label}" title="${label}">${icon(symbol)}</button>`).join('')}</nav><div class="side-footer"><button class="btn quiet icon-only" data-action="members" aria-label="团队成员">${icon('Users')}</button><span class="avatar" style="margin-top:16px">WW</span></div></aside>`;
    return `<aside class="sidebar"><div class="brand"><span class="brandmark">${icon('Plug')}</span><span>Inspector<span style="color:var(--ui-text-subtle);font-weight:400">.</span></span></div><button class="project-box" data-action="project"><span class="project-icon">${icon('FolderSimple')}</span><div><strong>Commerce</strong><span>Acme 团队</span></div><span class="spacer"></span>${icon('CaretDown')}</button><div class="side-label">工作空间</div><nav aria-label="主要功能">${items.map(([action,label,symbol])=>`<button class="nav-item ${action==='tools'?'active':''}" data-action="${action}">${icon(symbol)}<span>${label}</span>${action==='history'?`<span class="nav-count">${state.history.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-divider"></div><div class="side-label">已连接的 Server</div><button class="server-shortcut" data-action="server"><span class="dot"></span>Commerce API<span class="spacer"></span>${icon('ArrowUpRight')}</button><div class="side-footer"><button class="nav-item" data-action="members">${icon('Users')}<span>团队成员</span></button><div class="sidebar-divider" style="margin:12px 0"></div><div class="flex"><span class="avatar">WW</span><div class="user-info"><strong style="font-size:12px;font-weight:500">Wu Wei</strong><div class="tiny muted" style="margin-top:4px">项目维护者</div></div></div></div></aside>`;
  }
  function topbar() {
    return `<header class="topbar"><div class="breadcrumbs"><span>Commerce</span><span>/</span><strong>Tools</strong></div><span class="spacer"></span><button class="context-pill" data-action="server"><span class="dot"></span>Commerce API ${icon('CaretDown')}</button><button class="context-pill" data-action="environment">Development ${icon('CaretDown')}</button><span class="demo-caption">团队执行节点</span>${button('history','','ClockCounterClockwise','quiet icon-only','aria-label="打开调用历史"')}</header>`;
  }
  function executionButton() { return state.running ? button('cancel','取消调用','Stop','') : button('execute','运行 Tool','Play','primary'); }
  function inputSegment() { return `<div class="segmented" aria-label="参数编辑方式"><button data-action="mode" data-mode="form" class="${state.mode==='form'?'active':''}" aria-pressed="${state.mode==='form'}">表单</button><button data-action="mode" data-mode="json" class="${state.mode==='json'?'active':''}" aria-pressed="${state.mode==='json'}">JSON</button></div>`; }
  function field(name,label,description,type='text',required=true) {
    return `<label class="field" for="field-${name}"><span class="field-title">${esc(label)}${required?'<span class="required">*</span>':''}<code>${esc(name)}</code></span><input id="field-${name}" data-field="${esc(name)}" type="${type}" value="${esc(state.args[name] ?? '')}" ${type==='number'?'min="1" max="100"':''} ${required?'required':''}><span class="field-help">${esc(description)}</span></label>`;
  }
  function form() {
    let fields='';
    if(state.tool==='search_products') fields=`${field('query','搜索关键词','使用商品名称、品牌或型号进行搜索。')}<div class="field-row">${field('limit','结果数量','每次最多 100 条。','number',false)}<label class="field" for="field-locale"><span class="field-title">语言<code>locale</code></span><select id="field-locale" data-field="locale"><option value="zh-CN" ${state.args.locale==='zh-CN'?'selected':''}>简体中文</option><option value="en-US" ${state.args.locale==='en-US'?'selected':''}>English</option></select><span class="field-help">商品信息的显示语言。</span></label></div><label class="toggle-field" for="field-include_archived"><span><span style="font-size:12px">包含已归档商品</span><span class="field-help">通常只查询正在销售的商品。</span></span><input id="field-include_archived" type="checkbox" data-field="include_archived" ${state.args.include_archived?'checked':''}></label><details class="advanced"><summary>参数说明 · 4 个字段</summary><p>必填字段：query。示例 Schema 只演示基础类型；正式版本支持对象、数组、联合类型和字段级错误。</p><code>additionalProperties: false</code></details>`;
    else if(state.tool==='list_orders') fields=`${field('customer_id','客户 ID','输入需要查询的客户标识。')}${field('limit','结果数量','每次最多 100 条。','number',false)}`;
    else fields=field('product_id','商品 ID','例如 prod_1042。');
    return `<form class="parameter-form" aria-label="请求参数表单" onsubmit="return false">${fields}</form>`;
  }
  function editor() {
    const lines=Math.max(6,state.raw.split('\n').length);
    return `<div class="json-editor"><div class="line-numbers" aria-hidden="true">${Array.from({length:lines},(_,i)=>i+1).join('<br>')}</div><textarea id="raw-arguments" aria-label="JSON 请求参数" spellcheck="false">${esc(state.raw)}</textarea></div>`;
  }
  function params(forceJson=false) { return `${state.error?`<div class="error-box" role="alert">${esc(state.error)}</div>`:''}${forceJson || state.mode==='json' ? editor() : form()}`; }
  function output(run=state.run) {
    if(!run) return null;
    if(run.status==='failed') return {isError:true,content:[{type:'text',text:'示例错误：商品服务暂时不可用。'}]};
    if(run.tool==='search_products') return {products:[{id:'prod_1042',name:`${run.args.query} K2`,price:499,currency:'CNY',stock:128},{id:'prod_1086',name:`${run.args.query} Air`,price:329,currency:'CNY',stock:64}],total:2,locale:run.args.locale||'zh-CN'};
    if(run.tool==='get_product') return {id:run.args.product_id,name:'无线键盘 K2',price:499,currency:'CNY',stock:128,specifications:{connection:'Bluetooth / USB-C',layout:'75%'}};
    if(run.tool==='get_inventory') return {product_id:run.args.product_id,warehouses:[{name:'上海仓',available:92},{name:'杭州仓',available:36}]};
    return {customer_id:run.args.customer_id,orders:[{id:'ord_2091',status:'shipped',total:499},{id:'ord_2087',status:'delivered',total:329}]};
  }
  function code(value) {
    return `<pre class="code-block">${esc(JSON.stringify(value,null,2)).replace(/(&quot;[^\n]*?&quot;)(\s*:)/g,'<span class="json-key">$1</span>$2').replace(/(:\s*)(&quot;[^\n]*?&quot;)/g,'$1<span class="json-value">$2</span>').replace(/\b(true|false|null)\b/g,'<span class="json-bool">$1</span>')}</pre>`;
  }
  function resultStatus() {
    const run=state.run;
    const failed=run?.status==='failed';
    return `<div class="result-status"><span class="status-symbol" ${failed?'style="background:var(--ui-danger-muted);color:var(--ui-danger)"':''}>${icon(failed?'WarningCircle':run?.status==='running'?'ArrowClockwise':run?.status==='cancelled'?'StopCircle':'CheckCircle')}</span><div><strong>${statusLabel(run)}</strong><span class="meta">${run?.example?'初始示例结果 · 尚未执行':run?`模拟调用 · ${esc(run.id)}`:'编辑参数后运行 Tool'}</span></div><span class="spacer"></span>${run?.status==='success'?`<div class="metric"><b>${run.duration}<span style="margin-left:4px">ms</span></b><span>耗时</span></div><div class="metric"><b>${esc(run.tool==='search_products'?'2 条':'1 项')}</b><span>返回内容</span></div>`:''}</div>`;
  }
  function resultTabs() { return `<div class="result-tabs" aria-label="结果视图">${[['content','内容'],['json','原始 JSON'],['trace','调用过程']].map(([view,label])=>`<button data-action="view" data-view="${view}" class="${state.view===view?'active':''}" aria-pressed="${state.view===view}">${label}</button>`).join('')}<span class="spacer"></span>${button('copy','','Copy','quiet icon-only','aria-label="复制结果"')}</div>`; }
  function resultBody() {
    const run=state.run;
    if(!run) return '<div class="empty">运行后，结果会显示在这里。</div>';
    if(run.status==='running') return '<div class="empty" role="status">Go 执行器正在调用 Tool…<br><br><span class="tiny">本页使用本地模拟，不连接真实 Server。</span></div>';
    if(run.status==='cancelled') return '<div class="empty">本次模拟调用已取消。参数草稿仍然保留。</div>';
    if(state.view==='trace') return `<div class="result-body"><dl class="facts"><dt>调用标识</dt><dd class="mono">${esc(run.id)}</dd><dt>Server 连接</dt><dd>Commerce API <span class="muted mono">commerce-shared</span></dd><dt>环境快照</dt><dd>Development · revision 12</dd><dt>凭据归属</dt><dd>项目服务凭据 · 已脱敏</dd><dt>执行位置</dt><dd>团队服务节点 / Go MCP 执行器</dd><dt>返回类型</dt><dd>${run.status==='failed'?'MCP isError: true':'structuredContent + text'}</dd></dl>${[['身份与权限','已校验项目访问和连接使用权限'],['解析执行上下文','固定连接、环境版本、参数快照'],['调用 tools/call',`${run.duration} ms · ${run.status==='failed'?'返回 Tool 错误':'成功返回'}`],['记录调用历史','只记录脱敏后的请求、响应和元数据']].map(([title,desc],i)=>`<div class="trace-row"><span class="trace-num">${i+1}</span><div>${title}<small>${desc}（流程示意）</small></div></div>`).join('')}</div>`;
    if(run.status==='failed') return `<div class="error-box" role="alert">${icon('WarningCircle')} Tool 返回错误：商品服务暂时不可用。<br><span class="tiny">传输已完成；这是示例 MCP isError，并非参数校验错误。未自动重试。</span></div><div class="result-body">${code(output())}</div>`;
    if(state.view==='json') return `<div class="result-body">${code({isError:false,structuredContent:output(),content:[{type:'text',text:JSON.stringify(output())}]})}</div>`;
    if(run.tool!=='search_products') return `<div class="result-body"><div class="result-label">${icon('BracketsCurly')} structuredContent${badge('只读预览')}</div>${code(output())}</div>`;
    const products=output(run).products;
    return `<div class="result-body"><div class="result-label"><span class="mono">products</span><span class="muted">/ ${products.length} items</span>${badge('表格预览','neutral')}</div><table class="product-table"><thead><tr><th>商品</th><th>价格</th><th>库存</th></tr></thead><tbody>${products.map((product,i)=>`<tr><td><div class="product-name"><span class="product-icon ${i?'alt':''}">${icon('Columns')}</span><div><strong>${esc(product.name)}</strong><span>${esc(product.id)}</span></div></div></td><td class="mono">¥ ${product.price}</td><td>${badge(`${product.stock} 件`,'success')}</td></tr>`).join('')}</tbody></table><div class="result-summary"><span>示例数据 · locale: ${esc(run.args.locale||'zh-CN')}</span><span>共 2 条</span></div><div class="content-note">${icon('Info')}<span>根据结构化结果生成表格。文本、图片与资源内容使用各自的查看器；原始响应始终可查看。</span></div></div>`;
  }
  function staleBanner() { return state.run && state.run.status!=='running' && state.run.version!==state.draftVersion ? '<div class="stale" role="status">参数已修改 · 下方仍为上次调用结果，运行后更新。</div>' : ''; }
  function resultContent() { return `${resultStatus()}${staleBanner()}${resultTabs()}${resultBody()}`; }
  function recent() { return `<div class="recent-strip"><span class="flex muted">${icon('ClockCounterClockwise')}最近调用</span>${state.history.slice(0,3).map(run=>`<button data-action="history" title="查看 ${esc(run.id)}"><span class="dot" ${run.status!=='success'?'style="color:var(--ui-warning)"':''}></span>${esc(run.id)}<span class="muted">${run.duration} ms</span></button>`).join('')}<span class="spacer"></span><span class="demo-caption">示例数据 · 调用仅为模拟</span>${button('history','全部历史','ArrowUpRight','quiet')}</div>`; }
  function studio() {
    const tool=activeTool();
    return `<div class="app variant-a">${sidebar()}<div class="workspace">${topbar()}<main id="main" class="main"><div class="studio-heading"><div><div class="eyebrow">Tool playground</div><button class="tool-trigger" data-action="library" aria-label="选择调试工具"><h1>${esc(tool.name)}</h1>${icon('CaretDown')}</button><p>${esc(tool.description)}</p><div class="tool-metadata"><code>${esc(tool.id)}</code>${badge('只读 · Server 声明','success')}<span class="tiny muted">${tool.fields} 个参数</span></div></div><div class="actions">${button('schema','工具定义','Code','quiet')}${executionButton()}</div></div><div class="draft-strip"><span class="draft-label">${icon('FileCode')}请求草稿<span class="dot" style="width:4px;height:4px"></span></span>${button('reset','','ArrowClockwise','quiet icon-only','aria-label="重置参数"')}<span class="draft-private">${icon('LockKey')}个人草稿 · 结果在项目内共享</span></div><div class="studio-split"><section class="panel" aria-label="请求参数"><header class="panel-head"><span class="step">1</span><span class="panel-title">请求参数</span><span class="spacer"></span>${inputSegment()}</header><div class="panel-scroll">${params()}</div><footer class="parameter-foot">${icon('ShieldCheck')}<span>项目凭据 · Development 环境</span><span class="spacer"></span>${button('context','','Info','quiet icon-only','aria-label="查看执行上下文"')}</footer></section><section class="panel" aria-label="调用结果"><header class="panel-head"><span class="step">2</span><span class="panel-title">调用结果</span><span class="spacer"></span>${badge('只读')}</header><div class="panel-scroll">${resultContent()}</div><footer class="result-foot"><span class="mono">${esc(state.run?.id||'awaiting-run')}</span><span>执行快照与参数草稿独立</span></footer></section></div>${recent()}</main></div></div>`;
  }
  function toolCard(tool) { return `<button class="tool-card ${state.tool===tool.id?'selected':''}" data-action="select-tool" data-tool="${tool.id}"><div class="flex"><span class="tool-icon">${icon(tool.icon)}</span><div><strong>${esc(tool.name)}</strong><code>${tool.id}</code></div><span class="spacer"></span>${icon('ArrowUpRight')}</div><p>${esc(tool.description)}</p><div class="card-foot"><span>${tool.group}</span><span>${tool.fields} 个参数 · ${tool.required} 个必填</span><span class="spacer"></span><span style="color:var(--ui-success)">只读声明</span></div></button>`; }
  function filteredTools() { return tools.filter(tool=>(state.filter==='全部'||tool.group===state.filter) && `${tool.id} ${tool.name} ${tool.description} ${Object.keys(tool.args).join(' ')}`.toLowerCase().includes(state.query.toLowerCase())); }
  function catalog() {
    const tool=activeTool();
    return `<div class="app variant-b">${sidebar()}<div class="workspace">${topbar()}<main id="main" class="catalog-layout"><section class="catalog-main" aria-label="工具目录"><div class="eyebrow">Discover & debug</div><h1>找到工具，开始调试。</h1><p class="intro">Commerce API 的 ${tools.length} 个可用工具。<br>先理解能力，再带着参数调用。</p><label class="searchbox">${icon('MagnifyingGlass')}<input id="catalog-search" aria-label="搜索工具" placeholder="搜索名称、描述或参数…" value="${esc(state.query)}"><span class="tiny mono">/</span></label><div class="filters" aria-label="工具分类">${['全部','商品','订单','库存'].map(group=>`<button data-action="filter" data-filter="${group}" class="${state.filter===group?'active':''}">${group}</button>`).join('')}</div><div class="tool-list" id="catalog-list">${filteredTools().map(toolCard).join('')||'<div class="empty">没有匹配的工具。</div>'}</div><div class="flex muted tiny" style="margin-top:16px">${icon('Info')}只读等提示来自 Server，不替代权限校验。</div></section><section class="catalog-detail" aria-label="选中工具的调试面板"><header class="catalog-detail-head"><div class="flex"><span class="eyebrow">Selected tool</span><span class="spacer"></span>${button('schema','','Code','quiet icon-only','aria-label="工具定义"')}</div><h2>${esc(tool.name)}</h2><div class="flex"><code>${tool.id}</code><span class="spacer"></span>${badge('只读','success')}</div></header><div class="catalog-detail-scroll"><div class="panel-head" style="border:0"><span class="panel-title">请求参数</span><span class="spacer"></span>${inputSegment()}</div>${params()}${resultContent()}</div><footer class="execution-footer"><span class="tiny muted flex">${icon('LockKey')}个人请求草稿</span><span class="spacer"></span>${executionButton()}</footer></section></main></div></div>`;
  }
  function inspector() { return `<aside class="session-inspector" aria-label="会话检查器"><h2>执行上下文</h2><div class="inspector-fact"><span>项目</span><strong class="flex">${icon('FolderSimple')}Commerce</strong></div><div class="inspector-fact"><span>Server 连接</span><strong class="flex"><span class="dot" style="color:var(--ui-success)"></span>Commerce API</strong><div class="tiny muted mono" style="margin-top:6px">commerce-shared</div></div><div class="inspector-fact"><span>环境</span><strong>Development</strong><div class="tiny muted" style="margin-top:6px">配置版本 12 · 4 个生效变量</div></div><div class="inspector-fact"><span>认证归属</span><strong class="flex">${icon('ShieldCheck')}项目服务凭据</strong></div><div class="inspector-divider"></div><h3>最近调用</h3>${state.history.slice(0,3).map(run=>`<button class="run-mini" data-action="history"><span class="dot"></span><span><strong>${esc(run.id)} · ${run.status==='success'?'完成':run.status==='failed'?'错误':'取消'}</strong><small>${esc(run.tool)}<br>${run.duration} ms · Wu Wei</small></span></button>`).join('')}${button('history','查看全部','ArrowUpRight','quiet')}<div class="inspector-divider"></div><h3>本页演示状态</h3><label class="flex tiny muted"><input id="simulate-error" type="checkbox" ${state.failure?'checked':''}>下次返回 Tool 错误</label><p class="tiny muted" style="line-height:1.8;margin-top:16px">示例调用由浏览器模拟。正式版统一经 Go 后端执行并记录历史。</p></aside>`; }
  function notebook() {
    const tool=activeTool();
    return `<div class="app variant-c">${sidebar(true)}<div class="workspace">${topbar()}<main id="main" class="notebook-layout"><div class="notebook-scroll"><div class="notebook-content"><header class="notebook-header"><div><div class="eyebrow">Request notebook / 01</div><h1>${esc(tool.name)}</h1><p>${esc(tool.description)}</p><div class="tool-metadata"><code>${tool.id}</code>${badge('只读','success')}</div></div><span class="spacer"></span>${button('library','<span class="button-label">切换工具</span>','CaretDown','')}</header><section class="notebook-section" aria-label="请求参数"><div class="notebook-section-title"><span class="step">1</span><h2>请求</h2><span class="spacer"></span><span class="tiny muted">${state.mode==='json'?'JSON 编辑':'Schema 表单'}</span>${inputSegment()}</div><div class="panel"><header class="panel-head"><span class="mono">tools/call</span><span class="muted tiny">${esc(tool.id)}</span><span class="spacer"></span>${button('schema','','Code','quiet icon-only','aria-label="工具定义"')}</header>${params()}<footer class="parameter-foot">${icon('CheckCircle')}<span>运行前验证输入；原始参数保留在个人草稿。</span></footer></div></section><section class="notebook-section" aria-label="调用结果"><div class="notebook-section-title"><span class="step">2</span><h2>响应</h2><span class="spacer"></span><span class="tiny muted">与这次请求配对</span></div><div class="panel">${resultContent()}</div></section><div class="notebook-actions"><span class="tiny muted flex">${icon('LockKey')}个人草稿 · ${state.running?'执行中':state.run?.id||'未执行'}</span><div class="actions">${button('reset','','ArrowClockwise','quiet icon-only','aria-label="重置参数"')}${executionButton()}</div></div></div></div>${inspector()}</main></div></div>`;
  }
  function render() {
    $('#app').innerHTML=({A:studio,B:catalog,C:notebook})[state.variant]();
    document.documentElement.dataset.variant=state.variant;
    $('#switcher').innerHTML=`<span class="compare-label">${icon('Columns')}设计方向比较</span>${Object.entries(variants).map(([key,name])=>`<button class="variant-button" data-action="variant" data-variant="${key}" aria-pressed="${key===state.variant}"><b>${key}</b>${name}${key==='A'?'<span class="tiny">推荐</span>':''}</button>`).join('')}<span class="compare-note">← → 切换 · 本地模拟</span>`;
  }
  function setVariant(variant) { state.variant=variant;const url=new URL(location.href);url.searchParams.set('variant',variant);history.replaceState(null,'',url);closeModal();render(); }
  function invalidate() { state.draftVersion+=1;state.error='';if(!state.running && state.run) { const target=$('.stale');if(target) return;const resultStatusElement=$('.result-status');if(resultStatusElement) resultStatusElement.insertAdjacentHTML('afterend',staleBanner()); } }
  function validate() {
    try { const parsed=JSON.parse(state.raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('参数必须是 JSON 对象。');const key=state.tool==='search_products'?'query':state.tool==='list_orders'?'customer_id':'product_id';if(typeof parsed[key]!=='string'||!parsed[key].trim()) throw new Error(`${key}：请填写有效的字符串。`);if('limit' in parsed && (!Number.isInteger(parsed.limit)||parsed.limit<1||parsed.limit>100)) throw new Error('limit：请输入 1–100 之间的整数。');if('include_archived' in parsed && typeof parsed.include_archived!=='boolean') throw new Error('include_archived：必须是布尔值。');if('locale' in parsed && !['zh-CN','en-US'].includes(parsed.locale)) throw new Error('locale：请选择 zh-CN 或 en-US。');const allowed=Object.keys(activeTool().args);const unexpected=Object.keys(parsed).filter(key=>!allowed.includes(key));if(unexpected.length) throw new Error(`未知字段：${unexpected.join(', ')}。`);state.args=parsed;return true; } catch(error) { state.error=error instanceof SyntaxError?'JSON 格式无效，请修复后再运行。':error.message;return false; }
  }
  function selectTool(id) { if(state.running) { toast('请先等待或取消当前调用。');return; }if(state.tool!==id) { state.tool=id;state.args=structuredClone(activeTool().args);state.raw=JSON.stringify(state.args,null,2);state.error='';state.run=null;state.draftVersion+=1;state.view='content'; }closeModal();render(); }
  function execute() {
    if(state.running) return;
    if(!validate()) { render();return; }
    state.sequence+=1;state.running=true;
    const run={id:`run_${String(state.sequence).padStart(3,'0')}`,tool:state.tool,args:structuredClone(state.args),status:'running',duration:0,version:state.draftVersion,example:false,serverId:'commerce-shared',environmentId:'development',credentialBindingId:'project-service-token'};
    const fail=state.failure;state.run=run;render();
    state.timer=setTimeout(()=>{run.status=fail?'failed':'success';run.duration=248;state.running=false;state.history.unshift(structuredClone(run));state.timer=null;render();},950);
  }
  function cancel() { if(!state.running) return;clearTimeout(state.timer);state.timer=null;state.running=false;state.run.status='cancelled';state.run.duration=0;state.history.unshift(structuredClone(state.run));render(); }
  function openModal(title,body,footer='') { $('#overlay').innerHTML=`<header class="dialog-head"><h2 id="dialog-title">${title}</h2>${button('close','','X','quiet icon-only','aria-label="关闭"')}</header><div class="dialog-body">${body}</div>${footer?`<footer class="dialog-foot">${footer}</footer>`:''}`;$('#overlay').showModal(); }
  function closeModal() { if($('#overlay').open) $('#overlay').close();state.modal=''; }
  function showHistory() {
    state.modal='history';
    openModal('调用历史',`<p class="dialog-description">历史只读。恢复会新建未执行的个人草稿；不会自动调用 Tool。此原型一次只展示一个草稿。</p>${state.history.map(run=>`<div class="history-row"><span class="status-symbol">${icon(run.status==='success'?'CheckCircle':'WarningCircle')}</span><div><strong>${esc(run.tool)}</strong><small>${esc(run.id)} · ${statusLabel(run)} · ${run.duration} ms · Development${run.example?' · 示例':''}</small></div><span class="spacer"></span>${button('inspect-run','查看','','',`data-run="${run.id}"`)}${button('restore','恢复草稿','ArrowUpRight','',`data-run="${run.id}" ${state.running?'disabled':''}`)}</div>`).join('')}`);
  }
  function showLibrary() { state.modal='library';openModal('选择调试工具',`<p class="dialog-description">Commerce API · 4 个可用工具。切换工具会载入该工具的示例参数。</p><label class="searchbox" style="margin-bottom:16px">${icon('MagnifyingGlass')}<input id="library-search" aria-label="搜索可用工具" placeholder="工具名或描述"></label><div id="library-list">${tools.map(toolCard).join('')}</div>`); }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-action]');if(!target||target.disabled) return;const action=target.dataset.action;
    if(action==='variant') return setVariant(target.dataset.variant);
    if(action==='close') return closeModal();
    if(action==='tools') return closeModal();
    if(action==='library') return showLibrary();
    if(action==='select-tool') return selectTool(target.dataset.tool);
    if(action==='filter') {state.filter=target.dataset.filter;render();return;}
    if(action==='mode') {if(target.dataset.mode==='form'&&!validate()){render();return;}state.mode=target.dataset.mode;render();return;}
    if(action==='view') {state.view=target.dataset.view;render();return;}
    if(action==='execute') return execute();
    if(action==='cancel') return cancel();
    if(action==='reset') {state.args=structuredClone(activeTool().args);state.raw=JSON.stringify(state.args,null,2);invalidate();render();return;}
    if(action==='history') return showHistory();
    if(action==='inspect-run') {const run=state.history.find(item=>item.id===target.dataset.run);openModal(`调用 ${esc(run.id)}`,`<p class="dialog-description">${esc(run.tool)} · ${statusLabel(run)} · Development · 只读快照</p><h3 class="tiny muted">请求参数</h3>${code(run.args)}<h3 class="tiny muted" style="margin-top:24px">响应</h3>${code(run.status==='cancelled'?{status:'cancelled'}:output(run))}`,button('history','返回历史','ClockCounterClockwise',''));return;}
    if(action==='restore') {if(state.running) return;const run=state.history.find(item=>item.id===target.dataset.run);state.tool=run.tool;state.args=structuredClone(run.args);state.raw=JSON.stringify(state.args,null,2);state.draftVersion+=1;state.run=null;state.error='';closeModal();render();toast(`已从 ${run.id} 恢复未执行的草稿`);return;}
    if(action==='schema') return openModal('工具定义',`<p class="dialog-description">${esc(activeTool().description)}<br>Schema、描述和只读提示都来自 Server。以下为演示定义。</p>${code({name:state.tool,description:activeTool().description,annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:Object.fromEntries(Object.entries(activeTool().args).map(([key,value])=>[key,{type:typeof value==='number'?'integer':typeof value}])),required:[Object.keys(activeTool().args)[0]],additionalProperties:false}})}`);
    if(action==='copy') {if(!state.run||!['success','failed'].includes(state.run.status))return toast('暂无可复制结果');navigator.clipboard.writeText(JSON.stringify(output(),null,2)).then(()=>toast('已复制示例结果')).catch(()=>toast('浏览器未允许复制，请在原始 JSON 中选择内容'));return;}
    if(action==='context'||action==='server') return openModal('Server 与执行上下文',`<p class="dialog-description">正式版通过 Go 后端使用这份配置发起调用。Server 和环境变更应先断开连接；本轮原型聚焦 Tools，配置仅展示。</p><dl class="facts"><dt>Server</dt><dd>Commerce API</dd><dt>连接 ID</dt><dd class="mono">commerce-shared</dd><dt>传输</dt><dd>Streamable HTTP</dd><dt>URL</dt><dd class="mono">https://mcp.example.com/commerce</dd><dt>环境</dt><dd>Development · revision 12</dd><dt>认证</dt><dd>项目 Bearer 凭据 · ${icon('EyeSlash')} 已隐藏</dd><dt>执行位置</dt><dd>团队服务节点</dd></dl><div class="content-note">${icon('Info')}不同连接独立绑定认证；同 URL 不共享会话。</div>`);
    if(action==='environment') return openModal('Development 环境',`<p class="dialog-description">生效值：项目基础变量 → 项目 Profile → Server 基础变量 → Server Profile。此处只展示执行上下文，不编辑真实变量。</p><dl class="facts"><dt>API_REGION</dt><dd class="mono">cn-east-1</dd><dt>DEFAULT_LOCALE</dt><dd class="mono">zh-CN</dd><dt>REQUEST_TIMEOUT</dt><dd class="mono">30000</dd><dt>API_TOKEN</dt><dd>${badge('Secret · 值已隐藏')}</dd></dl><div class="content-note">${icon('LockKey')}Secret 由后端注入执行器；浏览器只获得脱敏描述。</div>`);
    if(action==='project') return openModal('当前项目',`<dl class="facts"><dt>团队</dt><dd>Acme</dd><dt>项目</dt><dd>Commerce</dd><dt>当前角色</dt><dd>Maintainer</dd><dt>共享范围</dt><dd>Server、环境配置、脱敏调用历史</dd><dt>个人范围</dt><dd>请求草稿、调试 Tab、个人 OAuth 会话</dd></dl>`);
    if(action==='members') return openModal('团队协作',`<p class="dialog-description">团队和项目管理放在工作空间入口，不占据调试主区域。成员邀请与角色流程见第一版完整设计预览。</p><div class="history-row"><span class="avatar">WW</span><div><strong>Wu Wei</strong><small>团队 Owner · 项目 Maintainer</small></div></div><div class="history-row"><span class="avatar">LC</span><div><strong>Lin Chen</strong><small>团队 Member · 项目 Developer</small></div></div><div class="content-note">${icon('UserPlus')}正式版支持邀请成员、指定初始项目角色、过期与撤销。</div>`);
  });
  document.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.field) {const name=input.dataset.field;state.args[name]=input.type==='checkbox'?input.checked:input.type==='number'?(input.value===''?'':Number(input.value)):input.value;state.raw=JSON.stringify(state.args,null,2);invalidate();return;}
    if(input.id==='raw-arguments') {state.raw=input.value;invalidate();return;}
    if(input.id==='simulate-error') {state.failure=input.checked;return;}
    if(input.id==='catalog-search') {state.query=input.value;$('#catalog-list').innerHTML=filteredTools().map(toolCard).join('')||'<div class="empty">没有匹配的工具。</div>';return;}
    if(input.id==='library-search') {const query=input.value.toLowerCase();$('#library-list').innerHTML=tools.filter(tool=>`${tool.name} ${tool.id} ${tool.description} ${Object.keys(tool.args).join(' ')}`.toLowerCase().includes(query)).map(toolCard).join('')||'<div class="empty">没有匹配的工具。</div>';}
  });
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select,[contenteditable]')||$('#overlay').open) return;
    if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const keys=Object.keys(variants);setVariant(keys[(keys.indexOf(state.variant)+(event.key==='ArrowRight'?1:2))%3]);}
    if(event.key==='/'){event.preventDefault();if(state.variant==='B')$('#catalog-search').focus();else showLibrary();}
  });
  window.addEventListener('popstate',()=>{const variant=new URL(location.href).searchParams.get('variant');state.variant=variants[variant]?variant:'A';render();});
  render();
})();
