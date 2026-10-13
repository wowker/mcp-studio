import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {RecordsPage} from './RecordsPage';
import {PlatformClient} from '../../shared/api';
import {i18n} from '../../shared/i18n';
import {M2Memory} from '../connections/runtimeStore';
const project={id:'p',teamId:'t',name:'Project',description:'',role:'developer',canRead:true,canManage:false,canTakeover:false},session={user:{id:'u',name:'User',email:'u@test',verified:true},teams:[],csrf:'csrf',expiresAt:'2099-01-01T00:00:00Z'};
beforeEach(async()=>{await i18n.changeLanguage('en-US');vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({data:{items:[],nextCursor:''}})));});afterEach(()=>vi.unstubAllGlobals());
it.each(['history','saved'] as const)('offers the same tool scope as the next step for an empty %s list',async(kind)=>{
 const memory=new M2Memory(),scope={connectionId:'c',toolName:'echo'},navigate=vi.fn(),user=userEvent.setup();memory.recordViews.list('p',scope).kind=kind;render(<RecordsPage client={new PlatformClient()} project={project} session={session} memory={memory} scope={scope} scopeRevision={0} navigate={navigate}/>);await screen.findByText('No records yet.');await user.click(screen.getByRole('button',{name:'Tools'}));expect(navigate).toHaveBeenCalledWith({page:'tools',connection:'c',record:''});memory.clear();
});
it('offers filter clearing for a no-match result without presenting a create-call action',async()=>{
 const memory=new M2Memory(),navigate=vi.fn(),user=userEvent.setup();memory.recordViews.list('p').filters.search='retained';render(<RecordsPage client={new PlatformClient()} project={project} session={session} memory={memory} scopeRevision={0} navigate={navigate}/>);await screen.findByText('No matching records.');expect(screen.queryByRole('button',{name:'Tools'})).toBeNull();await user.click(screen.getByRole('button',{name:'Clear filters'}));await screen.findByText('No records yet.');expect(navigate).not.toHaveBeenCalled();memory.clear();
});
