import {beforeEach,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {Shell} from './Shell';
import {i18n} from '../shared/i18n';
import type {Project} from '../generated/platform';

const project:Project={id:'project',teamId:'team',name:'A30 long workspace name · 长名称',description:'',role:'maintainer',canManage:true,canTakeover:false,canRead:true};
beforeEach(async()=>{await i18n.changeLanguage('en-US');});
it('keeps the actual readable project context in the bottom bar and removes it after losing content access',()=>{
 const props={projects:[project],project,teamId:'team',page:'tools',navigate:()=>{}};
 const view=render(<Shell {...props}><input aria-label="Draft" defaultValue="retained"/></Shell>);
 const footer=screen.getByRole('contentinfo');expect(footer.textContent).toContain(project.name);expect(footer.querySelector('[title]')?.getAttribute('title')).toBe(project.name);
 view.rerender(<Shell {...props} project={{...project,canRead:false}}><input aria-label="Draft" defaultValue="retained"/></Shell>);
 expect(screen.getByRole('contentinfo').textContent).toBe('Projects');expect(screen.getByLabelText('Draft')).toHaveProperty('value','retained');
});
