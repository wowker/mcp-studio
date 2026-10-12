import net from 'node:net';
import http from 'node:http';

// Test-only SMTP sink. Messages stay in memory; no logs, disk queue or verified-user mutation.
export async function startMailCapture() {
  const sockets = new Set();
  const messages = [];
  let apiUrl;
  const smtp = net.createServer(socket => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(30_000, () => socket.destroy());
    socket.write('220 mcp-studio-test SMTP\r\n');
    let buffer = '', inData = false, from = null, recipients = [], content = [];
    const reset = () => { from = null; recipients = []; content = []; };
    socket.on('data', chunk => {
      parse(chunk);
    });
    const parse = chunk => {
      buffer += chunk;
      if (buffer.length + content.join('\r\n').length > 1_048_576) { socket.end('552 test message too large\r\n'); return; }
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (inData) {
          if (line !== '.') { content.push(line.startsWith('..') ? line.slice(1) : line); continue; }
          const raw = content.join('\r\n');
          const bodyStart = raw.indexOf('\r\n\r\n');
          const body = bodyStart < 0 ? raw : raw.slice(bodyStart + 4);
          for (const to of recipients) messages.push({ to, from, body });
          inData = false; reset(); socket.write('250 captured\r\n'); continue;
        }
        const command = line.split(' ', 1)[0].toUpperCase();
        if (command === 'EHLO' || command === 'HELO') { reset(); socket.write('250 mcp-studio-test\r\n'); }
        else if (command === 'MAIL') {
          const match = /^MAIL FROM:<([^<>\r\n]+)>$/i.exec(line);
          if (!match) socket.write('501 invalid sender\r\n');
          else { reset(); from = match[1].toLowerCase(); socket.write('250 sender accepted\r\n'); }
        } else if (command === 'RCPT') {
          const match = /^RCPT TO:<([^<>\r\n]+)>$/i.exec(line);
          if (!from) socket.write('503 sender required\r\n');
          else if (!match) socket.write('501 invalid recipient\r\n');
          else { recipients.push(match[1].toLowerCase()); socket.write('250 recipient accepted\r\n'); }
        } else if (command === 'DATA') {
          if (!from || !recipients.length) socket.write('503 envelope required\r\n');
          else { inData = true; socket.write('354 end with CRLF.CRLF\r\n'); }
        } else if (command === 'RSET') { reset(); socket.write('250 reset\r\n'); }
        else if (command === 'NOOP') socket.write('250 ok\r\n');
        else if (command === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('502 unsupported test command\r\n');
      }
    };
  });
  const api = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, apiUrl);
    const hosts = [new URL(apiUrl).host, `localhost:${new URL(apiUrl).port}`];
    if (!hosts.includes(req.headers.host) || req.headers.origin) { res.writeHead(403); return res.end('{"error":"test-endpoint-only"}'); }
    if (req.method !== 'GET' || url.pathname !== '/messages') { res.writeHead(404); return res.end('{"error":"not-found"}'); }
    const to = url.searchParams.get('to')?.toLowerCase();
    res.end(JSON.stringify({ messages: messages.filter(message => !to || message.to === to) }));
  });
  const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await Promise.all([listen(smtp), listen(api)]); }
  catch (error) {
    for (const server of [smtp, api]) if (server.listening) server.close();
    throw error;
  }
  apiUrl = `http://127.0.0.1:${api.address().port}`;
  return { smtpAddress: `127.0.0.1:${smtp.address().port}`, url: apiUrl, close: async () => { messages.length = 0; for (const s of sockets) s.destroy(); api.closeAllConnections(); await Promise.all([new Promise(r => smtp.close(r)), new Promise(r => api.close(r))]); } };
}
