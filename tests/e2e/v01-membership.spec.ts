import {test,expect,type APIRequestContext} from '@playwright/test';
import {z} from 'zod';
import * as wire from '../../apps/web/src/generated/platform';
import {bootstrap,requestData,session} from './production-helpers';

const password='Fixture-Password-12';
async function post(request:APIRequestContext,path:string,data:unknown,csrf?:string){
 const response=await request.post(`/api/v1${path}`,{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!,...(csrf?{'X-CSRF-Token':csrf}:{})},data});
 expect(response.status()).toBe(200);return response;
}
async function mailCode(request:APIRequestContext,email:string,count:number){
 let body='';await expect.poll(async()=>{
  const response=await request.get(`${process.env.PLAYWRIGHT_MAIL_URL}/messages?to=${encodeURIComponent(email)}`);
  expect(response.status()).toBe(200);
  const messages=z.object({messages:z.array(z.object({body:z.string()}))}).parse(await response.json()).messages;
  body=messages.at(-1)?.body??'';return messages.length;
 }).toBe(count);return body.trim().split(/\r?\n/).at(-1)!;
}

for(const scope of ['project','team'] as const){
 test(`V01 A28: cancelling ${scope} removal preserves real memberships, invitations and audit without API mutations`,async({page,request,browser})=>{
  await bootstrap(page,request);const owner=await session(page.request),teamId=owner.teams[0].id;
  const projects:wire.Project[]=[];
  for(const name of [`Cancellation primary ${scope}`,`Cancellation other ${scope}`]){
   const response=await post(page.request,`/teams/${teamId}/projects`,{name,description:''},owner.csrf);
   projects.push(z.object({data:wire.projectSchema}).parse(await response.json()).data);
  }
  const [primary,other]=projects,name=`Cancellation member ${scope}`,email=`v01-cancel-${scope}@example.test`;
  const invitationResponse=await post(page.request,`/projects/${primary.id}/invitations`,{email,teamRole:'member',projectRole:'developer',days:7},owner.csrf);
  const invitation=z.object({data:wire.invitationSchema}).parse(await invitationResponse.json()).data;
  const token=await mailCode(request,email,1);
  const member=await browser.newContext({baseURL:process.env.PLAYWRIGHT_BASE_URL,ignoreHTTPSErrors:process.env.PLAYWRIGHT_FIXTURE_TLS==='true'});
  try{
   await post(member.request,'/invitation/register',{email,name,password,token});
   const verification=await mailCode(request,email,2);
   await post(member.request,'/verification/confirm',{token:verification});
   await post(member.request,'/login',{email,password});const contributor=await session(member.request);
   await post(member.request,`/invitations/${invitation.id}/accept`,{token},contributor.csrf);
   const granted=await page.request.patch(`/api/v1/projects/${other.id}/members/${contributor.user.id}`,{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!,'X-CSRF-Token':owner.csrf},data:{role:'viewer'}});expect(granted.status()).toBe(200);
   const snapshot=async()=>({
    team:await requestData(page.request,`/teams/${teamId}/members`,z.array(wire.memberSchema)),
    primary:await requestData(page.request,`/projects/${primary.id}/members`,z.array(wire.memberSchema)),
    other:await requestData(page.request,`/projects/${other.id}/members`,z.array(wire.memberSchema)),
    invitations:await requestData(page.request,`/projects/${primary.id}/invitations`,z.array(wire.invitationSchema)),
    audit:await requestData(page.request,`/projects/${primary.id}/audit`,z.array(wire.auditSchema)),
   });
   const before=await snapshot();
   expect(before.primary.find(row=>row.id===contributor.user.id)?.projectRole).toBe('developer');
   expect(before.other.find(row=>row.id===contributor.user.id)?.projectRole).toBe('viewer');
   await page.goto(`/?page=members&project=${primary.id}`);
   await expect(page.getByRole('heading',{name:'成员与邀请',exact:true})).toBeVisible();
   if(scope==='team')await page.getByRole('button',{name:'团队成员',exact:true}).click();
   await page.getByRole('button',{name,exact:true}).click();
   const writes:string[]=[];page.on('request',outgoing=>{
    if(new URL(outgoing.url()).pathname.startsWith('/api/v1/')&&outgoing.method()!=='GET')writes.push(`${outgoing.method()} ${new URL(outgoing.url()).pathname}`);
   });
   await page.getByRole('button',{name:scope==='project'?'移出项目':'移出团队',exact:true}).click();
   const confirmation=page.locator('.ui-confirmation');
   await expect(confirmation).toContainText(scope==='project'?`仅将${name}移出项目“${primary.name}”，保留团队和其他项目关系。`:`将${name}移出团队及团队下所有项目，并撤销待接受邀请。`);
   expect(writes).toEqual([]);
   await confirmation.getByRole('button',{name:'取消',exact:true}).click();
   await expect(page.getByRole('button',{name:'确认移除',exact:true})).toHaveCount(0);
   await expect(page.getByLabel(scope==='project'?'项目角色':'团队角色',{exact:true})).toHaveValue(scope==='project'?'developer':'member');
   await page.getByRole('button',{name:'取消',exact:true}).click();
   await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
   expect(await snapshot()).toEqual(before);expect(writes).toEqual([]);
   await page.reload();
   if(scope==='team')await page.getByRole('button',{name:'团队成员',exact:true}).click();
   await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
   expect(await snapshot()).toEqual(before);expect(writes).toEqual([]);
   expect((await requestData(member.request,`/projects/${primary.id}`,wire.projectSchema)).role).toBe('developer');
   expect((await requestData(member.request,`/projects/${other.id}`,wire.projectSchema)).role).toBe('viewer');
  }finally{await member.close();}
 });
}
