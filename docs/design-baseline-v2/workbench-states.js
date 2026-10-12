/* Presentation-only state review. It never changes project fixtures or permissions. */
window.workbenchStates={
 kinds:['ready','empty','loading','error','forbidden','missing'],
 create({t,escape:e,icon,button,ui,context}){
  const views=new Map();
  const key=()=>JSON.stringify(context().identity);
  const get=()=>{const k=key();if(!views.has(k))views.set(k,{kind:'ready',previous:'ready',guide:false});return views.get(k);};
  const set=kind=>{if(!window.workbenchStates.kinds.includes(kind))return;const s=get();if(kind==='loading'&&s.kind!=='loading')s.previous=s.kind;s.kind=kind;s.guide=false;};
  const text=(key,args)=>t('states.'+key,args);
  const b=(action,label,variant='quiet',extra='')=>button('state-'+action,e(text(label)),'',variant,extra);
  function feedback({title,hint,actions='',kind='empty',compact=false}){return `<section class="state-feedback ${compact?'is-compact':''} state-${kind}" aria-label="${e(title)}"><span class="state-glyph" aria-hidden="true">${icon(kind==='forbidden'?'LockKey':kind==='error'?'WarningCircle':kind==='loading'?'ArrowClockwise':'Stack')}</span><div class="state-copy"><h2>${e(title)}</h2><p>${e(hint)}</p>${actions?`<div class="state-actions">${actions}</div>`:''}</div></section>`;}
  function toolbar(){const s=get();return `<div class="state-toolbar"><label for="state-scenario">${e(text('preview'))}</label><select id="state-scenario" aria-describedby="state-demo-hint">${window.workbenchStates.kinds.map(kind=>`<option value="${kind}" ${s.kind===kind?'selected':''}>${e(text(kind))}</option>`).join('')}</select><span id="state-demo-hint" class="small muted">${e(text('demo'))}</span>${s.kind==='loading'?b('success','success')+b('fail','fail'):s.kind!=='ready'?b('reset','reset'):''}</div>`;}
  function render(){const c=context(),s=get();if(s.kind==='ready')return '';const resource=text(c.resource),kind=s.kind;let hint=kind+'Hint',title=kind+'Title',actions='';
   if(kind==='empty'){title=({tools:'emptyTools',servers:'emptyServers',members:'emptyMembers',history:'noCalls',saved:'noSaved',environment:'noVariables'})[c.resource]||title;hint=c.emptyHint||'emptyHint';actions=c.emptyAction?button(c.emptyAction,e(text(c.emptyLabel)),'','primary',c.editable===false?'disabled title="'+e(text('readOnly'))+'"':''):b('retry','retry','primary');}
   if(kind==='error')actions=b('retry','retry','primary');
   if(kind==='loading')actions=b('cancel','cancel');
   if(kind==='forbidden')actions=b('projects','switch','primary')+b('guide','roles');
   if(kind==='missing')actions=b('back','back','primary');
   return `<section class="page management-page state-page">${ui.pageHeading({title:resource,description:c.project,glyph:'Stack'})}<div class="state-scroll">${feedback({title:text(title,{resource:c.resource==='tools'?text('toolCatalog'):resource}),hint:text(hint),kind,actions})}${kind==='loading'?`<div class="state-skeleton" aria-hidden="true" aria-busy="true">${Array.from({length:5},()=>'<div><i></i><span></span><span></span></div>').join('')}</div>`:''}${s.guide?`<div class="notice state-role-guide">${e(text('rolesHint'))}</div>`:''}<span class="state-announcement" role="${kind==='error'?'alert':'status'}" aria-live="polite">${e(text(title,{resource:c.resource==='tools'?text('toolCatalog'):resource}))}</span></div></section>`;
  }
  function action(action){if(!action.startsWith('state-'))return false;const s=get();if(action==='state-retry')set('loading');if(action==='state-cancel')set(s.previous);if(['state-success','state-reset'].includes(action))set('ready');if(action==='state-fail')set('error');if(action==='state-guide')s.guide=!s.guide;return true;}
  function readonly(){return context().readOnly?`<aside class="state-readonly">${icon('LockKey')}<span><strong>${e(text('readOnly'))}</strong> · ${e(text('readOnlyHint'))}</span></aside>`:'';}
  return {get,set,toolbar,render,action,feedback,readonly};
 }
};
