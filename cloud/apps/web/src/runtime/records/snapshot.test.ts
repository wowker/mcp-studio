import {it,expect} from 'vitest';
import {sanitizeSnapshot,makeUpload} from './snapshot';
import {snapshot as fixture,historyRecord} from '../../features/records/testFixtures';
const versionHash='ab1234567890'+'c'.repeat(52);
it('matches platform masking of a fixed 64-hex Agent version hash before saving its source Run',async()=>{
 const raw={...fixture,executor:'agent' as const,environmentVersion:versionHash};
 const safe=sanitizeSnapshot(raw);expect(safe.environmentVersion).toBe('[REDACTED]');expect(safe.redactions).toEqual([{path:'/context/environmentVersion',reason:'default'}]);expect(raw.environmentVersion).toBe(versionHash);
 const input=await makeUpload({userId:'u',targetKind:'saved',snapshot:raw,metadata:{...historyRecord.metadata,name:'Browser copy'}});
 expect(input.snapshot.environmentVersion).toBe('[REDACTED]');expect(input.snapshot.redactions).toEqual(safe.redactions);expect(input.sourceRunId).toBe(raw.runId);expect(input.snapshot.executor).toBe('agent');expect(input.responsibleEndpoint).toBe('browser');
 const repeated=await makeUpload({userId:'u',targetKind:'saved',snapshot:safe,metadata:{...historyRecord.metadata,name:'Browser copy'}});expect(repeated.snapshot).toEqual(input.snapshot);
});
