import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

// Inspect physical regular-file headers: BSD tar's listing hides AppleDouble entries.
export function regularTarFiles(file) {
  const raw = gunzipSync(readFileSync(file)); const names = [];
  for (let offset = 0; offset + 512 <= raw.length;) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString().split('\0', 1)[0];
    const prefix = header.subarray(345, 500).toString().split('\0', 1)[0];
    const size = parseInt(header.subarray(124, 136).toString().replaceAll('\0', '').trim(), 8) || 0;
    if (header[156] === 0 || header[156] === 48) names.push(prefix ? prefix + '/' + name : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}
