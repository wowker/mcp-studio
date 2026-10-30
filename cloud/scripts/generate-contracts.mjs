import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const spec=JSON.parse(readFileSync('contracts/platform/openapi.json','utf8'));
const schemas=spec.components.schemas;
const lower=n=>n[0].toLowerCase()+n.slice(1);
function ts(s){if(s.$ref)return s.$ref.split('/').at(-1);if(s.enum)return s.enum.map(JSON.stringify).join(' | ');switch(s.type){case 'string':return 'string';case 'integer':return 'number';case 'boolean':return 'boolean';case 'array':return `Array<${ts(s.items)}>`;case 'object':return `{ ${Object.entries(s.properties).map(([k,v])=>`${k}${s.required.includes(k)?'':'?'}: ${ts(v)}`).join('; ')} }`;default:throw Error('Unsupported schema');}}
function z(s){if(s.$ref)return lower(s.$ref.split('/').at(-1))+'Schema';if(s.enum)return `z.union([${s.enum.map(v=>`z.literal(${JSON.stringify(v)})`).join(',')}])`;switch(s.type){case 'string':return 'z.string()';case 'integer':return 'z.number().int()';case 'boolean':return 'z.boolean()';case 'array':return `z.array(${z(s.items)})`;case 'object':return `z.object({${Object.entries(s.properties).map(([k,v])=>`${k}:${z(v)}${s.required.includes(k)?'':'.optional()'}`).join(',')}}).strict()`;default:throw Error('Unsupported schema');}}
function go(s){if(s.$ref)return s.$ref.split('/').at(-1);switch(s.type){case 'string':return 'string';case 'integer':return 'int';case 'boolean':return 'bool';case 'array':return '[]'+go(s.items);case 'object':return 'struct {\n'+Object.entries(s.properties).map(([k,v])=>`${(k[0].toUpperCase()+k.slice(1)).replace(/Id$/,'ID')} ${go(v)} \`json:"${k}${s.required.includes(k)?'':',omitempty'}"\``).join('\n')+'\n}';default:throw Error('Unsupported schema');}}
let out='// Generated from contracts/platform/openapi.json. Do not edit.\nimport {z} from "zod";\n';
let gout='// Code generated from contracts/platform/openapi.json. DO NOT EDIT.\npackage wire\n';
for(const [name,s] of Object.entries(schemas)){out+=`export type ${name} = ${ts(s)};\nexport const ${lower(name)}Schema = ${z(s)};\n`;gout+=`type ${name} ${go(s)}\n`;}
for(const [path,ops] of Object.entries(spec.paths))for(const [method,op] of Object.entries(ops)){if(!['get','post','patch','delete'].includes(method))throw Error('unsupported method');if(!op.operationId||!op.responses['200'])throw Error('invalid operation '+path);}
const gr=spawnSync('gofmt',{input:gout,encoding:'utf8'});if(gr.status!==0)throw Error(gr.stderr);
for(const [path,body] of [['apps/web/src/generated/platform.ts',out],['internal/wire/platform.gen.go',gr.stdout]]){if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==body)throw Error('Generated contract drift: '+path);}else{mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,body);}}
console.log(`Platform contract v${spec.info.version}: ${Object.keys(schemas).length} schemas, ${Object.keys(spec.paths).length} paths; generated boundaries match.`);
