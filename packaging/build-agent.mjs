import { spawnSync } from 'node:child_process';
import {prepareCandidateDirectory} from './candidate-path.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = prepareCandidateDirectory(root,process.env.MCP_STUDIO_CANDIDATE_DIR);
const version = '0.1.0-m7-candidate';
const run = (command, args, options = {}) => {
 const r = spawnSync(command, args, { cwd: root, encoding:'utf8', ...options });
 if (r.status !== 0) throw new Error(`${command} failed: ${r.stderr || r.error || 'unknown failure'}`);
 return r.stdout.trim();
};
const digest = data => createHash('sha256').update(data).digest('hex');
const revision = run('git', ['rev-parse','HEAD']);
const dirty = run('git', ['status','--porcelain']).length > 0;
const sources = [];
function collect(dir) { for (const name of readdirSync(join(root,dir)).sort()) {const p=join(dir,name);if(lstatSync(join(root,p)).isDirectory())collect(p);else if(/\.(go|c|h|m|mjs|sh|ps1)$/.test(p))sources.push(p);} }
collect('cmd/agent');collect('internal');
collect('packaging');
for(const name of ['go.mod','go.sum'])sources.push(name);
const sourceHash = digest(sources.sort().map(p=>`${p}\0${digest(readFileSync(join(root,p)))}`).join('\n'));
const targets = [{os:'darwin',arch:'arm64',cgo:'1'},{os:'windows',arch:'amd64',cgo:'0'},{os:'linux',arch:'amd64',cgo:'0'},{os:'linux',arch:'arm64',cgo:'0'}];
const artifacts = [];
for(const target of targets) {
 const name=`mcp-studio-agent-${version}-${target.os}-${target.arch}`;
 const dir=join(output,name);
 if(existsSync(dir))throw new Error('Output exists; move previous private candidate directory before rebuilding.');
 mkdirSync(dir,{mode:0o700});
 const executable=target.os==='windows'?'mcp-studio-agent.exe':'mcp-studio-agent';
 const binary=join(dir,executable);
 run('go',['build','-trimpath','-ldflags',`-X main.version=${version} -X main.revision=${revision}${dirty?'-dirty':''}`,'-o',binary,'./cmd/agent'],{env:{...process.env,GOOS:target.os,GOARCH:target.arch,CGO_ENABLED:target.cgo,GOCACHE:process.env.GOCACHE || '/private/tmp/mcp-studio-go-cache'}});
 const wrapper=target.os==='windows'?'install.ps1':'install.sh';
 copyFileSync(join(root,'packaging',wrapper),join(dir,wrapper));if(target.os!=='windows')chmodSync(join(dir,wrapper),0o700);
 const manifest={format:'mcp-studio-agent.candidate.v1',version,revision,dirty,sourceSHA256:sourceHash,target,goVersion:run('go',['version']),binarySHA256:digest(readFileSync(binary)),support:'pending-native-validation',signing:'unsigned-not-published',nativeInstallation:'pending',nativeVault:'not-probed',autoStart:false,statePolicy:'preserve-on-upgrade-and-uninstall',windowsMSI:target.os==='windows'?'pending-native-toolchain':undefined};
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 writeFileSync(join(dir,'CHECKSUMS.sha256'),[executable,wrapper,'manifest.json'].map(p=>`${digest(readFileSync(join(dir,p)))}  ${p}`).join('\n')+'\n');
 const archive=join(output,`${name}.${target.os==='windows'?'zip':'tar.gz'}`);
 if(target.os==='windows')run('zip',['-q','-r',archive,name],{cwd:output});else run('tar',['--no-acls','--no-xattrs','-czf',archive,'-C',output,name],{env:{...process.env,COPYFILE_DISABLE:'1'}});
 artifacts.push({file:relative(output,archive),sha256:digest(readFileSync(archive)),...manifest});
 if(target.os==='darwin') {
  const pkg=join(output,`${name}-unsigned.pkg`);
  run('pkgbuild',['--root',dir,'--identifier','dev.mcp-studio.agent.candidate','--version','0.1.0','--install-location','/Applications/MCP Studio Agent Candidate','--ownership','recommended',pkg]);
  artifacts.push({file:relative(output,pkg),sha256:digest(readFileSync(pkg)),...manifest,packagePurpose:'candidate-files-only-no-service-or-state-initialization'});
 }
}
writeFileSync(join(output,'manifest.json'),JSON.stringify({version,revision,dirty,sourceSHA256:sourceHash,artifacts},null,2)+'\n');
writeFileSync(join(output,'CHECKSUMS.sha256'),artifacts.map(a=>`${a.sha256}  ${a.file}`).concat(`${digest(readFileSync(join(output,'manifest.json')))}  manifest.json`).join('\n')+'\n');
process.stdout.write(JSON.stringify({output,version,revision,sourceSHA256:sourceHash,artifacts:artifacts.map(({file,sha256})=>({file,sha256}))},null,2)+'\n');
