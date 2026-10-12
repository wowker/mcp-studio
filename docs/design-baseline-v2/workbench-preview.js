/* Design preview only. Business data stays in memory; only locale/theme preferences persist. */
(() => {
  'use strict';
  const root = document.getElementById('app');
  const dialog = document.getElementById('overlay');
  const notification = document.getElementById('notification');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const localeKey = 'mcp-inspector.locale';
  const parseLocale = value => /^en(?:-|$)/i.test(value || '') ? 'en-US' : /^zh(?:-(?:CN|SG))?$/i.test(value || '') ? 'zh-CN' : null;
  let locale = 'zh-CN';
  try { const saved=localStorage.getItem(localeKey); locale=parseLocale(saved) || 'zh-CN'; if(saved && !parseLocale(saved)) localStorage.removeItem(localeKey); else if(saved && saved !== locale) localStorage.setItem(localeKey,locale); } catch { /* Preference storage may be unavailable. */ }
  const i18n = window.i18next.createInstance();
  i18n.init({ lng: locale, fallbackLng: 'zh-CN', initImmediate: false, keySeparator: false, interpolation: { escapeValue: false }, resources: Object.fromEntries(Object.entries(window.previewLocales).map(([language, translation]) => [language, { translation }])) });
  const t = (key, values) => i18n.t(key, values);
  const profileLabel = value => t(({ '基础配置':'common.profileBase', '开发环境':'common.profileDevelopment', '预发环境':'common.profileStaging' })[value] || 'common.notConfigured');
  const roleLabel = value => t(`common.role${value}`);
  const credentialLabel = value => ({ '项目服务账号':t('common.projectServiceAccount'), '我的 OAuth':t('common.myOauth'), '无需凭据':t('common.noCredentials'), '尚未配置':t('common.notConfigured') })[value] || value;
  const credentialExplanation = value => t(value === '我的 OAuth' ? 'common.personalCredentialExplanation' : value === '无需凭据' ? 'common.noCredentialExplanation' : 'common.projectCredentialExplanation');
  const statusLabel = value => ({ '已加入':t('common.joined'), '待接受':t('common.pending'), '已撤销':t('common.revoked') })[value] || value;
  function syncLanguageMetadata() {
    document.documentElement.lang = locale;
    document.title = t('common.title');
    document.querySelector('.skip').textContent = t('common.skip');
  }
  function changeLanguage(value) {
    const next = parseLocale(value) || 'zh-CN';
    if (next === locale) return;
    // Keep live form state and scroll ownership, including unsaved configuration.
    const controls = [...root.querySelectorAll('input[id],select[id],textarea[id]')].filter(node => node.id !== 'language-switch' && !node.readOnly).map(node => ({ id:node.id, value:node.value, checked:node.checked, start:node.selectionStart, end:node.selectionEnd }));
    const selectors = ['.tool-list','.document-tabs','.pane-scroll','.definition-page','.detail','.master','.run-page-scroll','.settings-page','.table-wrap','.execution-scroll','.server-fields','.environment-scroll','.management-editor-scroll'];
    const scrolls = selectors.map(selector => ({ selector, positions:[...root.querySelectorAll(selector)].map(node => [node.scrollLeft,node.scrollTop]) }));
    const priorResources = window.previewLocales[locale];
    const nextResources = window.previewLocales[next];
    const translateMessage = message => { const key = Object.keys(priorResources).find(key => priorResources[key] === message); if(key) return nextResources[key]; const required=/^(?:请填写必填参数：(.+)。|Enter required parameters: (.+)\.)$/.exec(message); return required ? i18n.getFixedT(next)('common.requiredFields',{fields:required[1] || required[2]}) : message; };
    for (const project of Object.values(dataByProject)) for (const tab of project.tabs) { tab.error = translateMessage(tab.error); for(const key of Object.keys(tab.parameterErrors)) tab.parameterErrors[key] = translateMessage(tab.parameterErrors[key]); }
    locale = next; i18n.changeLanguage(locale); syncLanguageMetadata();
    try { localStorage.setItem(localeKey,locale); document.cookie = `mcp_inspector_locale=${locale}; Path=/; SameSite=Lax`; } catch { /* Language remains active for this session. */ }
    render();
    const authDraft=controls.find(control=>control.id === 'server-auth');
    if(authDraft) updateAuthenticationDraft(authDraft.value);
    for (const control of controls) { const node = document.getElementById(control.id); if(!node)continue; node.value=control.value; node.checked=control.checked; if(control.start !== null && ['text','search','textarea','url'].includes(node.type)) node.setSelectionRange(control.start,control.end); }
    for(const {selector,positions} of scrolls) [...root.querySelectorAll(selector)].forEach((node,index) => { if(positions[index]) { node.scrollLeft=positions[index][0]; node.scrollTop=positions[index][1]; } });
    document.getElementById('language-switch')?.focus({preventScroll:true});
    notify(t('common.languageChanged'));
  }
  const icon = name => window.previewIcons[name] || '';
  const button = (action, text, glyph = '', variant = '', extra = '') => `<button type="button" class="btn ${variant}" data-action="${action}" ${extra}>${glyph ? icon(glyph) : ''}${text}</button>`;
  const iconButton = (action, glyph, label, extra = '') => button(action, '', glyph, 'quiet icon-only', `aria-label="${escape(label)}" title="${escape(label)}" ${extra}`);
  const badge = (text, style = '') => `<span class="tag ${style}">${escape(text)}</span>`;
  const field = (id, label, value, description = '', extra = '') => `<div class="field ${extra.includes('data-full') ? 'full' : ''}"><label for="${id}">${label}</label>${description ? `<span class="description">${description}</span>` : ''}<input id="${id}" value="${escape(value)}" ${extra}></div>`;
  const ui = window.workbenchComponents.create({escape, icon, t, button, iconButton, badge});
  const parameters = window.workbenchParameters.create({escape,t,icon,jsonView,validateSchema:window.previewSchema});
  const debugView = window.workbenchDebugger.view({escape,t,icon,button,badge,jsonView,canRun:()=>canRun(),canRetry:r=>canRetry(r)});
  const execution = window.workbenchConnections.create({escape,t,icon,button,badge,ui,changed:(key,kind)=>{render();if(kind==='connect'&&state.page==='servers'&&key===JSON.stringify([state.projectId,selectedConfigServer().id,'current-user'])){const scroll=root.querySelector('.execution-scroll');if(scroll)scroll.scrollTop=0;}}});
  const environments = window.workbenchEnvironments.create({escape,t,icon,button,badge,ui,profileLabel,execution});
  const environmentContext = (server=activeServer(),profile=state.profile) => ({projectId:state.projectId,project:currentProject(),data:data(),server,profile,editable:canEdit(),runnable:canRun()});
  const management = window.workbenchManagement.create({escape,t,icon,button,badge,field,ui,profileLabel,roleLabel});
  const selectedConfigServer = () => data().servers.find(item => item.id === data().selectedServerId) || activeServer();
  const connectionDrafts = new Map();
  const configDraftKey = () => JSON.stringify([state.projectId,selectedConfigServer().id]);
  function captureConnectionDraft() {
    const form=document.getElementById("server-form");
    if (!form) return;
    connectionDrafts.set(JSON.stringify([form.dataset.project,form.dataset.server]), [...root.querySelectorAll("#server-form input[id],#server-form select[id]")].filter(node=>!node.readOnly).map(node=>({id:node.id,value:node.value})));
  }
  function restoreConnectionDraft() {
    if (!document.getElementById("server-form")) return;
    const values=connectionDrafts.get(configDraftKey()) || [];
    const auth=values.find(item=>item.id==="server-auth");
    if(auth) updateAuthenticationDraft(auth.value);
    for(const item of values) {const node=document.getElementById(item.id);if(node)node.value=item.value;}
  }
  const availableTools = [
    { name: 'search_products', description: '按关键词检索商品，返回库存、价格与分页信息。', group: '商品', args: { query: '无线键盘', limit: 10, locale: 'zh-CN', include_archived: false } },
    { name: 'get_product', description: '读取单个商品的详细信息。', group: '商品', args: { product_id: 'prd_1042' } },
    { name: 'list_categories', description: '读取商品分类目录。', group: '商品', args: { parent_id: 'root' } },
    { name: 'get_inventory', description: '查询指定商品的可售库存。', group: '库存', args: { product_id: 'prd_1042' } },
    { name: 'list_orders', description: '按订单状态查询订单列表。', group: '订单', args: { status: 'pending', limit: 10 } },
    { name: 'get_order', description: '读取订单明细。', group: '订单', args: { order_id: 'ord_2081' } },
    {name:'preview_remote_schema',description:'远程 Schema 引用能力检查。',group:'订单',args:{payload:{}},inputSchema:{type:'object',properties:{payload:{$ref:'https://schemas.example.test/payload.json'}},required:['payload']}},
    { name: 'get_account', description: '读取授权账户信息。', group: '账户', args: {} },
    { name: 'get_permissions', description: '查看授权账户可用的操作范围。', group: '账户', args: {} },
    { name: 'get_store_product_mapping', description: '批量查询店铺商品与供应商商品的映射关系。', group: '商品', args: { product_ids: ['prd_1042', 'prd_1096'] } },
  ];
  availableTools.push({name:'preview_order',description:'复杂参数调试示例',group:'订单',args:{customer:{name:'演示用户',region:'CN'},items:[{product_id:'prd_1042',quantity:1,discount:0,gift:false}],options:{notify:false,reference:null}}});
  const knowledgeTools = [
    { name: 'search_documents', description: '搜索知识库文档并返回匹配片段。', group: '文档', args: { query: '接入指南', limit: 10 } },
    { name: 'get_document', description: '读取指定文档内容。', group: '文档', args: { document_id: 'doc_014' } },
  ];
  const sampleResponse = { products: [{ id: 'prd_1042', name: '无线机械键盘 K87', price: 329, currency: 'CNY', stock: 128 }, { id: 'prd_1096', name: '薄款无线键盘 S68', price: 219, currency: 'CNY', stock: 46 }], total: 2, has_more: false };
  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const projects = [
    { id: 'commerce', name: '电商 MCP', description: '商品、库存与订单接口联调', servers: 3, members: 5 },
    { id: 'knowledge', name: '知识库 MCP', description: '文档检索与知识库接口联调', servers: 1, members: 3 },
  ];
  function projectData(projectId) {
    const commerce = projectId === 'commerce';
    const servers = commerce ? [
      { id: 'commerce-main', name: 'Commerce API', url: 'https://mcp.commerce.example/mcp', auth: 'bearer', connected: true, profile: '开发环境', timeout: 30, credential: '项目服务账号' },
      { id: 'commerce-staging', name: 'Commerce · 预发', url: 'https://staging.commerce.example/mcp', auth: 'bearer', connected: false, profile: '预发环境', timeout: 30, credential: '项目服务账号' },
      { id: 'commerce-personal', name: 'Commerce · 个人授权', url: 'https://mcp.commerce.example/mcp', auth: 'oauth', connected: false, profile: '开发环境', timeout: 30, credential: '我的 OAuth' },
    ] : [{ id: 'knowledge-main', name: 'Knowledge API', url: 'https://mcp.knowledge.example/mcp', auth: 'bearer', connected: true, profile: '开发环境', timeout: 30, credential: '项目服务账号' }];
    const firstTool = commerce ? availableTools[0] : knowledgeTools[0];
    const run = { id: `${projectId}-run-01`, tool: firstTool.name, serverId: servers[0].id, actor: '吴伟', profile: '开发环境', status: 'succeeded', time: '10:42:18', duration: 243, arguments: window.workbenchParameters.initialArguments(firstTool,firstTool.args), response: commerce ? sampleResponse : { documents: [{ id: 'doc_014', title: 'MCP 接入指南', score: 0.92 }], total: 1 }, pinned: true, storageStatus:'recorded', executionSource:'local-agent' };
    const history = [run,
      { ...deepCopy(run), id: `${projectId}-run-02`, storageStatus:'failed', status: 'failed', time: '10:38:46', duration: 128, actor: '林岚', pinned: false, response: { code: 'AUTHORIZATION_REQUIRED', message: '授权已失效，请重新连接 Server。' } },
      { ...deepCopy(run), id: `${projectId}-run-03`, tool: commerce ? 'get_product' : 'get_document', time: '10:31:04', duration: 182, actor: '陈卓', arguments: commerce ? { product_id: 'prd_1042' } : { document_id: 'doc_014' }, pinned: false },
      { ...deepCopy(run), id: `${projectId}-run-04`, storageStatus:'pending', status: 'cancelled', time: '10:26:37', duration: 1047, actor: '吴伟', response: null, pinned: false },
      { ...deepCopy(run), id: `${projectId}-run-05`, time: '09:54:11', duration: 216, actor: '林岚', profile: '预发环境', serverId: servers[commerce ? 1 : 0].id, pinned: false },
    ];
    history.forEach((item,index)=>{item.date=index<3?'2026-10-12':'2026-10-11';item.projectId=projectId;item.uploadAvailable=item.storageStatus!=='failed';});
    const fixtureSecret='demo-only-credential-82f';
    history.unshift({...deepCopy(run),id:`${projectId}-run-redaction`,projectId,date:'2026-10-12',time:'14:26:42',pinned:false,storageStatus:'failed',uploadAvailable:false,arguments:{...deepCopy(run.arguments),query:'Bearer '+fixtureSecret,authorization:'Bearer '+fixtureSecret,customer:{email:'buyer@example.test',phone:'+86 13800000000'}},response:{ok:true,access_token:fixtureSecret,customer:{email:'buyer@example.test'},trace:{echo:fixtureSecret}},headers:{Authorization:'Bearer '+fixtureSecret,'Set-Cookie':'session=demo-only-cookie'},endpoint:'https://mcp.example.test/mcp?access_token='+fixtureSecret,protocol:{jsonrpc:'2.0',result:{content:[{type:'text',text:JSON.stringify({access_token:fixtureSecret,ok:true})}]}},redactionPaths:['/arguments/customer/email','/response/customer/email']});
    for(let index=0;index<7;index++)history.push({...deepCopy(run),id:`${projectId}-run-archive-${index+1}`,projectId,date:index<3?'2026-10-11':'2026-10-09',time:`09:${String(48-index).padStart(2,'0')}:12`,actor:index%2?'林岚':'吴伟',profile:index%2?'预发环境':'开发环境',duration:180+index*89,tool:index===6?'retired_search_products':run.tool,pinned:false,status:index===4?'cancelled':'succeeded',response:index===4?null:deepCopy(run.response),truncated:index===2});
    const firstTab = makeTab(firstTool, servers[0].id);
    firstTab.result = run;
    const secondTool = commerce ? availableTools[1] : knowledgeTools[1];
    return { servers, history, savedRecords: [
      {id:`${projectId}-saved-fixture-01`,name:commerce ? '键盘商品检索' : '接入指南检索',note:'',scope:'project',ownerId:'user-wuwei',actor:'吴伟',savedAt:'2026-10-10 10:45:26',tool:run.tool,serverId:run.serverId,profile:run.profile,arguments:deepCopy(run.arguments),response:deepCopy(run.response),hasResponse:true,sourceRunId:run.id},
      {id:`${projectId}-saved-fixture-02`,name:commerce ? '单个商品查询' : '读取文档',note:'',scope:'private',ownerId:'user-wuwei',actor:'吴伟',savedAt:'2026-10-10 10:36:12',tool:secondTool.name,serverId:servers[0].id,profile:run.profile,arguments:deepCopy(secondTool.args),response:null,hasResponse:false,sourceRunId:null},
      {id:`${projectId}-saved-fixture-03`,name:'脱敏响应示例',note:'记录失败后可单独重试上传。',scope:'private',ownerId:'user-wuwei',actor:'吴伟',savedAt:'2026-10-12 14:28:30',tool:run.tool,serverId:run.serverId,profile:run.profile,arguments:{...deepCopy(run.arguments),authorization:'[REDACTED]'},response:{ok:true,access_token:'[REDACTED]'},hasResponse:true,sourceRunId:`${projectId}-run-redaction`,storageStatus:'failed',uploadAvailable:false},
      {id:`${projectId}-saved-fixture-04`,name:'旧服务请求快照',note:'原服务已移除，快照仍保留。',scope:'project',ownerId:'user-wuwei',actor:'吴伟',savedAt:'2026-10-09 16:18:00',tool:run.tool,serverId:'retired-connection',profile:'开发环境',arguments:deepCopy(run.arguments),response:null,hasResponse:false,sourceRunId:'removed-source-run',storageStatus:'recorded'},
    ], recordsView:'calls', savedSearch:'', savedScope:'all', selectedSavedId:null, recordDraft:null, tabs: [firstTab, makeTab(secondTool, servers[0].id)], activeTabId: firstTab.id, activeServerId: servers[0].id, selectedServerId: servers[0].id, selectedRunId: run.id,
      profiles: ['基础配置', '开发环境', '预发环境'],
      variables: [
        {id:'var-region-project-dev',name:'REGION',value:'ap-southeast-1',secret:false,scope:'project',profile:'开发环境',type:'string',source:'开发环境'},
        {id:'var-region-server-base',name:'REGION',value:'cn-north-1',secret:false,scope:'server',serverId:servers[0].id,profile:'基础配置',type:'string',source:'基础配置'},
        {id:'var-region-server-dev',name:'REGION',value:'cn-east-2',secret:false,scope:'server',serverId:servers[0].id,profile:'开发环境',type:'string',source:'开发环境'},
        {id:'var-retries',name:'MAX_RETRIES',value:0,secret:false,scope:'project',profile:'基础配置',type:'number',source:'基础配置'},
        {id:'var-dry-run',name:'DRY_RUN',value:false,secret:false,scope:'project',profile:'开发环境',type:'boolean',source:'开发环境'},
        {id:'var-options',name:'REQUEST_OPTIONS',value:{locale:'zh-CN',include:['inventory','price']},secret:false,scope:'project',profile:'开发环境',type:'json',source:'开发环境'},
        {id:'var-region-reference',name:'REGION_LABEL',value:'region-{{REGION}}',secret:false,scope:'project',profile:'基础配置',type:'string',source:'基础配置'},
        { id: 'var-token', name: commerce ? 'COMMERCE_TOKEN' : 'KNOWLEDGE_TOKEN', value: null, secret: true, scope: 'server', serverId: servers[0].id, profile: '开发环境', type: 'string', source: '开发环境' },
        { id: 'var-region', name: 'REGION', value: 'cn-east-1', secret: false, scope: 'project', profile: '基础配置', type: 'string', source: '基础配置' },
        { id: 'var-locale', name: 'DEFAULT_LOCALE', value: 'zh-CN', secret: false, scope: 'project', profile: '开发环境', type: 'string', source: '开发环境' },
        { id: 'var-tenant', name: 'TENANT_ID', value: commerce ? 'store_021' : 'workspace_014', secret: false, scope: 'server', serverId: servers[0].id, profile: '开发环境', type: 'string', source: '开发环境' },
        { id: 'var-limit', name: 'PAGE_SIZE', value: 10, secret: false, scope: 'project', profile: '开发环境', type: 'number', source: '开发环境' },
      ] };
  }
  let sequence = 10;
  function makeTab(tool, serverId, args) {
    const values = args === undefined ? window.workbenchParameters.initialArguments(tool,tool.args) : deepCopy(args);
    return { id: `tab-${++sequence}`, tool: tool.name, serverId, arguments: values, raw: JSON.stringify(values, null, 2), mode: 'form', result: null, error: '', origin: null, running: false, scenario:'success', complexModes:{}, resultView: 'result', workspaceView: 'debug', version: 0, arrayDrafts: {}, parameterErrors: {}, parameterTouched:{}, parameterSubmitted:false, pinned: false, historySearch: '', historyStatus: 'all', historyRunId: null, savedRecordId:null, savedSearch:'', savedScope:'all', recordDraft:null };
  }
  const state = { page: 'tools', serverView:'connection', projectId: 'commerce', toolSearch: '', profile: '开发环境', envScope: 'preview', historySearch: '', historyStatus: 'all', historyServer: 'all', membersView: 'members', role: 'Maintainer', requestWidth: 52, collapsed: false, theme: 'light', tabMenu: null };
  try { const saved=localStorage.getItem('mcp-inspector.theme'); if (saved === 'dark' || saved === 'light') state.theme=saved; else if (saved) localStorage.removeItem('mcp-inspector.theme'); } catch { /* Preference storage is optional. */ }
  document.documentElement.dataset.theme=state.theme;
  const dataByProject = { commerce: projectData('commerce'), knowledge: projectData('knowledge') };
  for(const [projectId,project] of Object.entries(dataByProject))for(const record of project.savedRecords)record.projectId=projectId;
  const members = [
    { name: '吴伟', email: 'wuwei@example.com', initials: 'WW', teamRole: 'Owner', projectRole: 'Maintainer', status: '已加入' },
    { name: '林岚', email: 'linlan@example.com', initials: 'LL', teamRole: 'Member', projectRole: 'Developer', status: '已加入' },
    { name: '陈卓', email: 'chenzhuo@example.com', initials: 'CZ', teamRole: 'Member', projectRole: 'Developer', status: '已加入' },
    { name: '周雨', email: 'zhouyu@example.com', initials: 'ZY', teamRole: 'Member', projectRole: 'Viewer', status: '已加入' },
  ];
  const invitations = [{ id: 'invite-01', email: 'xiaoyu@example.com', teamRole: 'Member', project: '电商 MCP', projectRole: 'Developer', status: '待接受', expires: '2026-10-17' }];
  const baseline = window.workbenchBaseline.create({escape,t,icon,button,badge,ui,state,projects,data:()=>dataByProject[state.projectId],allData:()=>Object.values(dataByProject),role:()=>state.role,team:()=>team,execution,environments,environmentContext,server:()=>selectedConfigServer(),changed:()=>render(),retry:r=>debuggerModel.retry(r),refreshCalls:()=>{for(const p of Object.values(dataByProject))for(const tab of p.tabs)debuggerModel.loseBrowser(tab);},closeDialog});
  for(const [projectId,project] of Object.entries(dataByProject))for(const run of project.history){run.projectId=projectId;run.ownerId=run.actor==='吴伟'?'user-wuwei':'other-user';run.queueOwner=run.executionSource||'local-agent';}
  const debuggerModel = window.workbenchDebugger.create({canUpload:run=>baseline.canUpload(run),prepareUpload:run=>window.workbenchRedaction.prepare(run).value,changed:()=>render(),successResponse:(tool,args)=>tool==='search_products' ? deepCopy(sampleResponse) : tool==='get_product' ? deepCopy(sampleResponse.products[0]) : tool==='search_documents' ? {documents:[{id:'doc_014',title:'MCP 接入指南',score:0.92}]} : {data:deepCopy(args),ok:true}});
  const data = () => dataByProject[state.projectId];
  execution.setEndpointCheck((draft,key)=>{let url;try{url=new URL(draft.url);}catch{return false;}const [projectId,serverId]=JSON.parse(key);const project=dataByProject[projectId];const selected=project.servers.find(s=>s.id===serverId);const resolved=environments.resolved({projectId,data:project,server:selected,profile:draft.profile});for(const [,value]of url.searchParams)for(const match of value.matchAll(/\{\{([^}]+)\}\}/g)){const entry=resolved.find(r=>r.name===match[1]);if(!entry||entry.secret||entry.error)return false;}return true;});
  execution.setEnvironmentCheck((projectId,server)=>environments.issues({projectId,server,profile:server.profile,data:dataByProject[projectId]}).length===0);
  setInterval(()=>{const tab=activeTab();const node=root.querySelector('.debug-elapsed');if(tab?.running&&node)node.textContent=t('debugger.elapsed',{seconds:debuggerModel.elapsed(tab)});},1000);
  const currentProject = () => projects.find(project => project.id === state.projectId);
  const activeServer = () => data().servers.find(server => server.id === data().activeServerId) || { id: '', name: '尚无 Server', profile: '基础配置', connected: false, credential: '尚未配置' };
  const activeTab = () => data().tabs.find(tab => tab.id === data().activeTabId);
  const toolSet = () => state.projectId === 'commerce' ? availableTools : knowledgeTools;
  const canEdit = () => state.role === 'Maintainer' && baseline.access();
  const canRun = () => state.role !== 'Viewer' && baseline.access();
  const canRetry = record => canRun() && baseline.canRetry(record);
  const permission = (kind) => (kind === 'edit' ? canEdit() : canRun()) ? '' : `disabled title="${escape(t('common.noPermission'))}"`;
  function connectionTabs() {
    return data().tabs.filter(tab=>tab.serverId === activeServer().id).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)));
  }
  function reorderTabs(ordered) {
    let index=0;
    const serverId=activeServer().id;
    data().tabs=data().tabs.map(tab=>tab.serverId === serverId ? ordered[index++] : tab);
  }
  function closeTabs(ids) {
    const closable=new Set(data().tabs.filter(tab=>tab.serverId===activeServer().id && ids.includes(tab.id) && !tab.pinned && !tab.running).map(tab=>tab.id));
    const order=connectionTabs();
    const activeIndex=order.findIndex(tab=>tab.id===data().activeTabId);
    data().tabs=data().tabs.filter(tab=>!closable.has(tab.id));
    if(closable.has(data().activeTabId)) data().activeTabId=order.slice(activeIndex+1).find(tab=>!closable.has(tab.id))?.id || order.slice(0,activeIndex).reverse().find(tab=>!closable.has(tab.id))?.id || null;
  }
  function duplicateTab(source) {
    const created=makeTab(toolSet().find(tool=>tool.name===source.tool),source.serverId,source.arguments);
    Object.assign(created,{complexModes:deepCopy(source.complexModes),scenario:source.scenario,collapsedParameterPaths:deepCopy(source.collapsedParameterPaths||[]),raw:source.raw,mode:source.mode,arrayDrafts:deepCopy(source.arrayDrafts),parameterErrors:deepCopy(source.parameterErrors),parameterTouched:deepCopy(source.parameterTouched),parameterQuietPaths:deepCopy(source.parameterQuietPaths||[]),parameterSubmitted:source.parameterSubmitted,error:source.error,origin:source.origin});
    const ordered=connectionTabs();
    const index=source.pinned ? ordered.findIndex(tab=>!tab.pinned) : ordered.findIndex(tab=>tab.id===source.id)+1;
    ordered.splice(index < 0 ? ordered.length : index,0,created);
    data().tabs.push(created); reorderTabs(ordered); data().activeTabId=created.id;
    return created;
  }
  function menuTab() {
    const context=state.tabMenu;
    if(!context || context.projectId!==state.projectId || context.serverId!==activeServer().id) return null;
    return connectionTabs().find(tab=>tab.id===context.tabId);
  }
  function renderTabMenu() {
    const tab=menuTab();
    if(!tab) { state.tabMenu=null; return ''; }
    const tabs=connectionTabs(); const index=tabs.findIndex(item=>item.id===tab.id);
    const closable=item=>!item.pinned && !item.running;
    return ui.tabMenu({tabId:tab.id,items:[
      {action:'tab-command-copy',key:'tools.copyName',icon:'Copy'},
      {action:'tab-command-duplicate',key:'tools.duplicateTab',icon:'FileCode'},
      {action:'tab-command-pin',key:tab.pinned ? 'tools.unpinTab' : 'tools.pinTab',icon:'PushPin',checked:tab.pinned},
      {action:'tab-command-left',key:'tools.moveLeft',icon:'ArrowLeft',divider:true,disabled:index===0 || tabs[index-1].pinned!==tab.pinned},
      {action:'tab-command-right',key:'tools.moveRight',icon:'ArrowRight',disabled:index===tabs.length-1 || tabs[index+1].pinned!==tab.pinned},
      {action:'tab-command-others',key:'tools.closeOthers',icon:'X',divider:true,disabled:!tabs.some(item=>item.id!==tab.id && closable(item))},
      {action:'tab-command-close-right',key:'tools.closeRight',icon:'X',disabled:!tabs.slice(index+1).some(closable)},
    ]});
  }
  function positionTabMenu() {
    const menu=document.getElementById('tab-action-menu'); const tab=menuTab();
    if(!menu || !tab) return;
    const trigger=document.getElementById(`tab-menu-${tab.id}`);
    if(!trigger) { closeTabMenu(false); return; }
    trigger.setAttribute('aria-expanded','true');
    const rect=trigger.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(rect.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(rect.bottom+6,innerHeight-menu.offsetHeight-8))}px`;
  }
  function openTabMenu(tabId) {
    if(state.tabMenu?.tabId===tabId) { closeTabMenu(); return; }
    closeTabMenu(false);
    state.tabMenu={projectId:state.projectId,serverId:activeServer().id,tabId};
    const markup=renderTabMenu();
    if(!markup) return;
    root.insertAdjacentHTML('beforeend',markup); positionTabMenu();
    document.querySelector('#tab-action-menu button:not(:disabled)')?.focus();
  }
  function closeTabMenu(restoreFocus=true) {
    const id=state.tabMenu?.tabId;
    state.tabMenu=null;
    document.getElementById('tab-action-menu')?.remove();
    const trigger=document.getElementById(`tab-menu-${id}`);
    trigger?.setAttribute('aria-expanded','false');
    if(restoreFocus) trigger?.focus({preventScroll:true});
  }
  async function runTabCommand(action,tabId) {
    const target=menuTab();
    if(!target || target.id!==tabId) { closeTabMenu(); return; }
    const tabs=connectionTabs(); const index=tabs.findIndex(tab=>tab.id===tabId);
    closeTabMenu(false);
    if(action==='tab-command-copy') {
      try { await navigator.clipboard.writeText(target.tool); notify(t('tools.copiedName')); }
      catch { notify(t('tools.copyNameFallback',{name:target.tool})); }
      document.getElementById(`tab-menu-${tabId}`)?.focus({preventScroll:true});
      return;
    }
    if(action==='tab-command-duplicate') duplicateTab(target);
    else if(action==='tab-command-pin') { target.pinned=!target.pinned; reorderTabs(connectionTabs()); }
    else if(action==='tab-command-left' || action==='tab-command-right') {
      const other=index+(action==='tab-command-left' ? -1 : 1);
      if(tabs[other] && tabs[other].pinned===target.pinned) { [tabs[index],tabs[other]]=[tabs[other],tabs[index]]; reorderTabs(tabs); }
    } else if(action==='tab-command-others') closeTabs(tabs.filter(tab=>tab.id!==tabId).map(tab=>tab.id));
    else if(action==='tab-command-close-right') closeTabs(tabs.slice(index+1).map(tab=>tab.id));
    render(); document.getElementById(`tab-menu-${tabId}`)?.focus({preventScroll:true});
  }
  function toggleSidebar() {
    state.collapsed=!state.collapsed;
    document.querySelector('.shell').classList.toggle('sidebar-collapsed',state.collapsed);
    const trigger=document.querySelector('[data-action="toggle-sidebar"]');
    const label=t(state.collapsed ? 'common.expandSidebar' : 'common.collapseSidebar');
    trigger.setAttribute('aria-expanded',String(!state.collapsed)); trigger.setAttribute('aria-label',label); trigger.title=label;
  }
  function toggleTheme() {
    state.theme=state.theme==='light' ? 'dark' : 'light';
    document.documentElement.dataset.theme=state.theme;
    try { localStorage.setItem('mcp-inspector.theme',state.theme); } catch { /* Session preference remains active. */ }
    const trigger=document.querySelector('[data-action="toggle-theme"]');
    trigger.innerHTML=icon(state.theme==='dark' ? 'Sun' : 'Moon')+`<span>${escape(t(state.theme==='dark' ? 'common.lightTheme' : 'common.darkTheme'))}</span>`;
    const label=t(state.theme==='dark' ? 'common.switchLight' : 'common.switchDark');
    trigger.setAttribute('aria-label',label); trigger.title=label;
  }
  const records = window.workbenchRecords.create({escape,t,icon,button,badge,jsonView,ui,data,projectId:()=>state.projectId,activeTab,canRun,canEdit,restore:restoreSavedRecord,render,notify,queue:record=>debuggerModel.retry(record)});
  const historyView=window.workbenchHistory.create({escape,t,icon,button,badge,ui,jsonView,data,projectId:()=>state.projectId,canRun,canEdit,canRetry,records,profileLabel,toolExists:record=>Boolean(toolSet().some(tool=>tool.name===record.tool)&&data().servers.some(server=>server.id===record.serverId)),retry:record=>debuggerModel.retry(record)});
  const team = window.workbenchTeam.create({projects,members,projectId:()=>state.projectId,projectData:id=>dataByProject[id],createProject:p=>{const created=projectData(p.id);Object.assign(created,{flow:{enabled:true},servers:[],tabs:[],history:[],savedRecords:[],variables:[],activeServerId:null,selectedServerId:null,selectedRunId:null});dataByProject[p.id]=created;},openProject:changeProject,navigate:page=>{state.page=page;},changed:()=>render(),setProjectRole:role=>{baseline.setRole(role);},getProjectRole:()=>state.role,canAccess:()=>baseline.access(),setTeamRole:value=>{baseline.model.teamRole=value;},t,escape,icon,button,badge,ui});
  function flowContext(){const server=activeServer();return {projectId:state.projectId,project:currentProject(),data:data(),server:server.id?server:null,connection:server.id?execution.get(state.projectId,server):null,issues:server.id?environments.issues(environmentContext(server,server.profile)):[],requirements:server.id?environments.requirements(environmentContext(server,server.profile)):[],members:team.people,invites:team.invites};}
  const flow=window.workbenchFlow.create({t,escape,icon,button,ui,context:flowContext});
  function stateContext(){
    const page=state.page,tab=activeTab(),resource=page==='tools'&&tab?.workspaceView?.startsWith('saved')?'saved':page==='tools'&&tab?.workspaceView?.startsWith('history')?'history':page==='history'?data().recordsView==='saved'?'saved':'history':page.startsWith('saved')?'saved':page.startsWith('history')?'history':['projects','project-editor','project-flow','project-welcome'].includes(page)?'projects':['members','invitation','invitation-detail','member-detail'].includes(page)?'members':page==='variable-editor'?'environment':page;
    const actions={projects:['new-project','create','projectEmpty'],servers:['connection-new','configure','serverEmpty'],environment:['env-new','variable','envEmpty'],members:['invite-member','invite','memberEmpty'],history:['state-debug','debug','noCallsHint'],saved:['state-debug','debug','noSavedHint'],tools:['state-server','configure','toolEmpty']};
    const [emptyAction,emptyLabel,emptyHint]=actions[resource]||[];
    return {identity:[state.projectId,page,page==='servers'?state.serverView:null,page==='environment'?environments.view(environmentContext()).scope:null,page==='tools'?tab?.historyRunId:null,page==='tools'?tab?.savedRecordId:null,page==='invitation-detail'?team.getRecipient():null,page==='servers'?data().selectedServerId:data().activeServerId,state.profile,page==='tools'?tab?.id:null,page==='tools'?tab?.workspaceView:null,page==='history'?data().recordsView:null,['member-detail','invitation-detail'].includes(page)?team.getSelected():null,page==='members'?team.getView():null,page==='history-detail'?data().selectedRunId:null,page==='saved-detail'?data().selectedSavedId:null],resource,project:currentProject().name,emptyAction,emptyLabel,emptyHint,editable:['history','saved','tools'].includes(resource)?canRun():canEdit(),readOnly:state.role==='Viewer'};
  }
  const states=window.workbenchStates.create({t,escape,icon,button,ui,context:stateContext});
  function renderStatePage(){const locked=baseline.guard();if(locked)return locked;if(['account','operations','access'].includes(state.page))return baseline.render();if(state.page==='login')return renderPage();return '<div class="state-layout">'+states.toolbar()+'<div>'+states.readonly()+'</div><div class="state-body">'+(states.render()||renderPage())+'</div></div>';}
  function flowStep(step){
    data().flow||={enabled:true};data().flow.enabled=true;
    const context=flowContext(),status=window.workbenchFlow.evaluate(context),target=status.steps.find(s=>s.id===step);
    if(!target?.ready)return;
    if(step==='invite'){team.setView('invitations');state.page='members';}
    if(step==='server'){state.page='servers';data().selectedServerId=activeServer().id;state.serverView='connection';}
    if(step==='environment'){state.profile=activeServer().profile;state.page='environment';environments.view(environmentContext()).scope='validation';}
    if(step==='debug'){if(!activeServer().connected){state.page='servers';data().selectedServerId=activeServer().id;state.serverView='connection';}else{chooseServer(activeServer().id);state.page='tools';activeTab().workspaceView='debug';}}
    if(step==='history'){data().selectedRunId=status.run.id;data().flow.reviewedRunId=status.run.id;state.page='history-detail';}
    if(step==='saved'){if(state.page==='record-editor'&&data().recordDraft?.snapshot.sourceRunId===status.run.id)return;if(status.record){data().selectedSavedId=status.record.id;state.page='saved-detail';}else{beginRecordSave({...status.run,sourceRunId:status.run.id,hasResponse:status.run.hasResponse??(status.run.status==='succeeded'||status.run.response!=null)},null);}}
  }
  function restoreSavedRecord(record) {
    const tool=toolSet().find(item=>item.name===record.tool);
    if (!tool || !data().servers.some(server=>server.id===record.serverId)) { notify(t('common.theSourceServerOrToolIs')); return; }
    const restored=window.workbenchRedaction.restore(record);const created=makeTab(tool,record.serverId,restored.arguments); created.origin=record.id;created.restoredOmissions=restored.omitted;created.error=restored.omitted.length?t('history.restoreMissing',{fields:restored.omitted.join(', ')}):'';
    data().tabs.push(created); data().activeTabId=created.id; data().activeServerId=record.serverId; state.page='tools'; state.toolSearch=''; render(); notify(t('common.loadedIntoANewPrivateTab'));
  }
  function recordContextTab() { return state.page==='tools' ? activeTab() : null; }
  function beginRecordSave(source,tab) {
    const returnPage=state.page;
    if (!source || !records.begin(source,tab)) return;
    if (!tab) { data().recordDraft.returnPage=returnPage; state.page='record-editor'; } render();
  }
  function toolRuns(tab) {
    return data().history.filter(run=>run.tool===tab.tool && run.serverId===tab.serverId);
  }
  function historyRecords(runs,selectedId) {
    return runs.map(run=>({...run,selected:run.id===selectedId,fieldCount:Object.keys(run.arguments || {}).length,context:`${data().servers.find(server=>server.id===run.serverId)?.name || ''} · ${profileLabel(run.profile)}`}));
  }
  function renderToolHistory(tab) {return historyView.collection('calls',tab);}
  let routeInitialized = false;
  let applyingRoute = false;
  function readRoute() {
    team.cancelPending();
    const query = new URL(location.href).searchParams;
    const projectId = query.get('project');
    if (Object.prototype.hasOwnProperty.call(dataByProject, projectId)&&projectId!==state.projectId) baseline.switchProject(projectId);
    const page = query.get('page');
    state.page = ['tools','servers','environment','history','history-detail','saved-detail','record-editor','members','invitation','variable-editor','projects','project-editor','project-welcome','project-flow','member-detail','invitation-detail','login','account','operations','access'].includes(page) ? page : 'tools';
    if(['member-detail','invitation-detail'].includes(state.page))team.setSelected(query.get('entry')||'');
    if(state.page==='members')team.setView(query.get('section')||'projectMembers');
    if(state.page==='invitation-detail')team.setRecipient(query.get('mode')==='accept');
    state.serverView=['execution','authorization'].includes(query.get('config')) ? query.get('config') : 'connection';
    if(state.page==='servers' && data().servers.some(server=>server.id===query.get('server'))) data().selectedServerId=query.get('server');
    if (state.page === 'history-detail') data().selectedRunId = query.get('run');
    if (state.page === 'history') data().recordsView=query.get('collection')==='saved' ? 'saved' : 'calls';
    if (state.page === 'saved-detail') data().selectedSavedId=query.get('record');
    if (state.page === 'tools') {
      const tab = data().tabs.find(item => item.id === query.get('tab')) || activeTab();
      if (tab) { data().activeTabId = tab.id; data().activeServerId = tab.serverId; tab.workspaceView = ['definition','history','history-detail','saved','saved-detail','save-record'].includes(query.get('view')) ? query.get('view') : 'debug'; if(tab.workspaceView === 'history-detail') tab.historyRunId=query.get('run'); if(tab.workspaceView === 'saved-detail') tab.savedRecordId=query.get('record'); }
    }
    states.set(query.get('uiState')||'ready');
  }
  function syncRoute() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('page',state.page);
    url.searchParams.set('project',state.projectId);
    if(['member-detail','invitation-detail'].includes(state.page))url.searchParams.set('entry',team.getSelected());
    if(state.page==='members')url.searchParams.set('section',team.getView());
    if(state.page==='invitation-detail'&&team.getRecipient())url.searchParams.set('mode','accept');
    if(state.page==='servers') {if(state.serverView!=='connection')url.searchParams.set('config',state.serverView);url.searchParams.set('server',selectedConfigServer().id);}
    if (state.page === 'history' && data().recordsView==='saved') url.searchParams.set('collection','saved');
    if (state.page === 'saved-detail') url.searchParams.set('record',data().selectedSavedId || '');
    if (state.page === 'history-detail') url.searchParams.set('run',data().selectedRunId || '');
    if (state.page === 'tools' && activeTab()) { url.searchParams.set('tab',activeTab().id); if (activeTab().workspaceView !== 'debug') url.searchParams.set('view',activeTab().workspaceView); if(activeTab().workspaceView === 'history-detail') url.searchParams.set('run',activeTab().historyRunId || ''); if(activeTab().workspaceView === 'saved-detail') url.searchParams.set('record',activeTab().savedRecordId || ''); }
    if(states.get().kind!=='ready')url.searchParams.set('uiState',states.get().kind);
    if (url.href !== location.href && !applyingRoute) window.history[routeInitialized ? 'pushState' : 'replaceState'](null,'',url);
    routeInitialized = true;
  }
  window.addEventListener('popstate', () => { applyingRoute = true; readRoute(); render(); applyingRoute = false; });
  function notify(text) {
    clearTimeout(notify.timer);
    notification.textContent = text;
    notification.hidden = false;
    notify.timer = setTimeout(() => { notification.hidden = true; }, 2500);
  }
  function jsonView(value) {
    value=window.workbenchRedaction.sanitize(value).value;
    if (value === null || value === undefined) return `<p class="muted small">${escape(t('common.unrecorded'))}</p>`;
    const tokenPattern = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g;
    return `<div class="json-view" aria-label="${escape(t('common.jsonContent'))}">${JSON.stringify(value, null, 2).split('\n').map((line, index) => {
      let html = '', previous = 0;
      for (const match of line.matchAll(tokenPattern)) {
        html += escape(line.slice(previous, match.index));
        const type = match[0].endsWith(':') ? 'json-key' : match[0].startsWith('"') ? 'json-string' : 'json-number';
        html += `<span class="${type}">${escape(match[0])}</span>`;
        previous = match.index + match[0].length;
      }
      html += escape(line.slice(previous));
      return `<div class="json-line"><span class="line-number" aria-hidden="true">${index + 1}</span><code>${html}</code></div>`;
    }).join('')}</div>`;
  }
  function render() {
    const layoutIdentity=JSON.stringify(stateContext().identity);
    const nativeScrollSelectors=[".baseline-scroll",".table-wrap",".master",".tool-list",".document-tabs",".tabnav",".team-tabs",".records-global-nav",".execution-nav",".definition-page",".record-editor-scroll",".state-scroll",".debug-content"];
    const nativeScrolls=root.dataset.layoutContext===layoutIdentity?nativeScrollSelectors.flatMap(selector=>[...root.querySelectorAll(selector)].map((node,index)=>({selector,index,x:node.scrollLeft,y:node.scrollTop}))):[];
    captureConnectionDraft();
    management.capture(document.getElementById('management-form'));
    const teamScroll=root.querySelector('.team-scroll'),teamOffset=teamScroll?.scrollTop,teamIdentity=JSON.stringify([state.projectId,state.page,team.getSelected(),team.getView(),team.getRecipient()]),oldTeamIdentity=teamScroll?.dataset.context;
    const historyScroll=root.querySelector('.history-design-scroll,.history-detail-design .run-page-scroll')?.scrollTop;
    const historyIdentity=JSON.stringify([state.projectId,state.page,data().recordsView,state.page==='tools'?activeTab()?.id:null,state.page==='tools'?activeTab()?.workspaceView:null,data().selectedRunId,data().selectedSavedId]);
    const oldHistoryIdentity=root.querySelector('.history-design-scroll,.history-detail-design .run-page-scroll')?.dataset.scrollIdentity;
    const envScroll=root.querySelector('.environment-scroll')?.scrollTop;
    const envContext=root.querySelector('.environment-scroll')?.dataset.context;
    const managementScroll=root.querySelector('.management-editor-scroll')?.scrollTop;
    const executionScroll=root.querySelector(".execution-scroll")?.scrollTop;
    const executionContext=root.querySelector("[data-connection-context]")?.dataset.connectionContext;
    const server = state.page==='servers'?selectedConfigServer():activeServer();
    const connectionState=server.id?execution.get(state.projectId,server):null;
    const focused = document.activeElement;
    const focusId = focused?.id;
    const focusAction = focused?.dataset.action;
    const focusExtra=Object.fromEntries(['key','path','mode','index','id','profile','kind','record','part','view','project','step'].map(key=>[key,focused?.dataset[key]]));
    const selection=['text','search','textarea'].includes(focused?.type) ? [focused.selectionStart,focused.selectionEnd] : null;
    const nestedIdentity=focused?.dataset.nestedSkip || focused?.dataset.nullPath;
    const scrolls=[...root.querySelectorAll('.request-pane .pane-scroll,.result-pane .pane-scroll')].map(node=>({kind:node.closest('.request-pane') ? 'request' : 'result',tab:node.closest('[data-debug-tab]')?.dataset.debugTab,run:node.closest('[data-result-identity]')?.dataset.resultIdentity,x:node.scrollLeft,y:node.scrollTop}));
    const focusIdentity = focused?.dataset.tab || focused?.dataset.page || focused?.dataset.tool || focused?.dataset.run;
    root.innerHTML = `<div class="shell ${state.collapsed ? 'sidebar-collapsed' : ''}">
      <aside id="app-sidebar" class="app-sidebar" aria-label="${escape(t('common.navigation'))}">
        <div class="brand"><span class="brandmark">${icon('Plug')}</span><span>MCP<span class="brand-edition">Inspector</span></span></div><div class="sidebar-toggle-row">${iconButton('toggle-sidebar','SidebarSimple',t(state.collapsed ? 'common.expandSidebar' : 'common.collapseSidebar'),`aria-controls="app-sidebar" aria-expanded="${!state.collapsed}"`)}</div>
        <button class="project-switch" type="button" data-action="projects" aria-label="${escape(t('common.switchTeamAndProject'))}" title="${escape(currentProject().name)}"><span class="project-switch-label">${escape(t('common.engineering'))}</span><span class="project-switch-name"><strong>${escape(currentProject().name)}</strong>${icon('CaretDown')}</span></button><div class="sidebar-caption">${escape(t('common.workspace'))}</div>
        <nav class="mainnav" aria-label="${escape(t('common.mainModules'))}">${[['servers', t('common.servers'), 'HardDrives'], ['tools', t('common.tools'), 'Wrench'], ['environment', t('common.environment'), 'BracketsCurly'], ['history', t('common.history'), 'ClockCounterClockwise']].map(([page, title, glyph]) => `<button type="button" data-action="navigate" data-page="${page}" aria-label="${escape(title)}" title="${escape(title)}" ${state.page === page || (page === 'history' && ['history-detail','saved-detail','record-editor'].includes(state.page)) || (page === 'environment' && state.page==='variable-editor') ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span></button>`).join('')}</nav>
        
        <div class="sidebar-bottom">${button('members', t('common.teamMembers'), 'Users', 'quiet', ['members','invitation','member-detail','invitation-detail'].includes(state.page) ? 'aria-current="page"' : '')}${button('baseline-operations',t('baseline.operations'),'Cloud','quiet')}${ui.appearance({locale,theme:state.theme})}</div>
      </aside>
      <header class="topbar">
        <div class="context">
          <label class="context-server" for="active-server"><span>${escape(t('common.serverLabel'))}</span><select id="active-server" ${data().servers.length?'':'disabled'} aria-label="${escape(t(state.page==='servers'?'connection.currentServer':'common.debugServer'))}">${!data().servers.length?`<option>${escape(t('flow.unconfigured'))}</option>`:''}${data().servers.map(item => `<option value="${item.id}" ${item.id === server.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>
          <button type="button" class="context-environment" data-action="manage-environment" title="${escape(t('common.manage'))}">${icon('BracketsCurly')}<span>${escape(profileLabel(server.profile))}</span>${icon('CaretDown')}</button>
          <button type="button" class="credential-label" data-action="open-authentication" title="${escape(t('common.viewConnectionAuthentication'))}" ${server.id ? '' : 'disabled'}>${icon('ShieldCheck')}${escape(t('common.authenticationContext',{source:credentialLabel(server.credential)}))}</button>
          <span class="context-connection push"><span class="inline ${server.connected?'success':'muted'}" title="${escape(t('connection.'+(connectionState?.status||'disconnected')))}"><i class="dot"></i>${escape(t('connection.'+(connectionState?.status||'disconnected')))}</span>${button('toggle-connection',connectionState?.status==='connecting'?t('connection.cancel'):server.connected?t('common.disconnect'):t('common.connect'),server.connected?'Plugs':'Plug','quiet',`${server.id&&!(connectionState?.oauth==='waiting'||connectionState?.credential==='saving'||connectionState?.pairing)?'':'disabled'} ${permission('run')}`)}</span>
        </div>
        ${ui.account({name:t('common.identity'),role:roleLabel(state.role),initials:'WW'})}
      </header>
      <main id="main" tabindex="-1" class="${baseline.access()&&state.page!=='login'&&data().flow?.enabled&&!['project-flow','project-welcome','projects'].includes(state.page)?'flow-enabled':''}">${baseline.access()&&state.page!=='login'&&data().flow?.enabled&&!['project-flow','project-welcome','projects'].includes(state.page)?flow.bar():''}<div class="flow-content" style="height:100%">${renderStatePage()}</div></main>
      <footer class="statusbar"><span class="inline" title="${escape(currentProject().name)}">${icon('Monitor')}${escape(t('common.designPreview'))} · ${escape(currentProject().name)}</span><span>${escape(t('common.executionTeamServiceNode'))}</span><span class="push">${escape(t('common.privateDraftsSimulatedCalls'))}</span></footer>
    </div>${renderTabMenu()}`;
    baseline.enhance(root);
    const teamNode=root.querySelector('.team-scroll');if(teamNode){teamNode.dataset.context=teamIdentity;if(oldTeamIdentity===teamIdentity&&teamOffset!==undefined)teamNode.scrollTop=teamOffset;}
    const historyScrollNode=root.querySelector('.history-design-scroll,.history-detail-design .run-page-scroll');if(historyScrollNode){historyScrollNode.dataset.scrollIdentity=historyIdentity;if(oldHistoryIdentity===historyIdentity&&historyScroll!==undefined)historyScrollNode.scrollTop=historyScroll;}
    const envNode=root.querySelector('.environment-scroll');if(envNode){const identity=JSON.stringify([state.projectId,activeServer().id,state.profile]);envNode.dataset.context=identity;if(envContext===identity&&envScroll!==undefined)envNode.scrollTop=envScroll;}
    restoreConnectionDraft();
    if(managementScroll!==undefined && root.querySelector('.management-editor-scroll')) root.querySelector('.management-editor-scroll').scrollTop=managementScroll;
    if(executionScroll!==undefined && executionContext===root.querySelector("[data-connection-context]")?.dataset.connectionContext && root.querySelector(".execution-scroll")) root.querySelector(".execution-scroll").scrollTop=executionScroll;
    for(const saved of scrolls){const pane=root.querySelector(`.${saved.kind}-pane`);if(pane?.dataset.debugTab===saved.tab && (saved.kind==='request'||pane.dataset.resultIdentity===saved.run)){const node=pane.querySelector('.pane-scroll');node.scrollLeft=saved.x;node.scrollTop=saved.y;}}
    for(const saved of nativeScrolls){const node=root.querySelectorAll(saved.selector)[saved.index];if(node){node.scrollLeft=saved.x;node.scrollTop=saved.y;}}
    root.dataset.layoutContext=layoutIdentity;
    for(const table of root.querySelectorAll('.table-wrap')){table.tabIndex=0;table.setAttribute('role','region');table.setAttribute('aria-label',t('layout.scrollableTable'));}
    syncRoute();
    positionTabMenu();
    applyIcons(dialog);
    if (!dialog.open && focusId) {const node=document.getElementById(focusId);node?.focus({preventScroll:true});if(node&&selection)node.setSelectionRange(...selection);}
    else if(!dialog.open && nestedIdentity) [...root.querySelectorAll('[data-nested-skip],[data-null-path]')].find(node=>(node.dataset.nestedSkip||node.dataset.nullPath)===nestedIdentity)?.focus({preventScroll:true});
    else if (!dialog.open && focusAction) {
      const replacement = [...root.querySelectorAll('[data-action]')].find(node => node.dataset.action === focusAction && (node.dataset.tab || node.dataset.page || node.dataset.tool || node.dataset.run) === focusIdentity && Object.entries(focusExtra).every(([key,value])=>node.dataset[key]===value));
      replacement?.focus({ preventScroll: true });
    }
  }
  function renderPage() {
    if(['project-flow','project-welcome'].includes(state.page))return flow.render();
    if(['projects','project-editor','project-welcome','members','member-detail','invitation','invitation-detail'].includes(state.page))return team.render(state.page);
    if (state.page === 'tools') return renderTools();
    if (state.page === 'servers') return renderServers();
    if (state.page === 'environment') return renderEnvironment();
    if (state.page === 'history') return renderHistory();
    if (state.page === 'history-detail') return renderHistoryDetail();
    if (state.page === 'saved-detail') return historyView.detail('saved',null,data().selectedSavedId);
    if (state.page === 'record-editor') return records.renderEditor(null);
    if (state.page === 'members') return renderMembers();
    if (['invitation','variable-editor'].includes(state.page)) { const kind=state.page==='invitation' ? 'invitation' : 'variable'; const draft=management.get(state.projectId,kind,{profile:state.profile,serverId:activeServer().id}); const server=kind==='variable' ? data().servers.find(item=>item.id===draft.serverId) || activeServer() : activeServer(); return management.render({projectId:state.projectId,kind,project:currentProject(),projects,server,profile:state.profile,editable:canEdit()}); }
    if (state.page === 'projects') return renderProjects();
    if (state.page === 'login') return renderLogin();
    return '';
  }
  function renderTools() {
    if (!data().servers.length) return `<section class="page"><header class="page-heading"><div><h1>${escape(t('tools.startDebugging'))}</h1><p>${escape(t('common.firstServer',{project:currentProject().name}))}</p></div></header><div class="detail"><h2>${escape(t('tools.noServerConfigured'))}</h2><p class="muted small section-gap">${escape(t('tools.configureAConnectionSelectAnEnvironment'))}</p><div class="section-gap">${button('configure-first-server', t('tools.configureServer'), 'Plus', 'primary', permission('edit'))}</div></div></section>`;
    const server = activeServer();
    const tab = activeTab();
    const filtered = toolSet().filter(tool => `${tool.name} ${tool.description} ${Object.keys(tool.args).join(' ')}`.toLowerCase().includes(state.toolSearch.toLowerCase()));
    const groups = [...new Set(filtered.map(tool => tool.group))];
    const tool = tab ? toolSet().find(item => item.name === tab.tool) : null;
    return `<div class="tools-layout"><aside class="catalog" aria-label="${escape(t('tools.toolCatalog'))}"><div class="catalog-head inline"><span class="catalog-symbol">${icon('Wrench')}</span>${escape(t('common.catalogTitle'))} ${badge(toolSet().length)}${iconButton('refresh-tools', 'ArrowClockwise', t('tools.refreshToolCatalog'), 'class="push"')}</div><div class="catalog-search"><div class="search">${icon('MagnifyingGlass')}<input id="tool-search" aria-label="${escape(t('tools.searchTools'))}" placeholder="${escape(t('tools.searchTools2'))}" value="${escape(state.toolSearch)}"></div></div><div class="tool-list">${groups.map(group => `<div class="list-caption">${icon('FolderSimple')}${escape(t('common.group' + ({'商品':'Products','库存':'Inventory','订单':'Orders','账户':'Account','文档':'Documents'})[group]))}</div>${filtered.filter(item => item.group === group).map(item => `<button type="button" class="tool-item ${tab?.tool === item.name ? 'active' : ''}" data-action="open-tool" data-tool="${item.name}" title="${escape(item.name)}">${icon('Wrench')}<span>${item.name}</span></button>`).join('')}`).join('') || `<div class="state-catalog-empty"><p class="muted small">${escape(t('tools.noMatchingTools'))}</p>${button('clear-tool-search',t('states.clear'),'','quiet')}</div>`}</div><div class="catalog-foot">${escape(server.name)}<br>${escape(t('tools.definitionSnapshot8f72e4c1'))}</div></aside>
      <section class="workspace" aria-label="${escape(t('tools.debugWorkspace'))}"><div class="workspace-tabsbar">${ui.documentTabs({tabs:connectionTabs(),activeId:tab?.id})}</div>
      ${!tab || !tool ? `<div class="tool-heading"><h2>${escape(t('tools.selectATool'))}</h2></div><div class="detail muted">${escape(t('tools.selectAToolFromTheCatalog'))}</div>` : `<div class="tool-heading"><div class="grow"><h1>${tool.name}</h1><p>${escape(tool.name==='preview_order' ? t('debugger.complexTool') : tool.name==='preview_remote_schema'?t('baseline.remoteSchema'):tool.description)}</p></div>${button(tab.workspaceView !== 'debug' ? 'return-debug' : tab.running ? 'cancel-run' : 'execute', tab.workspaceView !== 'debug' ? t('tools.openDebugger') : tab.running ? t('tools.cancelCall') : `${escape(t('tools.run'))} <span class="key">⌘ ↵</span>`, tab.running ? 'Stop' : 'Play', 'primary', tab.workspaceView !== 'debug' ? '' : permission('run'))}</div>
      <nav class="tool-localnav" aria-label="${escape(t('tools.toolPageViews'))}">${button('return-debug', t('tools.debug'), '', '', `aria-current="${tab?.workspaceView === 'debug' ? 'page' : 'false'}" ${tab ? '' : 'disabled'}`)}${button('tool-definition', t('tools.definition'), '', '', `aria-current="${tab?.workspaceView === 'definition' ? 'page' : 'false'}" ${tab ? '' : 'disabled'}`)}${button('tool-history', t('common.history'), '', '', `aria-current="${tab?.workspaceView.startsWith('history') ? 'page' : 'false'}" ${tab ? '' : 'disabled'}`)}${button('tool-saved',t('runs.savedRecords'),'','',`aria-current="${['saved','saved-detail','save-record'].includes(tab.workspaceView) ? 'page' : 'false'}"` )}</nav>${tab.workspaceView === 'saved' ? historyView.collection('saved',tab) : tab.workspaceView === 'saved-detail' ? historyView.detail('saved',tab,tab.savedRecordId) : tab.workspaceView === 'save-record' ? records.renderEditor(tab) : tab.workspaceView === 'definition' ? renderToolDefinition(tab, tool) : tab.workspaceView === 'history' ? renderToolHistory(tab) : tab.workspaceView === 'history-detail' ? renderHistoryDetail(tab) : renderDebugPanes(tab, tool)}`}</section></div>`;
  }
  function renderDebugPanes(tab, tool) {
    return `<div class="debug-content">${debugView.scenarios(tab)}<div class="request-result" style="--request-height:${state.requestWidth}%"><section class="pane request-pane" data-debug-tab="${escape(tab.id)}" aria-label="${escape(t('tools.parameters'))}"><header class="pane-header"><strong>${escape(t('tools.parameters'))}</strong><span class="push segmented" aria-label="${escape(t('tools.parameterEditor'))}">${button('input-form', t('tools.form'), '', '', `aria-pressed="${tab.mode === 'form'}"`)}${button('input-json', t('tools.rawJson'), '', '', `aria-pressed="${tab.mode === 'json'}" ${Object.keys(schemaFor(tool).properties).length ? '' : 'disabled'}`)}</span>${iconButton('format-arguments', 'TextAlignLeft', t('tools.formatParameters'))}${iconButton('expand-request', 'ArrowUpRight', t('tools.expandParameterEditor'))}${button('save-request',escape(t('runs.saveRequest')),'FloppyDisk','quiet',permission('run'))}</header><div class="pane-scroll">${tab.origin ? `<div class="notice section-gap">${icon('ClockCounterClockwise')}<span>${escape(t(!tab.result && !tab.running ? 'common.restoredPending' : 'common.restoredExecuted'))}<br><code>${escape(tab.origin)}</code></span></div>` : ''}${renderParameters(tab, tool)}${tab.mode==='json'&&tab.parameterSubmitted ? `<ul class="parameter-path-errors">${parameters.validation(tab,tool)}</ul>` : ''}${tab.error ? `<p id="arguments-error" class="error small section-gap" role="alert">${escape(tab.error)}</p>` : ''}</div><footer class="pane-footer inline">${icon('ShieldCheck')}${escape(t('common.parameterValidation'))}</footer></section>
      <div class="splitter" role="separator" aria-label="${escape(t('tools.resizeParametersAndResponse'))}" aria-orientation="horizontal" aria-valuemin="30" aria-valuemax="65" aria-valuenow="${state.requestWidth}" tabindex="0"></div>
      <section class="pane result-pane" data-debug-tab="${escape(tab.id)}" data-result-identity="${escape((tab.result?.id||'')+':'+tab.resultView)}" aria-label="${escape(t('tools.response'))}"><header class="pane-header">${renderResultStatus(tab)}${button('save-call-record',escape(t('runs.saveRecord')),'FloppyDisk','quiet',`${tab.result && !tab.running ? '' : 'disabled'} ${permission('run')}`)}${iconButton('copy-response', 'Copy', t('tools.copyResponse'), !tab.result?.response ? 'disabled' : '')}${iconButton('reset-layout', 'Columns', t('tools.resetLayout'))}</header>${renderResultTabs(tab)}<div class="pane-scroll">${renderResult(tab)}</div><footer class="pane-footer">${tab.result ? `<span class="mono">${escape(tab.result.id)}</span> · ${escape(tab.result.actor)} · ${escape(profileLabel(tab.result.profile))}` : t('tools.runToViewTheResponseTiming')}</footer></section></div></div>`;
  }
  function renderToolDefinition(tab, tool) {
    return `<section class="definition-page" aria-label="${escape(t('tools.toolDefinitionPage'))}"><div class="definition-heading"><h2>${escape(t('tools.toolDefinition'))}</h2><span class="definition-caption">${escape(t('tools.serverDefinitionSnapshot8f72e4c1Example'))}</span></div><div class="definition-grid"><section class="definition-section"><h3>${escape(t('tools.overview'))}</h3><dl class="metadata section-gap"><dt>${escape(t('tools.name'))}</dt><dd><code>${escape(tool.name)}</code></dd><dt>${escape(t('tools.description'))}</dt><dd>${escape(tool.name==='preview_order' ? t('debugger.complexTool') : tool.name==='preview_remote_schema'?t('baseline.remoteSchema'):tool.description)}</dd><dt>Server</dt><dd>${escape(activeServer().name)}</dd><dt>${escape(t('tools.connectionId'))}</dt><dd><code>${escape(tab.serverId)}</code></dd></dl><div class="notice">${icon('Info')}${escape(t('tools.viewingTheDefinitionPreservesYourDraft'))}</div></section><section class="definition-section"><h3>${escape(t('tools.inputSchema'))}</h3><div class="section-gap">${jsonView(schemaFor(tool))}</div></section></div></section>`;
  }
  function renderParameters(tab, tool) {
    if (tab.mode === 'json') return `<label class="small muted" for="raw-arguments">${escape(t('common.jsonObject'))}</label><textarea id="raw-arguments" class="code-editor" spellcheck="false" aria-describedby="${tab.error ? 'arguments-error' : 'json-hint'}">${escape(tab.raw)}</textarea><p id="json-hint" class="small muted section-gap">${escape(t('tools.bothEditorsShareTheSameParameters'))}</p>`;
    return parameters.render(tab,tool);
  }
  function schemaFor(tool) { return window.workbenchParameters.schemaFor(tool); }
  function renderResultStatus(tab) {
    if (tab.running) return `<span class="result-status grow">${escape(t('tools.running'))}<span class="tag accent">${escape(t('tools.simulation'))}</span></span>`;
    if (!tab.result) return `<strong class="grow">${escape(t('tools.response'))}</strong><span class="muted small">${escape(t('tools.notExecuted'))}</span>`;
    const [title, style, glyph] = tab.result.status === 'succeeded' ? [t('tools.success'), 'success', 'CheckCircle'] : tab.result.status === 'failed' ? [t('tools.failed'), 'error', 'WarningCircle'] : [t('tools.cancelled'), 'muted', 'StopCircle'];
    return `<span class="result-status grow ${style}">${icon(glyph)}<strong>${title}</strong><span class="muted mono">${tab.result.duration} ms</span><span class="muted small">${escape(t('tools.example'))}</span></span>`;
  }
  function renderResultTabs(tab) {
    return `<div class="result-tabbar" aria-label="${escape(t('tools.responseViews'))}">${button('result-view', t('tools.result'), '', '', `data-view="result" aria-pressed="${tab.resultView === 'result'}"`)}${button('result-view', t('tools.rawJson'), '', '', `data-view="json" aria-pressed="${tab.resultView === 'json'}"`)}${button('result-view', t('tools.callDetails'), '', '', `data-view="details" aria-pressed="${tab.resultView === 'details'}"`)}</div>`;
  }
  function renderResult(tab) {
    if (tab.running) return debugView.running(tab,debuggerModel.elapsed(tab));
    if (!tab.result) return `<div class="empty-result"><strong>${escape(t('tools.readyToRun'))}</strong>${escape(t('tools.theResponseWillAppearHere'))}<br>${escape(t('tools.viewHttpRpcAndEnvironmentSources'))}</div><details open><summary>${escape(t('tools.responseContent'))}</summary><p class="small muted details-body">${escape(t('tools.noResponseYet'))}</p></details>`;
    return `${draftNotice(tab)}${debugView.recording(tab.result)}${tab.result.status!=='succeeded' ? debugView.error(tab.result) : ''}${tab.resultView==='details' ? renderRunDetails(tab.result) : `<div class="result-subhead"><strong>${t('tools.responseContent')}</strong>${badge(tab.resultView==='json' ? 'JSON' : t('tools.contentPreview'))}</div>${tab.result.response===null ? `<p class="small muted">${escape(t('debugger.localOnly'))}</p>` : tab.resultView==='json' ? jsonView(tab.result.response) : tab.result.status!=='succeeded' ? jsonView(tab.result.response) : renderResponseContent(tab.result)}<details class="section-gap"><summary>${escape(t('tools.rawMcpResponse'))}</summary>${tab.result.protocol===null ? `<p class="small muted details-body">${escape(t('debugger.localOnly'))}</p>` : jsonView(tab.result.protocol || {structuredContent:tab.result.response,isError:tab.result.status==='failed'})}</details>`}`;
  }
  function draftNotice(tab) {
    return tab.result && (tab.result.version || 0) !== tab.version ? `<div class="notice warning draft-notice">${escape(t('tools.parametersChangedThePreviousResponseStays'))}</div>` : '';
  }
  function markDraftChanged(tab) {
    tab.version += 1;
    const resultPane = root.querySelector('.result-pane .pane-scroll');
    if (state.page === 'tools' && tab.result && resultPane && !resultPane.querySelector('.draft-notice')) resultPane.insertAdjacentHTML('afterbegin', draftNotice(tab));
  }
  function renderResponseContent(run) {
    const value = run.response;
    if(run.status!=='succeeded')return `${debugView.error(run,false)}${value===null ? `<p class="small muted">${escape(t('debugger.localOnly'))}</p>` : jsonView(value)}`;
    if(!value || !Array.isArray(value.products))return jsonView(value);
    return `<div class="response-summary"><div><span class="response-check">${icon('CheckCircle')}</span><strong>${escape(t('common.productsReturned',{count:value.products.length}))}</strong></div><span>${escape(t('tools.readOnlyContentExampleResponse'))}</span></div><div class="table-wrap response-table"><table><thead><tr><th>${escape(t('tools.productId'))}</th><th>${escape(t('tools.price'))}</th><th>${escape(t('tools.availableStock'))}</th></tr></thead><tbody>${value.products.map((product,index) => `<tr><td><div class="inline"><span class="product-symbol ${index ? 'alternate' : ''}">${icon('Columns')}</span><div><strong>${escape(product.name)}</strong><small class="mono">${escape(product.id)}</small></div></div></td><td class="mono">${escape(product.currency)} ${escape(product.price)}</td><td>${badge(t('common.stockCount',{count:product.stock}), 'success')}</td></tr>`).join('')}</tbody></table></div><div class="response-caption"><span>total: ${escape(value.total)}</span><span>has_more: ${escape(value.has_more)}</span></div><div class="notice section-gap">${icon('Info')}${escape(t('tools.thisTableDisplaysAStructuredArray'))}</div>`;
  }
  function renderRunDetails(run) {
    const server = data().servers.find(item => item.id === run.serverId);
    return `<dl class="metadata"><dt>${escape(t('runs.actor'))}</dt><dd>${escape(run.actor)}</dd><dt>Server</dt><dd>${escape(server?.name || t('runs.originalServerIsUnavailable'))}</dd><dt>${escape(t('runs.environment'))}</dt><dd>${escape(profileLabel(run.profile))} · revision ${run.configRevision||3}</dd><dt>${escape(t('runs.credentialIdentity'))}</dt><dd>${escape(t(run.credentialSource?'connection.'+run.credentialSource:'runs.projectServiceAccountCredentialReferenceOnly'))}</dd><dt>${escape(t('runs.toolSnapshot'))}</dt><dd><code>8f72e4c1</code></dd><dt>${escape(t('runs.executionMethod'))}</dt><dd>${escape(t(run.executionSource==='browser'?'execution.browser':'execution.agent'))} · ${run.transport==='stdio'?'stdio':'HTTP'}</dd></dl>${run.transport==='stdio'?`<details open><summary>stdio</summary><pre>${escape(run.command||'')}\n${escape(t('connection.envHint'))}</pre></details>`:`<details open><summary>HTTP</summary><pre>POST ${escape(run.endpoint || server?.url || '')}\nContent-Type: application/json\nAuthorization: [REDACTED]\n\n${run.httpStatus===null ? escape(t('debugger.unknown')) : run.httpStatus ? String(run.httpStatus)+(run.httpStatus===401 ? ' Unauthorized' : ' OK') : run.status==='failed' ? '401 Unauthorized' : run.status==='cancelled' ? escape(t('debugger.unknown')) : '200 OK'}</pre></details>`}<details><summary>${escape(t('runs.rpcSendReceive'))}</summary>${jsonView({ jsonrpc: '2.0', id: run.id, method: 'tools/call', params: { name: run.tool, arguments: run.arguments } })}${run.protocol ? jsonView(run.protocol) : ''}</details><details><summary>${escape(t('runs.timeline'))}</summary><div class="details-body small"><p>${escape(t('runs.01InputValidated'))}</p><p>${escape(t('runs.02EnvironmentAndCredentialsResolved'))}</p><p>${escape(t('runs.03BackendSentToolRequest'))}</p><p>04　${run.status==='cancelled' ? t('debugger.stopped') : ['networkError','timeout'].includes(run.errorKind) ? t('debugger.unknown') : t('debugger.received')}<p>05　${escape(t('debugger.'+(run.storageStatus||'recorded')))}</p></p></div></details>`;
  }
  function renderServers() {
    if(!data().servers.length)return `<section class="page management-page">${ui.pageHeading({title:t('common.servers'),description:t('common.firstServer',{project:currentProject().name}),glyph:'HardDrives',actions:button('connection-new',t('connection.new'),'Plus','primary',permission('edit'))})}<div class="detail"><h2>${escape(t('tools.noServerConfigured'))}</h2><p class="small muted">${escape(t('connection.idleHint'))}</p></div></section>`;
    return execution.render({projectId:state.projectId,server:selectedConfigServer(),servers:data().servers,editable:canEdit(),runnable:canRun(),view:state.serverView,references:environments.resolved(environmentContext(selectedConfigServer(),execution.get(state.projectId,selectedConfigServer()).profile)).filter(row=>row.secret).map(row=>row.name)});
  }
  function renderEnvironment() { return environments.render(environmentContext()); }
  function renderHistory() {return historyView.collection(data().recordsView==='saved'?'saved':'calls',null);}
  function renderHistoryDetail(tab) {return historyView.detail('calls',tab,tab?tab.historyRunId:data().selectedRunId);}
  function renderMembers() {
    const pending=invitations.filter(item=>item.status==='待接受').length;
    return `<section class="page management-page members-page"><div>${ui.pageHeading({title:t('common.teamMembers'),description:t('management.membersDescription'),glyph:'Users',actions:button('invite-member',t('common.inviteMember'),'UserPlus','primary',permission('edit'))})}<nav class="tabnav management-page-tabs" aria-label="${escape(t('common.memberManagementViews'))}">${[['members',t('common.membersCount',{count:members.length})],['invitations',t('common.invitesCount',{count:pending})]].map(([view,label])=>`<button type="button" data-action="members-view" data-view="${view}" aria-pressed="${state.membersView===view}">${escape(label)}</button>`).join('')}</nav></div><div class="settings-page"><div class="list-toolbar"><span>${escape(t('management.teamContext',{count:members.length}))}</span><span class="push muted">${escape(state.membersView==='members' ? t('management.projectContext',{project:currentProject().name}) : t('management.pendingInvites',{count:pending}))}</span></div>${state.membersView==='members' ? `<div class="table-wrap"><table class="member-table"><thead><tr><th>${escape(t('common.members'))}</th><th>${escape(t('common.teamRole'))}</th><th>${escape(t('common.projectRole'))}</th><th>${escape(t('runs.status'))}</th><th class="table-actions">${escape(t('environment.actions'))}</th></tr></thead><tbody>${members.map(member=>`<tr><td><div class="inline member-identity"><span class="avatar">${escape(member.initials)}</span><div><strong>${escape(member.name)}</strong><p class="small muted">${escape(member.email)}</p></div></div></td><td>${badge(roleLabel(member.teamRole))}</td><td>${badge(roleLabel(member.projectRole),'accent')}</td><td><span class="inline success"><i class="dot"></i>${escape(statusLabel(member.status))}</span></td><td class="table-actions">${button('member-permissions',t('common.viewPermissions'),'','quiet',`data-email="${escape(member.email)}"`)}</td></tr>`).join('')}</tbody></table></div><div class="management-inline-help">${icon('Info')}<p>${escape(t('management.memberHint'))}</p></div><div class="management-inline-help">${icon('LockKey')}<p>${escape(t('common.projectConfigurationAndHistoryAreShared'))}</p></div>` : `<div class="table-wrap"><table class="invitation-table"><thead><tr><th>${escape(t('common.inviteeEmail'))}</th><th>${escape(t('common.teamRole'))}</th><th>${escape(t('common.initialProjectRole'))}</th><th>${escape(t('runs.status'))}</th><th>${escape(t('common.expires'))}</th><th class="table-actions">${escape(t('environment.actions'))}</th></tr></thead><tbody>${invitations.map(invite=>`<tr><td><strong>${escape(invite.email)}</strong></td><td>${badge(roleLabel(invite.teamRole))}</td><td><strong class="table-project">${escape(invite.project)}</strong><span class="small muted">${escape(roleLabel(invite.projectRole))}</span></td><td>${badge(statusLabel(invite.status),invite.status==='待接受' ? 'warning' : '')}</td><td class="mono muted">${escape(invite.expires)}</td><td class="table-actions">${invite.status==='待接受' ? button('revoke-invite',t('common.revoke'),'','quiet danger',`data-invite="${invite.id}" ${permission('edit')}`) : '—'}</td></tr>`).join('')}</tbody></table></div><div class="management-inline-help">${icon('Info')}<p>${escape(t('common.onlyTheSignedInUserWith'))}</p></div>`}</div></section>`;
  }
  function renderProjects() {
    return `<section class="page"><header class="page-heading"><div class="grow"><h1>${escape(t('common.teamsAndProjects'))}</h1><p>${escape(t('common.switchProjectsWithinEngineeringServersVariables'))}</p></div>${button('new-project', t('common.createProject'), 'Plus', 'primary', permission('edit'))}</header><div class="settings-page"><div class="toolbar"><h3>${escape(t('common.engineering'))}</h3>${badge('Owner')}<span class="small muted">${members.length} ${escape(t('common.members2'))}</span>${button('members', t('common.manageMembers'), 'Users', 'quiet push')}</div><div class="section-label">${escape(t('common.project'))}</div>${projects.map(project => `<div class="project-row"><span class="project-glyph">${icon('Stack')}</span><div class="grow"><h3>${escape(project.name)} ${state.projectId === project.id ? badge(t('common.selected'), 'accent') : ''}</h3><p>${escape(project.description)}</p><p style="margin-top:8px">${dataByProject[project.id]?.servers.length || 0} ${escape(t('common.servers2'))} ${project.members} ${escape(t('common.projectMembers'))}</p></div>${button('switch-project', state.projectId === project.id ? t('common.openWorkspace') : t('common.switchProject'), 'ArrowUpRight', '', `data-project="${project.id}"`)}</div>`).join('')}<div class="notice section-gap">${icon('ShieldCheck')}<span>${escape(t('common.projectsAreFilteredByTeamAnd'))}</span></div></div></section>`;
  }
  function renderLogin() { return baseline.authPage(); }
  function legacyRenderLogin() {
    return `<section class="login-preview"><div class="login-content"><div class="brand"><span class="brandmark">M</span>MCP Inspector</div><h1>${escape(t('common.signInToYourWorkspace'))}</h1><p class="muted">${escape(t('common.useYourEnterpriseIdentityToAccess'))}</p>${button('login-demo', t('common.signInWithEnterpriseAccount'), 'ArrowUpRight', 'primary')}<p class="small muted section-gap">${escape(t('common.selfHostedEnterpriseOidcInvitationOnly'))}</p><div class="notice">${icon('Info')}<span>${escape(t('common.thisIsASignInPreview'))}</span></div><button type="button" class="btn quiet login-back" data-action="invite-accept-preview">${escape(t('common.previewInvitationAcceptance'))}</button></div></section>`;
  }
  function applyIcons(container) {
    container.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  }
  let dialogTrigger = null;
  function showDialog(title, description, body, action = '', actionTitle = t('common.save')) {
    dialogTrigger = document.activeElement;
    dialog.innerHTML = `<form id="dialog-form"><header class="dialog-head"><div class="grow"><h2 id="dialog-title">${escape(title)}</h2><p>${escape(description)}</p></div>${iconButton('close-dialog', 'X', t('common.closeDialog'))}</header><div class="dialog-body">${body}</div><footer class="dialog-actions">${button('close-dialog', t('common.cancel'), '', 'quiet')}${action ? `<button type="submit" class="btn primary" data-submit="${action}">${actionTitle}</button>` : ''}</footer></form>`;
    dialog.showModal();
    dialog.querySelector('input:not([type="hidden"]), select, textarea')?.focus();
  }
  dialog.addEventListener('close', () => {
    if (dialogTrigger?.isConnected) dialogTrigger.focus();
  });
  function closeDialog() { dialog.close(); }
  function variableDialog(variable) {
    if(!canEdit()) return;
    management.start(state.projectId,'variable',{variable,profile:state.profile,serverId:activeServer().id});
    state.page='variable-editor'; render(); document.getElementById('variable-name')?.focus({preventScroll:true});
  }
  function syncRaw(tab) {
    if (tab.mode !== 'json') return true;
    try {
      const value = JSON.parse(tab.raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
      tab.arguments = value;
      tab.arrayDrafts={};tab.parameterErrors={};tab.parameterTouched=Object.fromEntries(Object.keys(value).map(key=>[key,true]));
      tab.error = '';
      return true;
    } catch {
      tab.error = t('common.enterAValidJsonObjectYour');
      return false;
    }
  }
  function execute() {
    const tab=activeTab();
    if(!tab || tab.running || !canRun() || tab.workspaceView!=='debug')return;
    const blocked=baseline.blockReason(tab);if(blocked){tab.error=t('baseline.'+blocked);render();return;}
    if(!activeServer().connected) {tab.error=t('common.theServerIsDisconnectedConnectYour');render();return;}
    if(environments.issues(environmentContext(activeServer(),activeServer().profile)).length){tab.error=t('env.blocked');render();return;}
    tab.parameterSubmitted=true;tab.parameterQuietPaths=[];
    if(Object.keys(tab.parameterErrors).length || !syncRaw(tab)) {tab.error=tab.error||t('parameters.validationSummary');render();document.querySelector('.parameter-control [aria-invalid="true"]')?.focus();return;}
    const tool=toolSet().find(item=>item.name===tab.tool);
    if(parameters.issues(tab,tool).length) {tab.error=t('parameters.validationSummary');render();document.querySelector('.parameter-control [aria-invalid="true"],#raw-arguments')?.focus();return;}
    const requestLimit=baseline.blockReason(tab);if(requestLimit){tab.error=t('baseline.'+requestLimit);render();return;}
    debuggerModel.start(tab,{id:`${state.projectId}-run-${++sequence}`,projectId:state.projectId,project:data(),actor:'吴伟',ownerId:'user-wuwei',profile:activeServer().profile,source:execution.settings(state.projectId,activeServer()).channel==='browser'?'browser':'local-agent',endpoint:activeServer().url,transport:execution.settings(state.projectId,activeServer()).transport,command:execution.settings(state.projectId,activeServer()).command,configRevision:execution.get(state.projectId,activeServer()).revision,credentialSource:activeServer().auth==='none'?'none':activeServer().auth==='oauth'?'oauth':execution.get(state.projectId,activeServer()).source});
  }
  function changeProject(projectId) {
    team.cancelPending();
    baseline.switchProject(projectId); state.page = 'tools'; state.serverView='connection'; state.toolSearch = ''; state.historySearch = ''; state.historyStatus = 'all'; state.historyServer = 'all'; state.profile = activeServer().profile;
    render();
  }
  function chooseServer(serverId) {
    if(!data().servers.some(server=>server.id===serverId))return;
    const project = data(); project.activeServerId = serverId;if(state.page==='servers')project.selectedServerId=serverId;
    const tab = project.tabs.find(item => item.id === project.activeTabId && item.serverId === serverId) || project.tabs.find(item => item.serverId === serverId);
    if (!tab) { const created = makeTab(toolSet()[0], serverId); project.tabs.push(created); project.activeTabId = created.id; }
    else project.activeTabId = tab.id;
    state.toolSearch = ''; render();
  }
  function toggleConnection(serverId) {
    if (!canRun()) return;
    const server = data().servers.find(item => item.id === serverId);
    if (!server) return;
    if (data().tabs.some(tab => tab.serverId === serverId && tab.running)) { notify(t('common.cancelTheRunningSimulationFirst')); return; }
    execution.toggle(state.projectId,server); if(execution.get(state.projectId,server).error==='environmentMissing'){const context=environmentContext(server,server.profile);environments.view(context).scope='validation';environments.view(context).message='blocked';if(state.page==='environment')state.profile=server.profile;notify(t('env.blocked'));} render();
  }
  document.addEventListener('click', async event => {
    const element = event.target.closest('[data-action]');
    if (!element || element.disabled) { if(state.tabMenu && !event.target.closest('#tab-action-menu')) closeTabMenu(false); return; }
    const action = element.dataset.action;
    if(action==='team-fix-account'){baseline.invitationLogin();render();return;}
    if(baseline.action(action,element)){render();return;}
    if(action==='state-projects'){states.set('ready');state.page='projects';render();return;}
    if(action==='state-back'){states.set('ready');if(state.page==='saved-detail')data().recordsView='saved';if(state.page==='tools'&&activeTab()){activeTab().workspaceView=activeTab().workspaceView.startsWith('saved')?'saved':'history';render();return;}state.page=['history-detail','saved-detail','record-editor'].includes(state.page)?'history':['member-detail','invitation-detail','invitation'].includes(state.page)?'members':['servers','environment','history','members','projects'].includes(state.page)?state.page:'projects';render();return;}
    if(action==='state-debug'){states.set('ready');state.page='tools';if(activeTab())activeTab().workspaceView='debug';render();return;}
    if(action==='state-server'){states.set('ready');state.page='servers';render();return;}
    if(action==='clear-tool-search'){state.toolSearch='';render();root.querySelector('#tool-search')?.focus();return;}
    if(states.action(action)){render();root.querySelector('#state-scenario')?.focus({preventScroll:true});return;}
    if(states.get().kind==='empty'&&action===stateContext().emptyAction)states.set('ready');
    if(!action.startsWith('env-'))environments.conceal();
    const tab = activeTab();
    if(action==='flow-project-overview'){if(dataByProject[element.dataset.project]){changeProject(element.dataset.project);data().flow||={};data().flow.enabled=true;state.page='project-flow';render();}return;}
    if(action==='flow-overview'){data().flow||={};data().flow.enabled=true;state.page='project-flow';render();return;}
    if(action==='flow-projects'){state.page='projects';render();return;}
    if(action==='flow-step'){flowStep(element.dataset.step);render();return;}
    if(action==='flow-skip-invite'){data().flow.skipInvite=true;render();return;}
    if(action==='flow-no-variables'){if(!flowContext().requirements.length)data().flow.noVariablesFor=activeServer().id;render();return;}
    if(['select-run','select-tool-run'].includes(action)&&data().history.some(r=>r.id===element.dataset.run)){data().flow||={};data().flow.reviewedRunId=element.dataset.run;}
    if(action==='team-configure'){state.page='servers';render();return;}
    if(team.action(action,element)){render();root.querySelector('.team-page [aria-invalid="true"]')?.focus({preventScroll:true});return;}
    if(action==='new-project'){team.action('team-new-project');render();return;}
    if(action==='invite-member'){team.action('team-new-invite');render();return;}
    if(action==='invite-accept-preview'){closeDialog();team.setSelected('team-invite-1');team.setRecipient(true);state.page='invitation-detail';render();return;}
    if(['navigate','projects','members','switch-project'].includes(action))team.cancelPending();
    if(action==='history-copy'){const scoped=recordContextTab(),value=historyView.copy(element.dataset.kind,element.dataset.record,element.dataset.part,scoped);if(value!==null){const detail=historyView.detailState(element.dataset.kind,element.dataset.record,scoped);try{await navigator.clipboard.writeText(value);detail.message='copied';}catch{detail.message='copyFailed';}render();}return;}
    const historyAction=historyView.action(action,element,recordContextTab());if(historyAction){if(historyAction==='deleted'){if(recordContextTab())recordContextTab().workspaceView='saved';else{data().recordsView='saved';state.page='history';}}render();if(action==='history-redact')document.getElementById('history-redaction-paths')?.focus({preventScroll:true});return;}
    if (environments.action(action,element,environmentContext())) {render();if(['env-inspect','env-save'].includes(action))root.querySelector('.env-inspector')?.scrollIntoView({block:'nearest'});if(['env-new','env-edit','env-override','env-fix'].includes(action))document.getElementById('env-name')?.focus({preventScroll:true});if(action==='env-save')root.querySelector('.env-page [aria-invalid="true"]')?.focus({preventScroll:true});return;}
    if (['execution-settings','connection-settings','authorization-settings'].includes(action)) {state.serverView=action==='execution-settings'?'execution':action==='authorization-settings'?'authorization':'connection';render();return;}
    if(action==='connection-new' && canEdit()){const server={id:`${state.projectId}-connection-${++sequence}`,name:t('connection.newName'),url:'',auth:'none',connected:false,profile:'开发环境',timeout:30,credential:'无需凭据'};data().servers.push(server);data().selectedServerId=server.id;state.serverView='connection';const draft=execution.get(state.projectId,server);Object.assign(draft,{headerName:'',headerRef:'',reference:'MCP_TOKEN',dirty:true});Object.assign(draft.savedConfig,{headerName:'',headerRef:''});if(!data().activeServerId){data().activeServerId=server.id;state.profile=server.profile;}render();return;}
    if(action==='connection-toggle' && data().tabs.some(item=>item.serverId===selectedConfigServer().id&&item.running)){notify(t('common.cancelTheRunningSimulationFirst'));return;}
    if(action==='connection-agent-offline'&&execution.settings(state.projectId,selectedConfigServer()).channel==='agent'){for(const item of data().tabs.filter(item=>item.serverId===selectedConfigServer().id&&item.running))debuggerModel.failConnection(item);}
    if (execution.action(action,state.projectId,selectedConfigServer(),canEdit(),canRun())) {render();if(action==='connection-save'){const invalid=root.querySelector('.connection-page [aria-invalid="true"]');invalid?.focus({preventScroll:true});invalid?.scrollIntoView({block:'nearest'});}return;}
    if (action === 'tab-menu') { openTabMenu(element.dataset.tab); return; }
    if (action.startsWith('tab-command-')) { await runTabCommand(action,element.dataset.tab); return; }
    if (state.tabMenu) closeTabMenu(false);
    if(action === 'toggle-sidebar') { toggleSidebar(); return; }
    if(action === 'toggle-theme') { toggleTheme(); return; }
    if(action.startsWith('parameter-') && tab) {const handled=parameters.action(action,element,tab,toolSet().find(item=>item.name===tab.tool));if(handled==='changed')markDraftChanged(tab);if(handled && handled!=='focus')render();}
    else if (action === 'tool-saved' && tab) { tab.workspaceView='saved'; render(); }
    else if (action === 'save-request' && tab && canRun()) {
      if(Object.keys(tab.parameterErrors).length||!syncRaw(tab)) {tab.error=tab.error||t('common.enterAValidJsonObjectYour');render();return;}
      const incomplete=Boolean(Object.keys(tab.parameterErrors).length||parameters.issues(tab,toolSet().find(item=>item.name===tab.tool)).length);
      beginRecordSave({incomplete,tool:tab.tool,serverId:tab.serverId,profile:activeServer().profile,arguments:tab.arguments,response:null,hasResponse:false,sourceRunId:null},tab);
    }
    else if ((action==='save-call-record' || action==='save-history-record') && canRun()) {
      const source=action==='save-call-record' ? tab?.result : data().history.find(run=>run.id===element.dataset.run);
      if(source && (state.page!=='tools' || source.serverId===tab?.serverId && source.tool===tab?.tool)) beginRecordSave({...source,hasResponse:source.hasResponse??(source.status==='succeeded'||source.response!==null),sourceRunId:source.id},recordContextTab());
    }
    else if (action==='records-global-view') { data().recordsView=element.dataset.view==='saved' ? 'saved' : 'calls'; state.page='history'; render(); }
    else if (action==='records-select') {
      const scoped=recordContextTab();
      if(records.scopedRecords(scoped).some(record=>record.id===element.dataset.record)) { if(scoped) { scoped.savedRecordId=element.dataset.record; scoped.workspaceView='saved-detail'; } else { data().selectedSavedId=element.dataset.record; state.page='saved-detail'; } render(); }
    }
    else if (action==='records-back' || action==='records-cancel') {
      const scoped=recordContextTab();
      if(scoped) scoped.workspaceView=action==='records-cancel' ? scoped.recordDraft?.returnView || 'debug' : 'saved';
      else { data().recordsView='saved'; state.page=action==='records-cancel' ? data().recordDraft?.returnPage || 'saved-detail' : 'history'; } render();
    }
    else if (action==='records-edit') { const scoped=recordContextTab(); const returnPage=state.page; if(records.edit(scoped,element.dataset.record)) { if(!scoped) { data().recordDraft.returnPage=returnPage; state.page='record-editor'; } render(); } }
    else if (action==='records-submit') { const scoped=recordContextTab(); if(records.submit(scoped) && !scoped)state.page='saved-detail'; render();document.getElementById('record-name')?.focus({preventScroll:true}); }
    else if (action==='records-load') records.load(recordContextTab(),element.dataset.record);
    else if (action==='records-source') {
      const scoped=recordContextTab(); const record=records.scopedRecords(scoped).find(item=>item.id===element.dataset.record);
      if(record && data().history.some(run=>run.id===record.sourceRunId && run.serverId===record.serverId && run.tool===record.tool)) { if(scoped) { scoped.historyRunId=record.sourceRunId; scoped.workspaceView='history-detail'; } else { data().selectedRunId=record.sourceRunId; state.page='history-detail'; } render(); }
    }
    else if (action === 'navigate') { state.page = element.dataset.page; render(); }
    else if (action === 'configure-first-server') { state.page = 'servers'; render(); }
    else if (action === 'projects' || action === 'members') { state.page = action; render(); }
    else if (action === 'management-back') { const kind=state.page==='invitation' ? 'invitation' : 'variable'; management.clear(state.projectId,kind); state.page=kind==='invitation' ? 'members' : 'environment'; render(); }
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'manage-environment') {const server=state.page==='servers'?selectedConfigServer():activeServer();if(state.page==='servers'&&server.id)chooseServer(server.id);state.profile=server.profile;state.page='environment';environments.view(environmentContext()).scope='validation';render();}
    else if (action === 'open-authentication') {const server=state.page==='servers'?selectedConfigServer():activeServer();if(server.id){state.serverView='authorization';state.page='servers';data().selectedServerId=server.id;render();}}
    else if (action === 'toggle-connection') toggleConnection((state.page==='servers'?selectedConfigServer():activeServer()).id);
    else if (action === 'toggle-config-connection') toggleConnection(element.dataset.server);
    else if (action === 'open-tool') {
      const existing = data().tabs.find(item => item.tool === element.dataset.tool && item.serverId === activeServer().id);
      if (existing) data().activeTabId = existing.id;
      else { const created = makeTab(toolSet().find(tool => tool.name === element.dataset.tool), activeServer().id); data().tabs.push(created); data().activeTabId = created.id; }
      render();
    }
    else if (action === 'select-tab') { data().activeTabId = element.dataset.tab; render(); }
    else if (action === 'close-tab') { closeTabs([element.dataset.tab]); render(); }
    else if (action === 'duplicate-tab' && tab) { duplicateTab(tab); render(); }
    else if (action === 'input-form' && tab) { if (tab.mode === 'json' && syncRaw(tab)) { tab.mode = 'form'; tab.arrayDrafts = {}; tab.parameterErrors = {}; } render(); }
    else if (action === 'input-json' && tab) { if (Object.keys(tab.parameterErrors).length) tab.error = t('common.fixTheArrayJsonFirstYour'); else if (tab.mode !== 'json') { tab.raw = JSON.stringify(tab.arguments, null, 2); tab.mode = 'json'; } render(); }
    else if (action === 'format-arguments' && tab) { if (syncRaw(tab)) tab.raw = JSON.stringify(tab.arguments, null, 2); render(); }
    else if (action === 'execute') execute();
    else if(action==='cancel-run' && tab && canRun()) debuggerModel.cancel(tab);
    else if(action==='debug-finish' && tab && canRun()) debuggerModel.finish(tab);
    else if(action==='retry-history-upload' && canRun()) {const run=data().history.find(item=>item.id===element.dataset.run);if(run && canRetry(run) && ['failed','pending'].includes(run.storageStatus))debuggerModel.retry(run);}
    else if(action==='debug-reconnect' && canRun()) {const run=data().history.find(item=>item.id===element.dataset.run);if(run){run.uploadAvailable=true;render();}}
    else if(action==='debug-connection' && tab) {data().selectedServerId=tab.serverId;state.page='servers';state.serverView='connection';render();}
    else if (action === 'result-view' && tab) { tab.resultView = element.dataset.view; render(); }
    else if (action === 'reset-layout') { state.requestWidth = 52; render(); }
    else if (action === 'expand-request') { state.requestWidth = 65; render(); }
    else if (action === 'copy-response' && tab?.result?.response) {
      try { await navigator.clipboard.writeText(JSON.stringify(window.workbenchRedaction.prepare(tab.result).value.response, null, 2)); notify(t('common.exampleResponseCopied')); }
      catch { tab.resultView = 'json'; render(); notify(t('common.clipboardIsUnavailableSelectAndCopy')); }
    }
    else if (action === 'tool-definition' && tab) { tab.workspaceView = tab.workspaceView === 'definition' ? 'debug' : 'definition'; render(); }
    else if (action === 'return-debug' && tab) { tab.workspaceView = 'debug'; render(); }
    else if (action === 'tool-history' && tab) { tab.workspaceView='history'; render(); }
    else if (action === 'select-tool-run' && tab) { if(toolRuns(tab).some(run=>run.id===element.dataset.run)) { tab.historyRunId=element.dataset.run; tab.workspaceView='history-detail'; render(); } }
    else if (action === 'back-tool-history' && tab) { tab.workspaceView='history'; render(); }
    else if (action === 'refresh-tools') notify(t('common.exampleCatalogRefreshedToolDraftsAre'));
    else if (action === 'select-server-config') { captureConnectionDraft();data().selectedServerId = element.dataset.server; render(); }
    else if (action === 'open-config-tools') { chooseServer(element.dataset.server); state.page = 'tools'; render(); }
    else if (action === 'save-server') saveServer();
    else if (action === 'export-server') {
      const server = data().servers.find(item => item.id === data().selectedServerId) || activeServer();
      showDialog(t('common.safeConfigurationPreview'), t('common.theExampleExportExcludesTokensOauth'), jsonView({ version: 1, server: { name: server.name, url: server.url, transport: 'streamable-http', authMode: server.auth, profile: server.profile }, credentialsIncluded: false }));
    }
    else if (action === 'new-server') showDialog(t('servers.addServer'), t('common.createAProjectConnectionConfigurationThen'), `<div class="fields">${field('new-server-name', `${escape(t('tools.name'))} <span class="required">*</span>`, '', '', 'required data-full')}${field('new-server-url', 'MCP endpoint <span class="required">*</span>', '', t('common.theEndpointMustBeReachableFrom'), 'required data-full type="url" placeholder="https://mcp.example/mcp"')}</div>`, 'create-server', t('common.createServer'));
    else if (action === 'authorize-preview') {state.serverView='authorization';render();}
    else if (action === 'select-profile') { state.profile = element.dataset.profile; render(); }
    else if (action === 'env-scope') { state.envScope = element.dataset.scope; render(); }
    else if (action === 'use-profile') { if (!activeServer().connected && canRun()) { activeServer().profile = state.profile; render(); notify(t('common.environmentSelectedForTheExampleSession')); } }
    else if (action === 'new-variable') variableDialog();
    else if (action === 'edit-variable') variableDialog(data().variables.find(variable => variable.id === element.dataset.variable));
    else if (action === 'select-run') { data().selectedRunId = element.dataset.run; state.page = 'history-detail'; render(); }
    else if (action === 'open-run-page') { data().selectedRunId = element.dataset.run; state.page = 'history-detail'; render(); }
    else if (action === 'back-history') { state.page = 'history'; render(); }
    else if (action === 'pin-run') { const run = data().history.find(item => item.id === element.dataset.run); run.pinned = !run.pinned; render(); }
    else if (action === 'restore-run' && canRun()) {const run=data().history.find(item=>item.id===element.dataset.run);if(run && (!recordContextTab()||run.serverId===tab.serverId&&run.tool===tab.tool))restoreSavedRecord(run);}
    else if (action === 'clear-history') showDialog(t('common.clearCallHistory'), t('common.clearProject',{project:currentProject().name}), `<p class="small">${escape(t('common.clearCount',{count:data().history.filter(run => !run.pinned).length}))}</p>`, 'confirm-clear', t('common.confirmClear'));
    else if (action === 'members-view') { state.membersView = element.dataset.view; render(); }
    else if (action === 'invite-member') inviteDialog();
    else if (action === 'revoke-invite') showDialog(t('common.revokeInvitation'), t('common.revokedInvitationLinksCannotBeUsed'), `<p class="small">${escape(invitations.find(item => item.id === element.dataset.invite).email)}</p><input id="revoke-invite-id" type="hidden" value="${element.dataset.invite}">`, 'confirm-revoke', t('common.revokeInvitation'));
    else if (action === 'member-permissions') {
      const member = members.find(item => item.email === element.dataset.email);
      showDialog(t('common.memberAccess',{name:member.name}), `${member.teamRole} · ${currentProject().name} / ${member.projectRole}`, `<dl class="metadata"><dt>${escape(t('common.projectHistory'))}</dt><dd>${escape(t('common.viewRedactedRecords'))}</dd><dt>${escape(t('common.callTools'))}</dt><dd>${member.projectRole === 'Viewer' ? t('common.cannotExecute') : t('common.requiresToolAndCredentialAccess')}</dd><dt>${escape(t('common.configurationChanges'))}</dt><dd>${member.projectRole === 'Maintainer' ? t('common.canManage') : t('common.cannotModify')}</dd><dt>${escape(t('common.personalCredentials'))}</dt><dd>${escape(t('common.onlyAvailableToTheirOwner'))}</dd><dt>${escape(t('common.secretPlaintext'))}</dt><dd>${escape(t('common.hiddenByDefault'))}</dd></dl>`);
    }
    else if (action === 'switch-project') changeProject(element.dataset.project);
    else if (action === 'new-project') showDialog(t('common.createProject'), t('common.newProjectsBelongToEngineeringOnly'), `<div class="fields">${field('new-project-name', `${escape(t('common.projectName'))} <span class="required">*</span>`, '', '', 'required data-full')}${field('new-project-description', t('common.projectDescription'), '', '', 'data-full')}</div>`, 'create-project', t('common.createProject'));
    else if (action === 'account') {state.page='account';render();}
    else if (action === 'legacy-account') showDialog(t('common.accountAndPagePreviews'), t('common.wuweiExampleComExampleIdentity'), `<div class="field"><label for="preview-role">${escape(t('common.previewProjectRole'))}</label><select id="preview-role">${['Maintainer', 'Developer', 'Viewer'].map(role => `<option value="${role}" ${state.role === role ? 'selected' : ''}>${escape(roleLabel(role))}</option>`).join('')}</select><span class="description">${escape(t('common.demonstratesRestrictedActionsThisIsNot'))}</span></div><div class="inline wrap section-gap">${button('show-login', t('common.signInPage'), 'ArrowUpRight')}${button('invite-accept-preview', t('common.invitationAcceptancePage'), 'UserPlus')}</div>`);
    else if (action === 'show-login') { closeDialog(); state.page = 'login'; render(); }
    else if (action === 'login-demo') { state.page = 'projects'; render(); }
    else if (action === 'invite-accept-preview') showDialog(t('common.joinEngineering'), t('common.invitationAcceptanceExampleData'), `<dl class="metadata"><dt>${escape(t('common.invitedBy'))}</dt><dd>${escape(t('common.identity'))}</dd><dt>${escape(t('common.targetEmail'))}</dt><dd>xiaoyu@example.com</dd><dt>${escape(t('common.teamRole'))}</dt><dd>Member</dd><dt>${escape(t('common.initialProject'))}</dt><dd>${escape(t('common.mcpDeveloper'))}</dd><dt>${escape(t('common.validUntil'))}</dt><dd>2026-10-17</dd></dl><div class="notice">${escape(t('common.onlyVerifiedUsersWithTheInvited'))}</div>`, 'accept-invite-demo', t('common.acceptExampleInvitation'));
  });
  function inviteDialog() {
    if(!canEdit()) return;
    management.start(state.projectId,'invitation'); state.page='invitation'; render(); document.getElementById('invite-email')?.focus({preventScroll:true});
  }
  function saveServer() {
    if (!canEdit()) return;
    const form = document.getElementById('server-form');
    if (!form.reportValidity()) return;
    const server = data().servers.find(item => item.id === data().selectedServerId) || activeServer();
    const url = document.getElementById('server-url').value.trim();
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('url'); }
    catch { notify(t('common.validEndpoint')); return; }
    const timeout = Number(document.getElementById('server-timeout').value);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) { notify('调用超时必须为 1–600 秒的整数。'); return; }
    server.name = document.getElementById('server-name').value.trim(); server.url = url; server.timeout = timeout; server.auth = document.getElementById('server-auth').value;
    server.credential = server.auth === 'oauth' ? '我的 OAuth' : server.auth === 'none' ? '无需凭据' : '项目服务账号';
    if (!server.connected) server.profile = document.getElementById('server-profile').value;
    server.connected = false;
    connectionDrafts.delete(configDraftKey());
    render(); notify(t('common.configurationSaved'));
  }
  document.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.id === 'connection-prototype-form') {execution.action('connection-save',state.projectId,selectedConfigServer(),canEdit(),canRun());render();return;}
    if (event.target.id === 'environment-editor') {environments.save(environmentContext());render();root.querySelector('.env-page [aria-invalid="true"]')?.focus({preventScroll:true});return;}
    if (event.target.id === 'server-form') { saveServer(); return; }
    if (!['dialog-form','management-form'].includes(event.target.id)) return;
    const pageForm=event.target.id==='management-form';
    const action=event.target.querySelector('[data-submit]')?.dataset.submit;
    if(pageForm) management.capture(event.target);
    const editorError=key=>{if(pageForm) management.setError(state.projectId,'variable',key);document.getElementById('dialog-error').textContent=t(key);const input=document.getElementById(key==='common.invalidVariableNameStartWithA' ? 'variable-name' : 'variable-value');input?.setAttribute('aria-invalid','true');input?.setAttribute('aria-describedby','dialog-error');input?.focus({preventScroll:true});};
    if (action === 'save-variable' && canEdit()) {
      const name = document.getElementById('variable-name').value.trim();
      const raw = document.getElementById('variable-value').value;
      const secret = document.getElementById('variable-secret').checked;
      const type = document.getElementById('variable-type').value;
      if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(name)) { editorError('common.invalidVariableNameStartWithA'); return; }
      let value = raw;
      if (!secret) {
        try { if (type !== 'string') { value = JSON.parse(raw); if (type === 'number' && typeof value !== 'number' || type === 'boolean' && typeof value !== 'boolean') throw new Error('type'); } }
        catch { editorError('common.theValueDoesNotMatchThe'); return; }
      }
      const id = document.getElementById('variable-id').value || `variable-${++sequence}`;
      const scope = document.getElementById('variable-scope').value;
      const context=pageForm ? management.get(state.projectId,'variable') : {profile:state.profile,serverId:activeServer().id};
      const variable = { id, name, value: secret ? null : value, secret, scope, serverId: scope === 'server' ? context.serverId : null, profile: context.profile, source: context.profile, type };
      data().variables = data().variables.filter(item => item.id !== id); data().variables.push(variable);
      document.getElementById('variable-value').value = ''; if(pageForm) {management.clear(state.projectId,'variable');state.page='environment';} else closeDialog(); render(); notify(t('common.exampleVariableSavedSecretInputWas'));
    } else if (action === 'create-server' && canEdit()) {
      const name = document.getElementById('new-server-name').value.trim();
      const url = document.getElementById('new-server-url').value.trim();
      try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('url'); } catch { notify(t('common.enterAnHttpOrHttpsEndpoint')); return; }
      const server = { id: `server-${++sequence}`, name, url, auth: 'none', connected: false, timeout: 30, profile: '基础配置', credential: '无需凭据' };
      data().servers.push(server); data().selectedServerId = server.id;
      if (!data().activeServerId) data().activeServerId = server.id;
      closeDialog(); render(); notify(t('common.exampleServerCreatedConnectToStart'));
    } else if (action === 'confirm-clear' && canEdit()) {
      data().history = data().history.filter(run => run.pinned); data().selectedRunId = data().history[0]?.id || null; closeDialog(); render(); notify(t('common.unpinnedExampleHistoryCleared'));
    } else if (action === 'create-invite' && canEdit()) {
      invitations.push({ id: `invite-${++sequence}`, email: document.getElementById('invite-email').value.trim(), teamRole: document.getElementById('invite-team-role').value, project: projects.find(project => project.id === document.getElementById('invite-project').value).name, projectRole: document.getElementById('invite-project-role').value, status: '待接受', expires: '2026-10-19' });
      if(pageForm) {management.clear(state.projectId,'invitation');state.page='members';} else closeDialog(); state.membersView = 'invitations'; render(); notify(t('common.exampleInvitationCreatedNoEmailWas'));
    } else if (action === 'confirm-revoke' && canEdit()) {
      invitations.find(invite => invite.id === document.getElementById('revoke-invite-id').value).status = '已撤销'; closeDialog(); render();
    } else if (action === 'create-project' && canEdit()) {
      const id = `project-${++sequence}`;
      projects.push({ id, name: document.getElementById('new-project-name').value.trim(), description: document.getElementById('new-project-description').value.trim(), members: 1 });
      const created = projectData(id); created.servers = []; created.tabs = []; created.history = []; created.savedRecords=[]; created.variables = []; created.activeServerId = null; created.selectedServerId = null; created.selectedRunId = null;
      dataByProject[id] = created;
      closeDialog(); render(); notify(t('common.emptyExampleProjectCreatedOpenIt'));
    } else if (action === 'accept-invite-demo') { closeDialog(); state.page = 'projects'; render(); notify(t('common.invitationAcceptanceDemonstratedNoRealMembership')); }
  });
  document.addEventListener('input', event => {
    const target = event.target;
    if(baseline.input(target)){if(target.tagName==='SELECT'||target.type==='checkbox')render();return;}
    const teamInput=team.input(target);if(teamInput){if(teamInput==='render')render();return;}
    const historyInput=historyView.input(target,recordContextTab());if(historyInput){if(historyInput==='render')render();return;}
    if(environments.input(target,environmentContext())) {if(target.type!=='checkbox' && target.tagName!=='SELECT') {if(target.dataset.environment==='search')render();}return;}
    if(target.closest('#management-form')) {management.capture(target.closest('#management-form'));return;}
    const executionInput=execution.input(target,state.projectId,selectedConfigServer(),canEdit(),canRun());
    if(executionInput) {if(executionInput==='render') {const id=target.id;render();document.getElementById(id)?.focus({preventScroll:true});}return;}
    const recordInput=records.input(target,recordContextTab());
    if(recordInput) { if(recordInput==='render')updateKeepingFocus(target,render); return; }
    if(target.dataset.oneof){const tab=activeTab(),schema=schemaFor(toolSet().find(tool=>tool.name===tab.tool)).properties[target.dataset.oneof],branch=schema.oneOf[Number(target.value)];if(branch&&target.value!==''){tab.arguments[target.dataset.oneof]=Object.fromEntries(branch.required.map(key=>[key,branch.properties[key].const??'']));delete tab.arrayDrafts[target.dataset.oneof];delete tab.parameterErrors[target.dataset.oneof];markDraftChanged(tab);render();}return;}
    if (target.id === 'tool-search') { state.toolSearch = target.value; updateKeepingFocus(target, render); }
    else if (target.id === 'tool-history-search') { activeTab().historySearch=target.value; updateKeepingFocus(target,render); }
    else if (target.id === 'history-search') { state.historySearch = target.value; updateKeepingFocus(target, render); }
    else if (target.id === 'raw-arguments') { activeTab().raw = target.value; activeTab().error = '';activeTab().parameterQuietPaths=[]; markDraftChanged(activeTab()); }
    else if (target.dataset.param || target.dataset.array || target.dataset.skipParam || target.dataset.nested || target.dataset.nestedSkip || target.dataset.nullPath) {
      const tab=activeTab(),tool=toolSet().find(item=>item.name===tab.tool);
      const changed=parameters.input(target,tab,tool);
      if(changed) { markDraftChanged(tab); if(changed==='render') { const id=target.id;render();document.getElementById(id)?.focus({preventScroll:true}); } else { parameters.refresh(tab,tool);const error=document.getElementById('arguments-error');if(error)error.remove(); } }
    }
    else if (target.id === 'variable-secret') document.getElementById('variable-value').type = target.checked ? 'password' : 'text';
  });
  function updateAuthenticationDraft(method) {
    const credential=method === 'oauth' ? '我的 OAuth' : method === 'none' ? '无需凭据' : '项目服务账号';
    document.getElementById('server-credential').value=credentialLabel(credential);
    document.getElementById('credential-explanation').textContent=credentialExplanation(credential);
    document.getElementById('credential-scope').innerHTML=badge(t(method === 'oauth' ? 'servers.personal' : method === 'none' ? 'common.noCredentials' : 'servers.projectShared'));
    document.getElementById('authentication-detail').innerHTML=method === 'oauth' ? `<p class="small muted">${escape(t('servers.oauthAuthorizationBelongsToYouOther'))}</p>${button('authorize-preview',t('servers.viewAuthorizationFlow'),'ArrowUpRight','',permission('run'))}` : method === 'none' ? `<p class="small muted">${escape(t('servers.thisServerDoesNotRequireCredentials'))}</p>` : `<label for="server-token">${escape(t('servers.tokenVariableReference'))}</label><input id="server-token" class="mono" value="{{${state.projectId === 'commerce' ? 'COMMERCE_TOKEN' : 'KNOWLEDGE_TOKEN'}}}"><span class="description inline success">${icon('CheckCircle')}${escape(t('servers.resolvedSecretValuesStayOnThe'))}</span>`;
  }
  document.addEventListener('toggle',event=>{const node=event.target;if(!node.isConnected||!node.dataset.parameterDisclosure)return;const tabId=node.closest('[data-debug-tab]')?.dataset.debugTab;const tab=data().tabs.find(tab=>tab.id===tabId);if(!tab)return;const path=node.dataset.parameterDisclosure;tab.collapsedParameterPaths=(tab.collapsedParameterPaths||[]).filter(item=>item!==path);if(!node.open)tab.collapsedParameterPaths.push(path);},true);
  document.addEventListener('change', event => {
    const target = event.target;
    if(baseline.input(target)){if(target.tagName==='SELECT'||target.type==='checkbox')render();return;}
    if(target.id==='state-scenario'){states.set(target.value);render();return;}
    if(target.dataset.team){team.input(target);render();return;}
    if(target.dataset.historyFilter||target.dataset.historyPaths){historyView.input(target,recordContextTab());render();return;}
    if(target.dataset.environment) {environments.input(target,environmentContext());render();return;}
    if (target.id === 'language-switch') { changeLanguage(target.value); return; }
    if(target.dataset.execution) return;
    if(target.closest('#management-form')) {management.capture(target.closest('#management-form'));if(target.tagName==='SELECT' || target.type==='checkbox') render();return;}
    if(records.change(target,recordContextTab())) { render(); return; }
    if(target.id==='debug-scenario') {if(!activeTab()?.running)activeTab().scenario=target.value;return;}
    if (target.id === 'active-server') chooseServer(target.value);
    else if (target.id === 'tool-history-status') { activeTab().historyStatus=target.value; render(); }
    else if (target.id === 'history-status') { state.historyStatus = target.value; render(); }
    else if (target.id === 'history-server') { state.historyServer = target.value; render(); }
    else if (target.id === 'preview-role') { state.role = target.value; closeDialog(); render(); notify(`${escape(t('common.previewing'))} ${state.role} ${escape(t('common.projectPermissions'))}`); }
    else if (target.id === 'server-auth') updateAuthenticationDraft(target.value);
  });
  function updateKeepingFocus(target, update) {
    const id = target.id; const start = target.selectionStart; const end = target.selectionEnd;
    update(); const replacement = document.getElementById(id); replacement.focus(); replacement.setSelectionRange(start, end);
  }
  document.addEventListener('keydown', event => {
    if(event.target.closest('.history-detail-tabs')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...root.querySelectorAll('.history-detail-tabs [role=tab]')],index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next]?.click();root.querySelectorAll('.history-detail-tabs [role=tab]')[next]?.focus();return;}
    if(state.tabMenu) {
      if(event.key==='Escape') { event.preventDefault(); closeTabMenu(); return; }
      if(event.key==='Tab') { closeTabMenu(); return; }
      if(event.target.closest('#tab-action-menu') && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); const items=[...document.querySelectorAll('#tab-action-menu button:not(:disabled)')];
        const index=items.indexOf(document.activeElement);
        const next=event.key==='Home' ? 0 : event.key==='End' ? items.length-1 : (index+(event.key==='ArrowDown' ? 1 : -1)+items.length)%items.length;
        items[next]?.focus(); return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && states.get().kind==='ready' && !dialog.open && state.page === 'tools' && activeTab()?.workspaceView === 'debug') { event.preventDefault(); execute(); }
    if (event.target.classList?.contains('splitter') && ['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) {
      event.preventDefault(); state.requestWidth = event.key === 'Home' ? 52 : Math.max(30, Math.min(65, state.requestWidth + (event.key === 'ArrowUp' ? -2 : 2)));
      const layout = document.querySelector('.request-result'); layout.style.setProperty('--request-height', `${state.requestWidth}%`); event.target.setAttribute('aria-valuenow', state.requestWidth);
    }
  });
  window.addEventListener('resize',()=>closeTabMenu(false));
  document.addEventListener('scroll',event=>{if(state.tabMenu && !event.target.closest?.('#tab-action-menu')) closeTabMenu(false);},true);
  let drag = null;
  document.addEventListener('pointerdown', event => {
    if (!event.target.classList?.contains('splitter')) return;
    drag = { element: event.target, rect: event.target.parentElement.getBoundingClientRect() };
    event.target.setPointerCapture(event.pointerId); event.preventDefault();
  });
  document.addEventListener('pointermove', event => {
    if (!drag) return;
    state.requestWidth = Math.max(30, Math.min(65, Math.round((event.clientY - drag.rect.top) / drag.rect.height * 100)));
    drag.element.parentElement.style.setProperty('--request-height', `${state.requestWidth}%`); drag.element.setAttribute('aria-valuenow', state.requestWidth);
  });
  document.addEventListener('pointerup', () => { drag = null; });
  document.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('beforeunload', () => { debuggerModel.dispose(); execution.dispose(); });
  document.addEventListener('keydown',event=>{if(!event.target.matches('[data-connection-view]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...root.querySelectorAll('[data-connection-view]')],index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;const view=tabs[next].dataset.connectionView;tabs[next].click();root.querySelector(`[data-connection-view="${view}"]`)?.focus({preventScroll:true});});
  syncLanguageMetadata();
  readRoute();
  render();
})();
