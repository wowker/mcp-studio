import {describe,it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {Button,DebuggerSplitPane} from './ui';
function Split(){const [ratio,setRatio]=useState(52);return <DebuggerSplitPane request={<input aria-label="Draft" defaultValue="retained"/>} result={<p>Result</p>} name="Adjust panes" requestLabel="Request" resultLabel="Result" resetLabel="Reset panes" expandLabel="Expand request" ratio={ratio} onRatioChange={setRatio}/>;}
describe('layout primitives',()=>{
 it('keeps the shared button class with additional caller styles',()=>{render(<Button className="tools-icon-button">Action</Button>);expect(screen.getByRole('button').classList.contains('ui-button')).toBe(true);});
 it('adjusts the separator by keyboard within bounds and resets without losing the draft',async()=>{const user=userEvent.setup();render(<Split/>);const separator=screen.getByRole('separator',{name:'Adjust panes'});separator.focus();await user.keyboard('{ArrowRight}');expect(separator.getAttribute('aria-valuenow')).toBe('53');await user.keyboard('{End}');expect(separator.getAttribute('aria-valuenow')).toBe('65');await user.keyboard('{ArrowRight}');expect(separator.getAttribute('aria-valuenow')).toBe('65');await user.keyboard('{Home}');expect(separator.getAttribute('aria-valuenow')).toBe('30');await user.keyboard('{Enter}');expect(separator.getAttribute('aria-valuenow')).toBe('52');await user.click(screen.getByRole('button',{name:'Expand request'}));expect(separator.getAttribute('aria-valuenow')).toBe('65');await user.click(screen.getByRole('button',{name:'Reset panes'}));expect(separator.getAttribute('aria-valuenow')).toBe('52');expect(screen.getByLabelText('Draft')).toHaveProperty('value','retained');});
});
