import {isAbsolute,join,relative,resolve,sep,dirname} from 'node:path';
import {existsSync,lstatSync,mkdirSync} from 'node:fs';

// Each verify run gets a fresh directory; never overwrite prior deliverables.
export function prepareCandidateDirectory(root,requested) {
 const runtime=join(root,'.runtime');
 const output=requested===undefined?join(runtime,'distribution'):requested;
 const rel=relative(runtime,output);
 if(!isAbsolute(output)||resolve(output)!==output||!rel||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('Candidate directory must be an absolute child of .runtime.');
 for(let path=output;;path=dirname(path)){
  if(existsSync(path)){const info=lstatSync(path);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('Unsafe candidate directory.');}
  // Detect dangling symlinks, which existsSync intentionally omits.
  else {try{if(lstatSync(path).isSymbolicLink())throw new Error('Unsafe candidate directory.');}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(dirname(path)===path)break;
 }
 if(existsSync(output))throw new Error('Candidate output must be fresh; prior deliverables were preserved.');
 mkdirSync(dirname(output),{recursive:true,mode:0o700});
 mkdirSync(output,{mode:0o700});
 return output;
}
