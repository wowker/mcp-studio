// Test-only container SMTP STARTTLS sink. Contents stay in memory and are never logged.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import { readFileSync } from 'node:fs';
const secureContext = tls.createSecureContext({ cert: readFileSync('/run/secrets/tls_cert'), key: readFileSync('/run/secrets/tls_key'), minVersion: 'TLSv1.2' });
const messages = [];
let upgrades = 0;
const smtp = net.createServer(raw => { let socket = raw, buffer = '', secured = false, inData = false, content = [], recipients = [], from = ''; const write = s => socket.write(s + '\r\n'); const parse = chunk => { buffer += chunk; while (buffer.includes('\r\n')) {
    const end = buffer.indexOf('\r\n');
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    if (inData) {
        if (line !== '.') {
            content.push(line);
            continue;
        }
        const body = content.join('\r\n').split('\r\n\r\n').slice(1).join('\r\n\r\n');
        for (const to of recipients)
            messages.push({ to, body });
        inData = false;
        content = [];
        write('250 captured');
        continue;
    }
    const command = line.split(' ', 1)[0].toUpperCase();
    if (command === 'EHLO') {
        if (!secured)
            write('250-fixture\r\n250 STARTTLS');
        else
            write('250 fixture');
    }
    else if (command === 'STARTTLS' && !secured) {
        write('220 Ready');
        socket.removeListener('data', parse);
        socket = new tls.TLSSocket(raw, { isServer: true, secureContext });
        socket.setEncoding('utf8');
        socket.on('data', parse);
        socket.on('error', () => socket.destroy());
        secured = true;
        upgrades++;
        return;
    }
    else if (!secured && command !== 'QUIT')
        write('530 STARTTLS required');
    else if (command === 'MAIL') {
        from = line;
        recipients = [];
        write('250 accepted');
    }
    else if (command === 'RCPT') {
        recipients.push(line.match(/<([^>]+)>/)?.[1]);
        write('250 accepted');
    }
    else if (command === 'DATA') {
        inData = true;
        write('354 Continue');
    }
    else if (command === 'QUIT')
        socket.end('221 bye\r\n');
    else
        write('250 ok');
} }; socket.setEncoding('utf8'); socket.on('data', parse); socket.on('error', () => socket.destroy()); write('220 fixture SMTP'); });
smtp.listen(2525, '0.0.0.0');
http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); if (req.headers.origin) {
    res.writeHead(403);
    res.end('{}');
    return;
} res.end(JSON.stringify({ messages, upgrades })); }).listen(3030, '0.0.0.0');
