import http from 'node:http';
import https from 'node:https';
import {randomBytes,createHash} from 'node:crypto';
/** Synthetic local MCP + authorization-server fixture. No production proxy or credential storage. */
export async function startM2Fixture({allowedOrigin,tls,publicHostname='127.0.0.1'}={}) {
 if(!['localhost','127.0.0.1'].includes(publicHostname))throw Error('unsupported-public-hostname');
 if(!allowedOrigin)throw Error('allowed-origin-required');
 const streams=new Map(),codes=new Map(),tokens=new Set(['fixture-token']),heldCalls=new Map();
 const stats={cookieRequests:0,initialize:0,httpInitialize:0,sseInitialize:0,toolsList:0,httpToolsList:0,sseToolsList:0,toolsCall:0,httpToolsCall:0,sseToolsCall:0,delayedCalls:0,releasedCalls:0,oauthExchanges:0,oauthDenials:0,oauthReplays:0,pkceVerified:0,resourceVerified:0};
 let origin;
 const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(value===undefined?'':JSON.stringify(value));};
 const toolDefinitions=[
  {name:'echo',title:'Echo',description:'Returns supplied text',inputSchema:{type:'object',properties:{text:{type:'string',minLength:1},count:{type:'integer',minimum:0},enabled:{type:'boolean'},note:{type:['string','null']}},required:['text'],additionalProperties:false},outputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']},annotations:{readOnlyHint:true}},
  {name:'nested',title:'Nested arguments',description:'Exercises nested object and array parameters',inputSchema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{quantity:{type:'integer',minimum:0},enabled:{type:'boolean'}},required:['quantity'],additionalProperties:false}},mode:{type:'string',enum:['preview','apply']}},required:['items'],additionalProperties:false}},
 ];
 const schemaTools=[
  {name:'composed',inputSchema:{type:'object',allOf:[{properties:{x:{type:'integer'}},required:['x']},{properties:{kind:{const:'demo'}},required:['kind']}],unevaluatedProperties:false}},
  {name:'recursive',inputSchema:{$dynamicAnchor:'node',type:'object',properties:{value:{type:'integer'},next:{$dynamicRef:'#node'}},required:['value'],additionalProperties:false}},
  {name:'remote',inputSchema:{type:'object',properties:{x:{$ref:'https://never-fetch.invalid/schema'}},required:['x']}},
 ];
 const resultFor=(message,schemaProfile=false)=>{
  if(message.method==='initialize')return {protocolVersion:'2025-11-25',serverInfo:{name:'m2-controlled-fixture',version:'1.0'},capabilities:{tools:{}}};
  if(message.method==='tools/list'&&schemaProfile)return {tools:schemaTools};
  if(message.method==='tools/list')return message.params?.cursor==='second'?{tools:[toolDefinitions[1]]}:message.params?.cursor===undefined?{tools:[toolDefinitions[0]],nextCursor:'second'}:undefined;
  if(message.method==='tools/call'){
   const args=message.params?.arguments??{};
   if(args.text==='fixture-tool-error')return {isError:true,content:[{type:'text',text:'controlled tool failure'}]};
   if(args.text==='fixture-output-invalid')return {content:[{type:'text',text:'controlled invalid output'}],structuredContent:{text:1}};
   if(message.params?.name==='echo')return {content:[{type:'text',text:String(args.text??'')}],structuredContent:{text:args.text}};
   if(message.params?.name==='nested')return {content:[{type:'text',text:JSON.stringify(args)}],structuredContent:args};
  }
  return undefined;
 };
 const wireFor=(message,schemaProfile=false)=>{
  if(message.method==='tools/call'&&message.params?.arguments?.text==='fixture-rpc-error')return {jsonrpc:'2.0',id:message.id,error:{code:-32603,message:'controlled RPC failure'}};
  const result=resultFor(message,schemaProfile);return result?{jsonrpc:'2.0',id:message.id,result}:{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unknown method'}};
 };
 const handler=async(req,res)=>{
  const url=new URL(req.url,origin),path=url.pathname;
  if(req.headers.cookie)stats.cookieRequests++;
  if(req.headers.origin&&req.headers.origin!==allowedOrigin)return reply(res,403,{error:'origin-rejected'});
  if(req.headers.host!==new URL(origin).host)return reply(res,403,{error:'host-rejected'});
  if(path!=='/cors-denied'){
   res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept, Authorization, MCP-Session-Id, MCP-Protocol-Version');res.setHeader('Access-Control-Expose-Headers','MCP-Session-Id, WWW-Authenticate');
  }
  if(req.method==='OPTIONS')return reply(res,204);
  if(path==='/stats'&&req.method==='GET')return reply(res,200,stats);
  if(path==='/release-tools'&&req.method==='POST'){for(const [held,message]of heldCalls){stats.releasedCalls++;if(!held.destroyed)reply(held,200,wireFor(message));}heldCalls.clear();return reply(res,200,{released:stats.releasedCalls});}
  if(path==='/authorize'){
   const redirect=url.searchParams.get('redirect_uri');
   if(redirect!==allowedOrigin+'/oauth/callback'||!url.searchParams.get('client_id')||url.searchParams.get('code_challenge_method')!=='S256'||url.searchParams.get('response_type')!=='code'||![origin+'/oauth-mcp',origin+'/oauth-deny-mcp'].includes(url.searchParams.get('resource')))return reply(res,400,{error:'invalid-authorization-request'});
   const target=new URL(redirect);target.searchParams.set('state',url.searchParams.get('state')??'');target.searchParams.set('iss',origin);
   if(url.searchParams.get('scope')?.includes('deny')){stats.oauthDenials++;target.searchParams.set('error','access_denied');}
   else{const code=randomBytes(24).toString('base64url');codes.set(code,{challenge:url.searchParams.get('code_challenge'),resource:url.searchParams.get('resource'),clientId:url.searchParams.get('client_id'),redirect,expires:Date.now()+60000});target.searchParams.set('code',code);}
   res.writeHead(302,{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();
  }
  if(path==='/.well-known/oauth-protected-resource/oauth-deny-mcp')return reply(res,200,{resource:origin+'/oauth-deny-mcp',authorization_servers:[origin],scopes_supported:['deny']});
  if(path==='/.well-known/oauth-protected-resource/oauth-mcp'||path==='/.well-known/oauth-protected-resource')return reply(res,200,{resource:origin+'/oauth-mcp',authorization_servers:[origin],scopes_supported:['read']});
  if(path==='/.well-known/oauth-authorization-server'||path==='/.well-known/openid-configuration')return reply(res,200,{issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',code_challenge_methods_supported:['S256'],response_types_supported:['code'],token_endpoint_auth_methods_supported:['none']});
  if(path==='/metadata-malicious')return reply(res,200,{resource:origin+'/oauth-mcp',authorization_servers:['http://invalid.example']});
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>32768)return reply(res,413,{error:'too-large'});}
  if(path==='/token'&&req.method==='POST'){
   const p=new URLSearchParams(raw),code=p.get('code'),entry=codes.get(code);codes.delete(code);stats.oauthExchanges++;
   if(!entry){stats.oauthReplays++;return reply(res,400,{error:'invalid_grant'});}
   const challenge=createHash('sha256').update(p.get('code_verifier')??'').digest('base64url');
   if(p.get('grant_type')!=='authorization_code'||entry.expires<=Date.now()||entry.challenge!==challenge||entry.resource!==p.get('resource')||entry.redirect!==p.get('redirect_uri')||entry.clientId!==p.get('client_id')||p.has('client_secret'))return reply(res,400,{error:'invalid_grant'});
   stats.pkceVerified++;stats.resourceVerified++;const token=randomBytes(32).toString('base64url');tokens.add(token);return reply(res,200,{access_token:token,token_type:'Bearer',expires_in:300,refresh_token:'synthetic-refresh-not-supported'});
  }
  if(path==='/oauth-mcp'||path==='/oauth-deny-mcp'||path==='/token-mcp'){
   const token=req.headers.authorization?.replace(/^Bearer /u,'');
   if(!tokens.has(token)){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/${path==='/oauth-deny-mcp'?'oauth-deny-mcp':'oauth-mcp'}", scope="${path==='/oauth-deny-mcp'?'deny':'read'}"`);return reply(res,401,{error:'authorization-required'});}
  }
  if(path==='/cors-denied')return reply(res,200,{ok:true});
  if(path==='/slow-mcp')return; // Deliberately until aborted. closeAllConnections tears down test handles.
  if(path==='/failure')return reply(res,500,{error:'controlled-failure'});
  if(['/mcp','/oauth-mcp','/token-mcp','/schema-mcp'].includes(path)){
   if(req.method==='DELETE')return reply(res,204);
   if(req.method!=='POST')return reply(res,405);
   let message;try{message=JSON.parse(raw);}catch{return reply(res,400,{error:'invalid-json'});}
   if(message.id===undefined)return reply(res,202);
   if(message.method==='initialize'){stats.initialize++;stats.httpInitialize++;}
   if(message.method==='tools/list'){stats.toolsList++;stats.httpToolsList++;}
   if(message.method==='tools/call'){
    stats.toolsCall++;stats.httpToolsCall++;
    if(message.params?.arguments?.text==='fixture-call-401')return reply(res,401,{error:'controlled-credential-rejection'});
    if(message.params?.arguments?.text==='fixture-call-network'){req.socket.destroy();return;}
    if(message.params?.arguments?.text==='fixture-slow-result'){stats.delayedCalls++;heldCalls.set(res,message);return;}
   }
   return reply(res,200,wireFor(message,path==='/schema-mcp'));
  }
  if(path==='/sse'&&req.method==='GET'){
   const id=randomBytes(16).toString('hex');res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(`event: endpoint\ndata: /messages?session=${id}\n\n`);streams.set(id,res);res.on('close',()=>streams.delete(id));return;
  }
  if(path==='/messages'&&req.method==='POST'){
   const stream=streams.get(url.searchParams.get('session'));if(!stream)return reply(res,404,{error:'missing-stream'});
   let message;try{message=JSON.parse(raw);}catch{return reply(res,400);}
   if(message.method==='initialize'){stats.initialize++;stats.sseInitialize++;}
   if(message.method==='tools/list'){stats.toolsList++;stats.sseToolsList++;}
   if(message.method==='tools/call'){stats.toolsCall++;stats.sseToolsCall++;}
   if(message.id!==undefined)stream.write(`event: message\ndata: ${JSON.stringify(wireFor(message))}\n\n`);
   return reply(res,202);
  }
  return reply(res,404,{error:'not-found'});
 };
 const server=tls?https.createServer(tls,handler):http.createServer(handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});origin=`${tls?'https':'http'}://${publicHostname}:${server.address().port}`;
 return {origin,oauthOrigin:origin,stats,close:()=>new Promise(resolve=>{for(const s of streams.values())s.destroy();heldCalls.clear();server.closeAllConnections();server.close(resolve);})};
}
