import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('./preview-schema-entry.ts',import.meta.url))],outfile:fileURLToPath(new URL('./vendor/preview-schema.js',import.meta.url)),bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,legalComments:'eof'});
console.log('Bundled the shared application JSON Schema validator for the preview.');
