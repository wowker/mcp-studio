import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// Build first, then own the executable directly so stopping dev leaves no Go child behind.
const runDirectory=new URL('../.run/',import.meta.url);
await mkdir(runDirectory,{recursive:true});
const executable=fileURLToPath(new URL(process.platform==='win32' ? 'workbench-platform.exe' : 'workbench-platform',runDirectory));
const build=spawn('go',['build','-o',executable,'./cmd/platform'],{cwd:new URL('../service-workbench/platform/',import.meta.url),stdio:'inherit'});
const built=await new Promise(resolve=>{build.once('error',error=>resolve({code:1,error}));build.once('exit',code=>resolve({code}));});
if(built.code!==0){if(built.error)console.error(built.error.message);process.exit(1);}
const children=[spawn(executable,[],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','service-workbench/web/vite.config.ts'],{stdio:'inherit'})];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
const pending=children.map(child=>new Promise(resolve=>{child.once('error',error=>resolve({code:1,error}));child.once('exit',(code,signal)=>resolve({code,signal}));}));
const result=await Promise.race(pending);stop();await Promise.all(pending);
if(result.error)console.error(result.error.message);
process.exitCode=result.code===0||result.signal==='SIGTERM' ? 0 : 1;
