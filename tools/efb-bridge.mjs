#!/usr/bin/env node
// Wingdeck → EFB bridge.
// Receives own-ship telemetry from the browser over WebSocket (ws://localhost:8765) and re-broadcasts it on the
// local network as GDL 90 (UDP 4000) and XGPS/XATT (UDP 49002) — the formats ForeFlight, Garmin Pilot,
// SkyDemon, FltPlan Go, Avare, WingX and others accept from X-Plane or ADS-B receivers.
//
//   node tools/efb-bridge.mjs [--target 192.168.1.255] [--ws 8765] [--gdl90 4000] [--xgps 49002]
//
// No dependencies: Node 18+ built-ins only.
import http from 'node:http';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ GDL 90 encoding
const CRC = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i << 8;
  for (let b = 0; b < 8; b++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff;
  CRC[i] = c;
}
export function crc16(bytes) {
  let crc = 0;
  for (const b of bytes) crc = (CRC[crc >> 8] ^ (crc << 8) ^ b) & 0xffff;
  return crc;
}
/** Adds CRC (LSB first), byte-stuffs 0x7D/0x7E and wraps in 0x7E flags. */
export function frame(msg) {
  const crc = crc16(msg);
  const body = [...msg, crc & 0xff, crc >> 8];
  const out = [0x7e];
  for (const b of body) {
    if (b === 0x7e || b === 0x7d) out.push(0x7d, b ^ 0x20);
    else out.push(b);
  }
  out.push(0x7e);
  return Buffer.from(out);
}
export function unframe(buf) {
  const out = [];
  for (let i = 1; i < buf.length - 1; i++) {
    if (buf[i] === 0x7d) out.push(buf[++i] ^ 0x20);
    else out.push(buf[i]);
  }
  const msg = out.slice(0, -2);
  const crc = out[out.length - 2] | (out[out.length - 1] << 8);
  return { msg, ok: crc16(msg) === crc };
}
const s24 = (v) => {
  let x = Math.round(v) & 0xffffff;
  return [(x >> 16) & 0xff, (x >> 8) & 0xff, x & 0xff];
};
export function heartbeat(date = new Date()) {
  const secs = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  const st1 = 0x81; // GPS position valid, UAT initialised
  const st2 = (secs >> 16) & 1 ? 0x80 : 0x00; // timestamp bit 16
  return frame([0x00, st1, st2, secs & 0xff, (secs >> 8) & 0xff, 0x00, 0x00]);
}
export function ownship(t) {
  const lat = s24((t.lat / 180) * 0x800000);
  const lon = s24((t.lon / 180) * 0x800000);
  const alt = Math.max(0, Math.min(0xffe, Math.round(((t.pressAltFt ?? t.altFt) + 1000) / 25)));
  const misc = t.onGround ? 0x01 : 0x09; // true track, airborne flag
  const hv = Math.max(0, Math.min(0xffe, Math.round(t.gsKt)));
  const vv = Math.round((t.vsFpm ?? 0) / 64) & 0xfff;
  const trk = Math.round(((((t.trackDeg ?? 0) % 360) + 360) % 360) / (360 / 256)) & 0xff;
  const cs = (t.callsign ?? 'IFRSIM').padEnd(8, ' ').slice(0, 8);
  return frame([
    10, 0x00, 0xf0, 0x00, 0x01, ...lat, ...lon,
    (alt >> 4) & 0xff, ((alt & 0x0f) << 4) | misc,
    0x88, // NIC 8 / NACp 8
    (hv >> 4) & 0xff, ((hv & 0x0f) << 4) | ((vv >> 8) & 0x0f), vv & 0xff,
    trk, 0x01, ...Buffer.from(cs, 'ascii'), 0x00,
  ]);
}
export function geoAltitude(t) {
  const a = Math.round(t.altFt / 5) & 0xffff;
  return frame([11, (a >> 8) & 0xff, a & 0xff, 0x00, 0x0a]);
}
/** ForeFlight device identification (optional, shows the name in ForeFlight). */
export function foreflightId() {
  const name = Buffer.from('IFRTrnr '.padEnd(8).slice(0, 8));
  const long = Buffer.from('Wingdeck sim'.padEnd(16).slice(0, 16));
  return frame([0x65, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, ...name, ...long, 0, 0, 0, 0]);
}
export function xgps(t) {
  return Buffer.from(`XGPSWingdeck,${t.lon.toFixed(6)},${t.lat.toFixed(6)},${(t.altFt * 0.3048).toFixed(1)},${(t.trackDeg ?? 0).toFixed(2)},${((t.gsKt ?? 0) * 0.514444).toFixed(2)}`);
}
export function xatt(t) {
  return Buffer.from(`XATTWingdeck,${(t.hdgDeg ?? 0).toFixed(1)},${(t.pitchDeg ?? 0).toFixed(1)},${(t.rollDeg ?? 0).toFixed(1)}`);
}

// ------------------------------------------------------------------ minimal WebSocket server
function acceptKey(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}
function parseFrames(buf, onText) {
  let off = 0;
  while (off + 2 <= buf.length) {
    const b1 = buf[off + 1];
    const op = buf[off] & 0x0f;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (p + 2 > buf.length) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (p + 8 > buf.length) break;
      len = Number(buf.readBigUInt64BE(p));
      p += 8;
    }
    const masked = b1 & 0x80;
    const mask = masked ? buf.subarray(p, p + 4) : null;
    if (masked) p += 4;
    if (p + len > buf.length) break;
    const data = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    if (op === 1) onText(data.toString('utf8'));
    if (op === 8) return { rest: Buffer.alloc(0), close: true };
    off = p + len;
  }
  return { rest: buf.subarray(off), close: false };
}

export function startBridge({ wsPort = 8765, target = '255.255.255.255', gdlPort = 4000, xgpsPort = 49002, log = console.log } = {}) {
  const udp = dgram.createSocket('udp4');
  udp.bind(() => udp.setBroadcast(true));
  let last = null;
  let n = 0;
  const send = (buf, port) => udp.send(buf, port, target);
  const hb = setInterval(() => {
    send(heartbeat(), gdlPort);
    if (n++ % 5 === 0) send(foreflightId(), gdlPort);
    if (last) {
      send(geoAltitude(last), gdlPort);
    }
  }, 1000);
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Wingdeck EFB bridge is running. Connect the simulator to ws://localhost:' + wsPort + '\n');
  });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
    log(`simulator connected from ${req.socket.remoteAddress}`);
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const r = parseFrames(buf, (txt) => {
        try {
          const t = JSON.parse(txt);
          if (t.type !== 'ownship') return;
          last = t;
          send(ownship(t), gdlPort);
          send(xgps(t), xgpsPort);
          send(xatt(t), xgpsPort);
        } catch {
          /* ignore */
        }
      });
      buf = r.rest;
      if (r.close) socket.end();
    });
    socket.on('close', () => log('simulator disconnected'));
    socket.on('error', () => undefined);
  });
  server.listen(wsPort, () => log(`Wingdeck EFB bridge: ws://localhost:${wsPort} → GDL90 udp:${gdlPort}, XGPS udp:${xgpsPort} → ${target}`));
  return { close: () => { clearInterval(hb); server.close(); udp.close(); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
  };
  startBridge({ wsPort: Number(arg('--ws', 8765)), target: arg('--target', '255.255.255.255'), gdlPort: Number(arg('--gdl90', 4000)), xgpsPort: Number(arg('--xgps', 49002)) });
}
