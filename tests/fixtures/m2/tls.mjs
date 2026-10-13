import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import https from 'node:https';
import http from 'node:http';
// Temporary certificate only. Tests retain real CORS/mixed-content/network checks.
export async function temporaryTLS(){const dir=await mkdtemp(join(tmpdir(),'mcp-studio-m2-tls-'));try{execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-days','1'],{stdio:'ignore'});return {options:{key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},close:()=>rm(dir,{recursive:true,force:true})};}catch(error){await rm(dir,{recursive:true,force:true});throw error;}}
// This fixture represents a TLS terminator in front of the production Go entry.
// It preserves Origin and all application security headers, including CSP.
export async function tlsTerminator(tls,upstreamPort){const server=https.createServer(tls,(req,res)=>{const proxy=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>proxy.destroy());req.pipe(proxy);});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});return {origin:`https://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})};}
