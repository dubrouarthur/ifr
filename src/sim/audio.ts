// Cockpit audio: engine, stall horn, marker beacon, AP disconnect, altitude alerter, minimums callout.
import type { Sim } from './sim';

export class CockpitAudio {
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
  muted = false;
  private lastAp = false;
  private altAlerted = false;
  private lastAltSel = 0;
  private minsCalled = false;
  private hundredCalled = false;
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

  private say(text: string) {
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
    const f = (rpm / 60) * 2; // firing frequency-ish
    this.engOsc.frequency.setTargetAtTime(Math.max(20, f), now, 0.1);
    this.engOsc2.frequency.setTargetAtTime(Math.max(10, f / 2 + 1.5), now, 0.1);
    this.engFilter.frequency.setTargetAtTime(250 + rpm * 0.25, now, 0.2);
    this.engGain.gain.setTargetAtTime(sim.paused || rpm < 100 ? 0 : 0.05 + (rpm / 2700) * 0.07, now, 0.2);
    this.noiseGain.gain.setTargetAtTime(sim.paused ? 0 : 0.005 + (d.iasKt / 120) * 0.035, now, 0.3);
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
    // minimums callouts
    const mins = sim.av.minimums;
    if (mins !== null && !sim.ac.s.onGround) {
      const above = sim.indicatedAlt() - mins;
      if (!this.hundredCalled && above < 100 && above > 50 && d.vsFpm < -100) {
        this.hundredCalled = true;
        this.say('One hundred above');
      }
      if (!this.minsCalled && above < 0 && d.vsFpm < -100) {
        this.minsCalled = true;
        this.say('Minimums');
      }
      if (above > 300) this.hundredCalled = this.minsCalled = false;
    }
  }
}
