import {expect,type Page,type Locator} from '@playwright/test';

// Required selectors come from the expected view, never from a filtered list of
// elements which already happened to have positive dimensions.
export async function verifyRequiredLayout(page:Page,selectors:readonly string[]){
 const geometry=await page.evaluate(selectors=>{
  const panes=selectors.map(selector=>{const elements=[...document.querySelectorAll(selector)];return {selector,count:elements.length,boxes:elements.map(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {width:rect.width,height:rect.height,display:style.display,visibility:style.visibility};})};});
  const footer=document.querySelector<HTMLElement>('.workbench-footer'),rect=footer?.getBoundingClientRect();
  const footerBox=rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom}:null;
  const points=rect&&footer?[[.1,.5],[.5,.5],[.9,.5]].map(([x,y])=>{const hit=document.elementFromPoint(rect.x+rect.width*x,rect.y+rect.height*y);return !!hit&&footer.contains(hit);}):[];
  return {panes,footer:{count:document.querySelectorAll('.workbench-footer').length,box:footerBox,unobstructed:points},viewport:{width:innerWidth,height:innerHeight}};
 },selectors);
 for(const pane of geometry.panes){expect(pane.count,`${pane.selector} must exist exactly once`).toBe(1);for(const box of pane.boxes){expect(box.width,`${pane.selector} width`).toBeGreaterThan(0);expect(box.height,`${pane.selector} height`).toBeGreaterThan(0);expect(box.display).not.toBe('none');expect(box.visibility).toBe('visible');}}
 expect(geometry.footer.count,'required bottom bar must exist').toBe(1);expect(geometry.footer.box).not.toBeNull();const footer=geometry.footer.box!;
 expect(footer.width).toBeGreaterThan(0);expect(footer.height).toBeGreaterThan(0);expect(footer.x).toBeGreaterThanOrEqual(0);expect(footer.y).toBeGreaterThanOrEqual(0);expect(footer.right).toBeLessThanOrEqual(geometry.viewport.width+.5);expect(footer.bottom,'bottom bar bottom stays in viewport').toBeLessThanOrEqual(geometry.viewport.height+.5);expect(geometry.footer.unobstructed).toEqual([true,true,true]);
 return geometry;
}

export async function verifyReachableControl(control:Locator){
 await control.scrollIntoViewIfNeeded();await control.focus();await expect(control).toBeFocused();await control.click({trial:true});
 const geometry=await control.evaluate(element=>{
  const rect=element.getBoundingClientRect();const clips=[];
  for(let parent=element.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent),box=parent.getBoundingClientRect();if(style.overflowX!=='visible')clips.push({axis:'x',start:box.left+parent.clientLeft,end:box.left+parent.clientLeft+parent.clientWidth});if(style.overflowY!=='visible')clips.push({axis:'y',start:box.top+parent.clientTop,end:box.top+parent.clientTop+parent.clientHeight});}
  const points=[[.15,.5],[.5,.5],[.85,.5]].map(([x,y])=>{const hit=document.elementFromPoint(rect.x+rect.width*x,rect.y+rect.height*y);return !!hit&&element.contains(hit);});
  return {box:{x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},viewport:{width:innerWidth,height:innerHeight},clips,unobstructed:points};
 });
 const {box}=geometry;expect(box.width).toBeGreaterThan(0);expect(box.height).toBeGreaterThan(0);expect(box.x).toBeGreaterThanOrEqual(-.5);expect(box.y).toBeGreaterThanOrEqual(-.5);expect(box.right).toBeLessThanOrEqual(geometry.viewport.width+.5);expect(box.bottom).toBeLessThanOrEqual(geometry.viewport.height+.5);
 for(const clip of geometry.clips){expect(clip.axis==='x'?box.x:box.y).toBeGreaterThanOrEqual(clip.start-.5);expect(clip.axis==='x'?box.right:box.bottom).toBeLessThanOrEqual(clip.end+.5);}expect(geometry.unobstructed).toEqual([true,true,true]);return geometry;
}
