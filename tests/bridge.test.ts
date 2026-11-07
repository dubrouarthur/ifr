import { describe, it, expect } from 'vitest';
import dgram from 'node:dgram';
// @ts-expect-error plain JS module
import { ownship, heartbeat, unframe, crc16, frame, startBridge, xgps } from '../tools/efb-bridge.mjs';

describe('GDL 90 encoding', () => {
  it('CRC matches the GDL 90 spec example (heartbeat)', () => {
    // ICD example: 0x00 0x81 0x41 0xDB 0xD0 0x08 0x02 → CRC 0x8BB3
    expect(crc16([0x00, 0x81, 0x41, 0xdb, 0xd0, 0x08, 0x02])).toBe(0x8bb3);
  });
  it('byte-stuffs flag bytes and round-trips', () => {
    const f = frame([0x7e, 0x7d, 0x01]);
    expect([...f.subarray(1, -1)].includes(0x7e)).toBe(false);
    const u = unframe(f);
    expect(u.ok).toBe(true);
    expect(u.msg).toEqual([0x7e, 0x7d, 0x01]);
  });
  it('encodes an ownship report with position, altitude and track', () => {
    const f = ownship({ lat: 47.5, lon: -35.0, altFt: 3000, pressAltFt: 3000, gsKt: 95, trackDeg: 270, vsFpm: -500, onGround: false, callsign: 'IFRSIM' });
    const { msg, ok } = unframe(f);
    expect(ok).toBe(true);
    expect(msg[0]).toBe(10);
    expect(msg.length).toBe(28);
    const lat = ((msg[5] << 16) | (msg[6] << 8) | msg[7]) << 8 >> 8;
    expect((lat / 0x800000) * 180).toBeCloseTo(47.5, 3);
    const alt = (msg[11] << 4) | (msg[12] >> 4);
    expect(alt * 25 - 1000).toBe(3000);
    expect(Math.round((msg[17] * 360) / 256)).toBe(270);
    expect(Buffer.from(msg.slice(19, 27)).toString()).toBe('IFRSIM  ');
    expect(unframe(heartbeat()).ok).toBe(true);
  });
  it('the bridge relays WebSocket telemetry to UDP GDL 90 and XGPS', async () => {
    const got: { gdl: Buffer[]; xgps: string[] } = { gdl: [], xgps: [] };
    const g = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const x = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    await new Promise<void>((r) => g.bind(47400, '127.0.0.1', () => r()));
    await new Promise<void>((r) => x.bind(47402, '127.0.0.1', () => r()));
    g.on('message', (m) => got.gdl.push(m));
    x.on('message', (m) => got.xgps.push(m.toString()));
    const br = startBridge({ wsPort: 48765, target: '127.0.0.1', gdlPort: 47400, xgpsPort: 47402, log: () => undefined });
    await new Promise((r) => setTimeout(r, 150));
    const ws = new WebSocket('ws://127.0.0.1:48765');
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.send(JSON.stringify({ type: 'ownship', lat: 47.5, lon: -35, altFt: 2500, pressAltFt: 2500, gsKt: 90, trackDeg: 90, hdgDeg: 88, pitchDeg: 2, rollDeg: 0, vsFpm: 0, onGround: false, callsign: 'IFRSIM' }));
    await new Promise((r) => setTimeout(r, 1300));
    ws.close();
    br.close();
    g.close();
    x.close();
    const own = got.gdl.map((b) => unframe(b)).filter((u) => u.ok && u.msg[0] === 10);
    expect(own.length).toBeGreaterThan(0);
    expect(got.gdl.some((b) => unframe(b).msg[0] === 0)).toBe(true); // heartbeat
    expect(got.xgps.some((s) => s.startsWith('XGPSWingdeck,-35.000000,47.500000'))).toBe(true);
    expect(got.xgps.some((s) => s.startsWith('XATT'))).toBe(true);
    expect(String(xgps({ lat: 1, lon: 2, altFt: 0, trackDeg: 0, gsKt: 0 }))).toContain('XGPS');
  });
});
