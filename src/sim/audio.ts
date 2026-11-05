// Cockpit audio: engine, stall horn, marker beacon, AP disconnect, altitude alerter, minimums callout.
import type { Sim } from './sim';

import { CalloutMonitor, type CalloutProfile } from './callouts';
import { ANNUNCIATOR_LEVEL, type Annunciator } from './systemsTypes';

const PRIORITY: Record<string, number> = { pullup: 10, terrain: 9, toolowterrain: 9, windshear: 9, stall: 8, sinkrate: 7, glideslope: 6, bankangle: 6, minimums: 5, plus100: 4, retard: 4 };

export class CockpitAudio {
  /** automatic callouts (radio altitude, minimums, GPWS) */
  callouts = new CalloutMonitor();
  private clips = new Map<string, AudioBuffer | 'loading'>();
  private queue: string[] = [];
  private playing: AudioBufferSourceNode | null = null;
  private playingId = '';
  private voiceGain!: GainNode;
  setCalloutProfile(p: CalloutProfile) {
    this.callouts.profile = p;
  }
  private loadClip(id: string) {
    if (!this.ctx || this.clips.has(id)) return;
    this.clips.set(id, 'loading');
    fetch(`/audio/callouts/${id}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx!.decodeAudioData(b))
      .then((buf) => {
        this.clips.set(id, buf);
        this.pump();
      })
      .catch(() => this.clips.delete(id));
  }
  /** queue a callout; higher-priority warnings interrupt lower ones */
  callout(id: string) {
    if (!this.ctx || this.muted) return;
    this.loadClip(id);
    const pr = PRIORITY[id] ?? 1;
    if (this.playing && pr > (PRIORITY[this.playingId] ?? 1) + 2) {
      try { this.playing.stop(); } catch { /* already stopped */ }
      this.playing = null;
    }
    if (!this.queue.includes(id)) this.queue.push(id);
    this.queue.sort((a, b) => (PRIORITY[b] ?? 1) - (PRIORITY[a] ?? 1));
    if (this.queue.length > 3) this.queue.length = 3;
    this.pump();
  }
  private pump() {
    if (!this.ctx || this.playing || !this.queue.length) return;
    const id = this.queue[0];
    const buf = this.clips.get(id);
    if (!buf) return this.loadClip(id);
    if (buf === 'loading') return;
    this.queue.shift();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    src.onended = () => {
      if (this.playing === src) this.playing = null;
      this.pump();
    };
    this.playing = src;
    this.playingId = id;
    src.start();
  }

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engOsc!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engGain!: GainNode;
  private engFilter!: BiquadFilterNode;
  private noise!: AudioBufferSourceNode;
  private noiseGain!: GainNode;
  private horn!: OscillatorNode;
  private hornGain!: GainNode;
  private marker!: OscillatorNode;
  private markerGain!: GainNode;
  /** open door: buffeting wind roar through a band-pass */
  private doorGain!: GainNode;
  private lastAnn: readonly Annunciator[] = [];
  private lastAnnTime = -1;
  private lastChime = -10;
  private roughPhase = 0;
  muted = false;
  private lastAp = false;
  private altAlerted = false;
  private lastAltSel = 0;
  private t = 0;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const c = new Ctx();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(c.destination);
    this.voiceGain = c.createGain();
    this.voiceGain.gain.value = 1.4;
    this.voiceGain.connect(this.master);
    // preload the most common clips
    for (const id of ['500', '100', 'plus100', 'minimums', 'sinkrate', 'pullup', 'glideslope']) this.loadClip(id);
    // engine: two detuned saws through a low-pass + some wind noise
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0.08;
    this.engOsc = c.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2 = c.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc.connect(this.engFilter);
    this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc.start();
    this.engOsc2.start();
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6;
    }
    this.noise = c.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0.02;
    this.noise.connect(this.noiseGain).connect(this.master);
    this.noise.start();
    const door = c.createBufferSource();
    door.buffer = buf;
    door.loop = true;
    door.playbackRate.value = 1.7;
    const doorBp = c.createBiquadFilter();
    doorBp.type = 'bandpass';
    doorBp.frequency.value = 520;
    doorBp.Q.value = 0.7;
    this.doorGain = c.createGain();
    this.doorGain.gain.value = 0;
    door.connect(doorBp).connect(this.doorGain).connect(this.master);
    door.start();
    // stall horn
    this.horn = c.createOscillator();
    this.horn.type = 'sawtooth';
    this.horn.frequency.value = 520;
    this.hornGain = c.createGain();
    this.hornGain.gain.value = 0;
    this.horn.connect(this.hornGain).connect(this.master);
    this.horn.start();
    // marker beacon (outer = 400 Hz dashes)
    this.marker = c.createOscillator();
    this.marker.frequency.value = 400;
    this.markerGain = c.createGain();
    this.markerGain.gain.value = 0;
    this.marker.connect(this.markerGain).connect(this.master);
    this.marker.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    if (!m) this.start();
  }

  private beep(freq: number, dur: number, vol = 0.15, type: OscillatorType = 'sine', delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.01);
    g.gain.setValueAtTime(vol, c.currentTime + delay + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, c.currentTime + delay + dur);
    o.connect(g).connect(this.master);
    o.start(c.currentTime + delay);
    o.stop(c.currentTime + delay + dur + 0.05);
  }

  /** radio squelch: short band-limited noise burst */
  squelch() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const n = c.createBufferSource();
    const len = Math.floor(c.sampleRate * 0.09);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0.12;
    n.connect(bp).connect(g).connect(this.master);
    n.start();
  }

  /** G1000-style alert tone for a new annunciation: a short, soft single chime for a CAUTION (amber), a
   *  two-note chime for a WARNING (red). Never louder than the callouts; silent when muted. */
  alertChime(level: 'warning' | 'caution') {
    if (level === 'warning') {
      this.beep(988, 0.16, 0.07);
      this.beep(784, 0.26, 0.07, 'sine', 0.19);
    } else this.beep(880, 0.22, 0.05);
  }

  /** soft two-tone chime (chronometer minute marks) */
  chime() {
    this.beep(1175, 0.12, 0.07);
    this.beep(1568, 0.22, 0.06, 'sine', 0.13);
  }

  speak(text: string) {
    if (this.muted || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 0.9;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  update(sim: Sim, dt: number) {
    if (!this.ctx) return;
    this.t += dt;
    const c = this.ctx;
    const d = sim.ac.data;
    const now = c.currentTime;
    const rpm = sim.ac.s.crashed ? 0 : d.rpm;
    const sys = sim.sys;
    const running = sys ? sys.engineRunning : true;
    const vib = running ? (sys?.vibration ?? 0) : 0;
    const f = (rpm / 60) * 2; // firing frequency-ish
    // rough engine: irregular misfires pull the level and the pitch down for a few hundredths of a second
    this.roughPhase += dt * (5 + 7 * Math.random());
    const miss = vib > 0.02 ? vib * (0.5 + 0.5 * Math.sin(this.roughPhase * 2.1) * Math.sin(this.roughPhase * 0.77)) : 0;
    this.engOsc.frequency.setTargetAtTime(Math.max(20, f * (1 - 0.06 * miss)), now, 0.04);
    this.engOsc2.frequency.setTargetAtTime(Math.max(10, f / 2 + 1.5), now, 0.1);
    // a windmilling dead engine: no firing pulses, only the propeller turning (low and soft); silence when stopped
    this.engFilter.frequency.setTargetAtTime(running ? 250 + rpm * 0.25 : 120 + rpm * 0.06, now, 0.2);
    const engLevel = sim.paused || rpm < 100 ? 0 : running ? (0.05 + (rpm / 2700) * 0.07) * (1 - 0.55 * miss) : 0.012 * Math.min(1, rpm / 1000);
    this.engGain.gain.setTargetAtTime(engLevel, now, running ? 0.03 : 0.4);
    const door = !!sys?.doorOpen && !sim.paused;
    this.noiseGain.gain.setTargetAtTime(sim.paused ? 0 : (0.005 + (d.iasKt / 120) * 0.035) * (door ? 1.8 : 1), now, 0.3);
    this.doorGain.gain.setTargetAtTime(door ? 0.02 + (d.iasKt / 120) * 0.05 * (0.8 + 0.2 * Math.sin(this.t * 9)) : 0, now, 0.15);
    // alert chime on a new red / amber annunciation (not at the start of a flight, not during a replay)
    // (the systems publish a new array only when the list changes: compare by identity, no per-frame work)
    if (sys && !sim.paused && !sim.replaying) {
      const cur = sys.annunciators;
      if (sim.time < this.lastAnnTime || this.lastAnnTime < 0) this.lastAnn = cur; // new flight: no chime for what is already lit
      else if (cur !== this.lastAnn) {
        const added = cur.filter((a) => !this.lastAnn.includes(a));
        if (added.length && this.t - this.lastChime > 1.5) {
          this.lastChime = this.t;
          this.alertChime(added.some((a) => ANNUNCIATOR_LEVEL[a] === 'warning') ? 'warning' : 'caution');
        }
        this.lastAnn = cur;
      }
      this.lastAnnTime = sim.time;
    }
    this.hornGain.gain.setTargetAtTime(d.stallWarn && !sim.paused ? 0.06 : 0, now, 0.03);
    // marker: dashes 2/s
    const om = sim.marker === 'O' && !sim.paused && Math.floor(this.t * 4) % 2 === 0;
    this.markerGain.gain.setTargetAtTime(om ? 0.06 : 0, now, 0.01);
    // AP disconnect tone
    if (this.lastAp && !sim.ap.ap) {
      this.beep(880, 0.15, 0.12, 'square');
      this.beep(660, 0.15, 0.12, 'square', 0.18);
      this.beep(880, 0.15, 0.12, 'square', 0.36);
    }
    this.lastAp = sim.ap.ap;
    // altitude alerter: 200 ft before the selected altitude
    if (sim.ap.altSel !== this.lastAltSel) {
      this.lastAltSel = sim.ap.altSel;
      this.altAlerted = false;
    }
    const toGo = Math.abs(sim.indicatedAlt() - sim.ap.altSel);
    if (!this.altAlerted && toGo < 200 && toGo > 50 && Math.abs(d.vsFpm) > 300 && !sim.ac.s.onGround) {
      this.altAlerted = true;
      this.beep(1046, 0.18, 0.1);
      this.beep(1318, 0.25, 0.1, 'sine', 0.2);
    }
    // automatic callouts
    if (!sim.paused && !sim.replaying) {
      const nav = sim.navInputs().nav;
      const ids = this.callouts.update(dt, {
        aglFt: d.aglFt,
        baroAltFt: sim.indicatedAlt(),
        vsFpm: d.vsFpm,
        minimums: sim.av.minimums,
        onGround: sim.ac.s.onGround,
        bankDeg: d.rollDeg,
        gsDots: nav.gsValid ? nav.gsDev * 2 : null,
        approachActive: nav.isLoc && nav.gsValid,
        throttle: sim.controls.throttle,
        stall: d.stallWarn,
      });
      for (const id of ids) this.callout(id);
    }
  }
}
