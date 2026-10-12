import { createInterface } from 'node:readline';
import { startFixture } from './fixture.mjs';

const fixture = await startFixture({ origin: process.env.COMPAT_ORIGIN ?? 'https://fixture.invalid' });
const output = value => console.log(JSON.stringify(value));
output({ type: 'ready', base: fixture.base });
const terminal = createInterface({ input: process.stdin });
const reviewed = new Set();
// This stdin is the local operator UI. There is deliberately no HTTP approval endpoint.
// The code display is intentional local pairing UI; do not redirect this interactive UI to logs.
terminal.on('line', line => {
  if (line === 'show') {
    const requests = fixture.listPendingLocally();
    for (const request of requests) reviewed.add(request.requestId);
    return output({ type: 'pending', requests });
  }
  const [command, requestId] = line.split(' ');
  if (command === 'confirm' && requestId) {
    if (!reviewed.has(requestId)) return output({ type: 'review-required' });
    try { return output({ type: 'local-pairing-code', requestId, ...fixture.confirmLocally(requestId) }); }
    catch { return output({ type: 'expired-or-unknown' }); }
  }
  if (line === 'unpair') { fixture.unpairLocally(); return output({ type: 'unpaired' }); }
  output({ type: 'instructions', commands: ['show (review exact identity first)', 'confirm <requestId> (local explicit approval)', 'unpair'] });
});
async function stop() { terminal.close(); await fixture.close(); process.exit(0); }
process.once('SIGTERM', stop);
