import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ProjectDirectory} from './Projects';
import {PlatformClient} from '../../shared/api';
import {i18n} from '../../shared/i18n';
beforeEach(async()=>{await i18n.changeLanguage('en-US');});
it('explains denied create-project entry and returns to the directory without issuing a write',async()=>{
 const navigate=vi.fn(),request=vi.spyOn(PlatformClient.prototype,'request');const user=userEvent.setup();render(<ProjectDirectory client={new PlatformClient()} team={{id:'t',name:'Team',role:'member'}} projects={[]} page="create-project" navigate={navigate} refresh={()=>{}}/>);await screen.findByRole('alert');await user.click(screen.getByRole('button',{name:'Projects'}));expect(navigate).toHaveBeenCalledWith({page:'projects'});expect(request).not.toHaveBeenCalled();request.mockRestore();
});

it('emits creation evidence only after a real scoped success and preserves inputs on failure',async()=>{const user=userEvent.setup(),onCreated=vi.fn(),navigate=vi.fn(),client=new PlatformClient(),created={id:'new-p',teamId:'t',name:'New project',description:'',role:'maintainer' as const,canRead:true,canManage:true,canTakeover:false};const request=vi.spyOn(client,'request').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(created);render(<ProjectDirectory client={client} team={{id:'t',name:'Team',role:'owner'}} projects={[]} page="create-project" navigate={navigate} refresh={()=>{}} onCreated={onCreated}/>);await user.type(screen.getByLabelText('Name'),'New project');await user.click(screen.getByRole('button',{name:'Create project'}));await screen.findByRole('alert');expect(onCreated).not.toHaveBeenCalled();expect(screen.getByLabelText('Name')).toHaveProperty('value','New project');await user.click(screen.getByRole('button',{name:'Create project'}));expect(onCreated).toHaveBeenCalledWith(created);expect(navigate).toHaveBeenCalledWith({project:'new-p',page:'project'});request.mockRestore();});
