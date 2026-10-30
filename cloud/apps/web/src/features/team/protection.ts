import type {Member,TeamRole} from '../../generated/platform';
export function memberProtection(member:Member,self:string,actor:TeamRole,maintainers:number):'self'|'owner'|'admin'|'last_maintainer'|null{
 if(member.id===self)return 'self';if(member.teamRole==='owner')return 'owner';if(actor==='admin'&&member.teamRole==='admin')return 'admin';if(member.projectRole==='maintainer'&&maintainers<=1)return 'last_maintainer';return null;
}
