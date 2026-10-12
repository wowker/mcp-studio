import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from '../../app/App';
import {i18n} from '../../shared/i18n';

beforeEach(async()=>{history.replaceState({},'', '/?invite=invitation-public-id'); await i18n.changeLanguage('en-US');});
afterEach(()=>vi.unstubAllGlobals());

it('keeps original invitation after registration and never accepts automatically',async()=>{
  const calls:string[]=[]; let registered=false; let signedIn=false;
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    calls.push(`${init?.method??'GET'} ${url}`);
    let data:unknown={ok:true}; let status=200;
    if(url.endsWith('/bootstrap'))data={initialized:true,mailConfigured:true};
    if(url.endsWith('/session')){status=signedIn?200:401;data=signedIn?{user:{id:'new-user',name:'New member',email:'new@example.test',verified:true},teams:[],csrf:'csrf-new',expiresAt:'2099-01-01T00:00:00Z'}:{error:{code:'unauthenticated'}};}
    if(url.endsWith('/invitations/invitation-public-id'))data={id:'invitation-public-id',projectName:'Invited project',emailHint:'n***@example.test',status:'pending',expiresAt:'2099-01-01T00:00:00Z'};
    if(url.endsWith('/invitation/register')){registered=true;data={ok:true};}
    if(url.endsWith('/login')&&registered){signedIn=true;data={user:{id:'new-user',name:'New member',email:'new@example.test',verified:true},teams:[],csrf:'csrf-new',expiresAt:'2099-01-01T00:00:00Z'};}
    return new Response(JSON.stringify(status===200?{data}:data),{status});
  });
  const user=userEvent.setup(); render(<App/>);
  await user.click(await screen.findByRole('button',{name:'Create invited account'}));
  await user.type(screen.getByLabelText('Email'),'new@example.test');
  await user.type(screen.getByLabelText('Name'),'New member');
  await user.type(screen.getByLabelText('Password'),'Strong-Password-12');
  await user.type(screen.getByLabelText('Email code'),'mail-code-secret');
  await user.click(screen.getByRole('button',{name:'Create account'}));
  await screen.findByRole('heading',{name:'Sign in'});
  await user.type(screen.getByLabelText('Email'),'new@example.test');
  await user.type(screen.getByLabelText('Password'),'Strong-Password-12');
  await user.click(screen.getByRole('button',{name:'Sign in'}));
  await screen.findByRole('button',{name:'Accept invitation'});
  expect(location.search).toContain('invite=invitation-public-id');
  expect(location.href).not.toContain('mail-code-secret');
  expect(localStorage.length).toBe(0);
  expect(calls.some(value=>value.endsWith('/accept'))).toBe(false);
});

it('retains typed identity when a wrong-password login returns 401',async()=>{
 history.replaceState({},'', '/');
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url.endsWith('/bootstrap')?{data:{initialized:true,mailConfigured:true}}:{error:{code:url.endsWith('/login')?'invalid_credentials':'session_expired'}}),{status:url.endsWith('/bootstrap')?200:401}));
 const user=userEvent.setup();render(<App/>);await user.type(await screen.findByLabelText('Email'),'retained@example.test');await user.type(screen.getByLabelText('Password'),'Wrong-Password-12');await user.click(screen.getByRole('button',{name:'Sign in'}));await screen.findByRole('alert');expect(screen.getByLabelText('Email')).toHaveProperty('value','retained@example.test');
});

it('offers manual-code reset after requesting password repair',async()=>{
 history.replaceState({},'', '/?page=forgot&invite=invitation-public-id');
 vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/bootstrap'))return new Response(JSON.stringify({data:{initialized:true,mailConfigured:true}}));if(url.endsWith('/session'))return new Response(JSON.stringify({error:{code:'session_expired'}}),{status:401});if(url.endsWith('/invitations/invitation-public-id'))return new Response(JSON.stringify({data:{id:'invitation-public-id',projectName:'Project',emailHint:'r***@example.test',status:'pending',expiresAt:'2099-01-01T00:00:00Z'}}));return new Response(JSON.stringify({data:{ok:true}}));});
 const user=userEvent.setup();render(<App/>);await user.type(await screen.findByLabelText('Email'),'repair@example.test');await user.click(screen.getByRole('button',{name:'Send reset code'}));await user.click(await screen.findByRole('button',{name:'Reset password'}));expect(screen.getByLabelText('Email code')).toHaveProperty('type','password');expect(location.search).toContain('invite=invitation-public-id');
});
