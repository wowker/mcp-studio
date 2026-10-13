import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryFeedback} from './ui';
import {i18n} from './i18n';
beforeEach(async()=>{await i18n.changeLanguage('en-US');});
it.each(['forbidden','not_found'])('offers return instead of repeating an unavailable %s lookup',async(error)=>{
 const retry=vi.fn(),back=vi.fn(),user=userEvent.setup();render(<QueryFeedback error={error} retry={retry} back={{label:'Return to list',onClick:back}}/>);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByRole('button',{name:'Retry'})).toBeNull();await user.click(screen.getByRole('button',{name:'Return to list'}));expect(back).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
});
it('allows explicit retry of a transient error and a separate return action',async()=>{
 const retry=vi.fn(),back=vi.fn(),user=userEvent.setup();render(<QueryFeedback error="network" retry={retry} back={{label:'Return to list',onClick:back}}/>);expect(retry).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Retry'}));expect(retry).toHaveBeenCalledOnce();expect(back).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Return to list'}));expect(back).toHaveBeenCalledOnce();
});
