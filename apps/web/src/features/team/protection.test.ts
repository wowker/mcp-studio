import {describe, expect, it} from 'vitest';
import {memberProtection} from './protection';
import type {Member} from '../../generated/platform';
const target:Member={id:'other',email:'other@example.test',name:'Other',teamRole:'member',projectRole:'maintainer'};
describe('member action protections',()=>{
  it('protects self and Owner regardless of management role',()=>{
    expect(memberProtection({...target,id:'self'},'self','owner',2)).toBe('self');
    expect(memberProtection({...target,teamRole:'owner'},'self','owner',2)).toBe('owner');
  });
  it('protects the last maintainer from project demotion or removal',()=>{
    expect(memberProtection(target,'self','owner',1)).toBe('last_maintainer');
    expect(memberProtection(target,'self','owner',2)).toBe(null);
  });
  it('prevents Admin from changing another Admin',()=>{
    expect(memberProtection({...target,teamRole:'admin'},'self','admin',2)).toBe('admin');
    expect(memberProtection({...target,teamRole:'admin'},'self','owner',2)).toBe(null);
  });
});
