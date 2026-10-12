/* Named request/response design flow. All example records remain in memory. */
window.workbenchRecords = {
  create({escape, t, icon, button, badge, jsonView, ui, data, projectId, canRun, canEdit, restore, notify, queue=()=>{}}) {
    let sequence = 0;
    const clone = value => JSON.parse(JSON.stringify(value));
    const text = (key, values) => escape(t(`runs.${key}`, values));
    const userId = 'user-wuwei';
    const redact = value => window.workbenchRedaction.sanitize(value,value.redactionPaths||[]).value;
    const visible = record => record.scope === 'project' || record.ownerId === userId;
    const editable = record => !record.uploading && canRun() && (canEdit() || record.scope === 'private' && record.ownerId === userId);
    const scopedRecords = tab => data().savedRecords.filter(record => visible(record) && (!tab || record.serverId === tab.serverId && record.tool === tab.tool));
    const selection = tab => scopedRecords(tab).find(record => record.id === (tab ? tab.savedRecordId : data().selectedSavedId));
    const contextDraft = tab => tab ? tab.recordDraft : data().recordDraft;
    const search = tab => tab ? tab.savedSearch : data().savedSearch;
    const scope = tab => tab ? tab.savedScope : data().savedScope;
    function navigation() {
      return `<nav class="records-global-nav" aria-label="${text('recordCollections')}">${button('records-global-view',text('history'), '', '', `data-view="calls" aria-current="${data().recordsView !== 'saved' ? 'page' : 'false'}"`)}${button('records-global-view',text('savedRecords'), '', '', `data-view="saved" aria-current="${data().recordsView === 'saved' ? 'page' : 'false'}"`)}</nav>`;
    }
    function snapshots(record) {
      return ui.recordSnapshots({argumentsHtml:jsonView(window.workbenchRedaction.prepare(record).value.arguments),responseHtml:jsonView(window.workbenchRedaction.prepare(record).value.response),hasResponse:record.hasResponse ?? record.response !== null});
    }
    function begin(source, tab, record) {
      if (!canRun()) return false;
      const snapshot = clone(source);
      const draft = {editId:record?.id || null, name:record?.name || `${source.tool} · ${source.id || t('runs.requestDraft')}`, note:record?.note || '', scope:record?.scope || 'private', snapshot, error:'',uploadResult:'success',returnView:tab?.workspaceView};
      if (tab) { tab.recordDraft = draft; tab.workspaceView = 'save-record'; }
      else data().recordDraft = draft;
      return true;
    }
    function renderCollection(tab) {
      const query = search(tab).toLowerCase();
      const records = scopedRecords(tab).filter(record => `${record.name} ${record.tool} ${record.note}`.toLowerCase().includes(query) && (scope(tab) === 'all' || record.scope === scope(tab)));
      const body = `<header class="tool-history-heading"><div><h2>${text('savedRecords')}</h2><p>${text(tab ? 'savedToolScope' : 'savedProjectScope')}</p></div>${badge(t('runs.savedCount',{count:records.length}))}</header><div class="toolbar"><div class="search">${icon('MagnifyingGlass')}<input id="saved-record-search" aria-label="${text('searchSaved')}" placeholder="${text('searchSaved')}" value="${escape(search(tab))}"></div><select id="saved-record-scope" aria-label="${text('recordVisibility')}">${[['all','allSaved'],['private','privateRecord'],['project','projectRecord']].map(([value,key])=>`<option value="${value}" ${scope(tab)===value ? 'selected' : ''}>${text(key)}</option>`).join('')}</select></div>${ui.savedRecordTable({records:records.map(record=>({...record,context:data().servers.find(server=>server.id===record.serverId)?.name || record.serverId})),scoped:Boolean(tab)})}<div class="records-note">${icon('ShieldCheck')}<span>${text('savedPlatformNote')}</span></div>`;
      return tab ? `<section class="tool-history-page records-collection" aria-label="${text('savedRecords')}">${body}</section>` : `<section class="page management-page saved-collection-page"><div class="records-page-head">${ui.pageHeading({title:t('common.history'),description:t('management.historyDescription'),glyph:'ClockCounterClockwise',actions:badge(t('runs.platformPreview'))})}${navigation()}</div><div class="records-global-collection">${body}</div></section>`;
    }
    function renderDetail(tab) {
      const record = selection(tab);
      if (!record) return `<section class="${tab ? 'tool-history-detail' : 'page'}"><header class="page-heading"><div class="grow"><h1>${text('savedNotFound')}</h1><p>${text('savedUnavailable')}</p></div>${button('records-back',text('backToSaved'),'ArrowLeft')}</header></section>`;
      return `<section class="${tab ? 'tool-history-detail' : 'page'} run-page"><header class="page-heading"><div class="grow"><div class="page-breadcrumb">${button('records-back',text('savedRecords'),'ArrowLeft','quiet')}<span>/</span><code>${escape(record.id)}</code></div><h1>${escape(record.name)}</h1><p><code>${escape(record.tool)}</code> · ${escape(record.actor)} · ${escape(record.savedAt)}</p></div>${button('records-edit',text('editRecord'),'PencilSimple','',`data-record="${escape(record.id)}" ${editable(record) ? '' : 'disabled'}`)}${button('records-load',text('loadParameters'),'ArrowUpRight','primary',`data-record="${escape(record.id)}" ${canRun() ? '' : 'disabled'}`)}</header><div class="run-page-scroll"><div class="record-summary"><span>${badge(t(record.scope==='project' ? 'runs.projectRecord' : 'runs.privateRecord'))}</span><span>${text(record.hasResponse ? 'requestAndResponse' : 'requestOnly')}</span><code>${escape(record.serverId)}</code><span>${text('platformPreview')}</span>${record.sourceRunId ? `<code>${escape(record.sourceRunId)}</code>${data().history.some(run=>run.id===record.sourceRunId) ? button('records-source',text('viewSourceCall'),'ClockCounterClockwise','quiet',`data-record="${escape(record.id)}"`) : ''}` : ''}</div>${record.note ? `<p class="record-description">${escape(record.note)}</p>` : ''}<p class="small muted record-description">${text('savedLoadExplanation')}</p>${snapshots(record)}</div></section>`;
    }
    function renderEditor(tab) {
      const draft = contextDraft(tab);
      if (!draft) return `<section class="tool-history-detail"><header class="page-heading"><h1>${text('savedNotFound')}</h1>${button('records-back',text('backToSaved'),'ArrowLeft')}</header></section>`;
      const source = draft.snapshot;
      return `<section class="record-editor-page"><header class="page-heading"><div class="grow"><h2>${text(draft.editId ? 'editRecord' : 'saveRecord')}</h2><p>${['cancelled','failed'].includes(source.status)&&!source.hasResponse?escape(t('history.missingHint')):text(source.hasResponse ? 'saveExecutionSnapshot' : 'saveRequestSnapshot')}</p></div>${button('records-cancel',text('cancelSave'),'ArrowLeft')}${button('records-submit',text('saveToPlatform'),'Check','primary',canRun() ? '' : 'disabled')}</header><div class="record-editor-scroll"><div class="record-editor-metadata"><div class="field"><label for="record-name">${text('recordName')} <span class="required">*</span></label><input id="record-name" maxlength="120" value="${escape(draft.name)}" ${draft.error?'aria-invalid="true"':''} aria-describedby="record-error"></div><div class="field"><label for="record-visibility">${text('recordVisibility')}</label><select id="record-visibility"><option value="private" ${draft.scope==='private' ? 'selected' : ''}>${text('privateRecord')}</option><option value="project" ${draft.scope==='project' ? 'selected' : ''} ${canEdit()&&!source.incomplete ? '' : 'disabled'}>${text('projectRecord')}</option></select></div><div class="field full"><label for="record-note">${text('recordNote')}</label><textarea id="record-note" rows="2" maxlength="500">${escape(draft.note)}</textarea></div><p id="record-error" class="error small full" role="alert">${escape(draft.error)}</p></div><div class="record-summary"><code>${escape(source.tool)}</code><code>${escape(source.serverId)}</code><span>${text(source.hasResponse ? 'requestAndResponse' : 'requestOnly')}</span>${source.sourceRunId ? `<code>${escape(source.sourceRunId)}</code>` : ''}</div><div class="notice">${icon('ShieldCheck')}<span>${text('saveRedactionNote')}</span></div><label class="field record-save-simulation"><span>${text('saveOutcome')}</span><select id="record-upload-result"><option value="success" ${draft.uploadResult==='success'?'selected':''}>${escape(t('history.saveSuccess'))}</option><option value="failed" ${draft.uploadResult==='failed'?'selected':''}>${escape(t('history.saveFailure'))}</option></select></label>${source.incomplete?`<div class="notice">${escape(t('baseline.incompleteHint'))}</div>`:''}${snapshots(window.workbenchRedaction.prepare(source).value)}</div></section>`;
    }
    function input(target, tab) {
      if (target.id === 'saved-record-search') { if(tab) tab.savedSearch=target.value; else data().savedSearch=target.value; return 'render'; }
      const draft=contextDraft(tab);
      if (draft && ['record-name','record-note'].includes(target.id)) { draft[target.id === 'record-name' ? 'name' : 'note']=target.value; draft.error=''; return 'handled'; }
      return false;
    }
    function change(target, tab) {
      if(target.id==='record-upload-result'&&contextDraft(tab)){contextDraft(tab).uploadResult=target.value;return true;}
      if (target.id === 'saved-record-scope') { if(tab)tab.savedScope=target.value; else data().savedScope=target.value; return true; }
      if (target.id === 'record-visibility' && contextDraft(tab)) { contextDraft(tab).scope=target.value==='project' && canEdit() && !contextDraft(tab).snapshot.incomplete ? 'project' : 'private'; return true; }
      return false;
    }
    function submit(tab) {
      const draft=contextDraft(tab);
      if (!draft || !canRun()) return false;
      if (!draft.name.trim()) { draft.error=t('runs.recordNameRequired'); return false; }
      if (draft.scope==='project' && (!canEdit() || draft.snapshot.incomplete)) { draft.error=t('common.noPermission'); return false; }
      const existing=data().savedRecords.find(record=>record.id===draft.editId);
      if (draft.editId && (!existing || !editable(existing))) return false;
      let record;
      if (existing) { existing.name=draft.name.trim(); existing.note=draft.note.trim(); existing.scope=draft.scope; record=existing; }
      else {
        record={...redact(clone(draft.snapshot)),id:`${projectId()}-saved-${++sequence}`,projectId:projectId(),ownerId:userId,actor:'吴伟',name:draft.name.trim(),note:draft.note.trim(),scope:draft.scope,savedAt:new Date().toLocaleString('sv-SE')};
        data().savedRecords.unshift(record);
      }
      if (tab) { tab.savedRecordId=record.id; tab.recordDraft=null; tab.workspaceView='saved-detail'; }
      else { data().selectedSavedId=record.id; data().recordDraft=null; data().recordsView='saved'; }
      delete record.uploadSnapshot;delete record.queueDiscarded;record.queueOwner='browser';record.projectId=projectId();record.storageStatus='pending';record.uploading=false;record.uploadAttempts=0;record.uploadAvailable=draft.uploadResult!=='failed';queue(record);
      notify(t('history.pendingName'));
      return true;
    }
    return {navigation, snapshots, begin, renderCollection, renderDetail, renderEditor, input, change, submit, selection, scopedRecords,
      edit(tab, id) { const record=scopedRecords(tab).find(record=>record.id===id); return record && editable(record) && begin(record,tab,record); },
      load(tab, id) { const record=scopedRecords(tab).find(record=>record.id===id); if(record && canRun())restore(record); },
    };
  },
};
