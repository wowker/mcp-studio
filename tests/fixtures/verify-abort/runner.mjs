import { runChecked, withTestSchema } from '../../../scripts/test-runtime.mjs';
const controller = new AbortController();
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>controller.abort());
try {
 await withTestSchema(process.env.MCP_STUDIO_TEST_DATABASE_URL, scoped=>runChecked(process.env.MCP_STUDIO_ABORT_TEST_BINARY ?? '.runtime/verify-abort-fixture',[process.argv[2],'wait'],{quiet:true,signal:controller.signal,env:{MCP_STUDIO_TEST_DATABASE_URL:scoped}}));
} catch(error) { process.exitCode=error.exitCode??1; }
