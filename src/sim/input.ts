// Keyboard + joystick/yoke/gamepad input with persisted axis/button mapping.
import type { Controls } from './aircraft';

export type AxisName = 'roll' | 'pitch' | 'yaw' | 'throttle' | 'brake';
export type ButtonAction =
  | 'apDisc'
  | 'toga'
  | 'trimUp'
  | 'trimDn'
  | 'flapsUp'
  | 'flapsDn'
  | 'brake'
  | 'cdi'
  | 'pause'
  | 'apToggle'
  | 'hdgSync';

export const AXIS_LABELS: Record<AxisName, string> = {
  roll: 'Roll (aileron)',
  pitch: 'Pitch (elevator)',
  yaw: 'Yaw (rudder)',
  throttle: 'Throttle',
  brake: 'Toe brakes',
};
export const BUTTON_LABELS: Record<ButtonAction, string> = {
  apDisc: 'AP disconnect',
  apToggle: 'AP engage',
  toga: 'TOGA / go-around',
  trimUp: 'Trim nose up',
  trimDn: 'Trim nose down',
  flapsUp: 'Flaps up',
  flapsDn: 'Flaps down',
  brake: 'Brakes (hold)',
  cdi: 'CDI source',
  pause: 'Pause',
  hdgSync: 'HDG sync',
};

export interface AxisMap {
  index: number | null;
  invert: boolean;
  deadzone: number;
  curve: number; // 0 = linear, 1 = strong expo
  min: number; // calibration
  max: number;
}

export interface Profile {
  id: string;
  axes: Record<AxisName, AxisMap>;
  buttons: Partial<Record<ButtonAction, number>>;
}

const axis = (index: number | null, invert = false, deadzone = 0.05, curve = 0.3): AxisMap => ({ index, invert, deadzone, curve, min: -1, max: 1 });

export function defaultProfile(pad: Gamepad): Profile {
  if (pad.mapping === 'standard') {
    // Xbox/PlayStation style: left stick = yoke, right stick X = rudder, triggers via buttons
    return {
      id: pad.id,
      axes: { roll: axis(0), pitch: axis(1), yaw: axis(2, false, 0.12), throttle: axis(null), brake: axis(null) },
      buttons: { trimUp: 13, trimDn: 12, flapsDn: 5, flapsUp: 4, apToggle: 3, apDisc: 1, toga: 2, brake: 0, cdi: 8, pause: 9 },
    };
  }
  // Generic joystick / HOTAS: X roll, Y pitch, Z throttle, Rz twist rudder
  return {
    id: pad.id,
    axes: { roll: axis(0), pitch: axis(1), throttle: axis(pad.axes.length > 2 ? 2 : null, true, 0.01, 0), yaw: axis(pad.axes.length > 5 ? 5 : pad.axes.length > 3 ? 3 : null, false, 0.1), brake: axis(null) },
    buttons: { apDisc: 0, toga: 1, trimUp: 3, trimDn: 2, flapsDn: 4, flapsUp: 5 },
  };
}

const STORE = 'ifr.joystick.profiles.v1';

function loadProfiles(): Record<string, Profile> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}
function saveProfiles(p: Record<string, Profile>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export interface InputCallbacks {
  onAction: (a: ButtonAction) => void;
}

export class InputManager {
  keys = new Set<string>();
  padIndex: number | null = null;
  profile: Profile | null = null;
  profiles = loadProfiles();
  /** Last raw values for the config UI */
  raw: { axes: number[]; buttons: number[] } = { axes: [], buttons: [] };
  joyActive = false;
  /** keyboard virtual yoke state */
  private kb = { pitch: 0, roll: 0, yaw: 0 };
  private prevButtons: boolean[] = [];
  private flapCooldown = 0;
  /** suppress flight keys when typing in inputs */
  enabled = true;
  overrideThreshold = 0.55;
  /** on-screen touch stick contribution */
  virtual = { pitch: 0, roll: 0 };

  constructor(private cb: InputCallbacks) {
    window.addEventListener('gamepadconnected', (e) => this.attach((e as GamepadEvent).gamepad.index));
    window.addEventListener('gamepaddisconnected', (e) => {
      if ((e as GamepadEvent).gamepad.index === this.padIndex) {
        this.padIndex = null;
        this.profile = null;
      }
    });
  }

  attach(index: number) {
    const pad = navigator.getGamepads?.()[index];
    if (!pad) return;
    this.padIndex = index;
    this.profile = this.profiles[pad.id] ?? defaultProfile(pad);
  }

  pads(): Gamepad[] {
    return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
  }

  current(): Gamepad | null {
    if (this.padIndex === null) {
      const first = this.pads()[0];
      if (first) this.attach(first.index);
    }
    return this.padIndex !== null ? navigator.getGamepads?.()[this.padIndex] ?? null : null;
  }

  saveProfile() {
    if (!this.profile) return;
    this.profiles[this.profile.id] = this.profile;
    saveProfiles(this.profiles);
  }

  resetProfile() {
    const pad = this.current();
    if (!pad) return;
    this.profile = defaultProfile(pad);
    delete this.profiles[pad.id];
    saveProfiles(this.profiles);
  }

  readAxis(pad: Gamepad, m: AxisMap): number | null {
    if (m.index === null || m.index >= pad.axes.length) return null;
    let v = pad.axes[m.index];
    // calibrate to -1..1
    const span = m.max - m.min || 2;
    v = ((v - m.min) / span) * 2 - 1;
    if (m.invert) v = -v;
    if (Math.abs(v) < m.deadzone) return 0;
    v = (Math.sign(v) * (Math.abs(v) - m.deadzone)) / (1 - m.deadzone);
    v = (1 - m.curve) * v + m.curve * v * v * v;
    return Math.max(-1, Math.min(1, v));
  }

  /**
   * Updates the control state from keyboard/joystick. Returns true if the pilot is
   * overpowering the autopilot (caller should disconnect).
   */
  update(dt: number, c: Controls, apEngaged: boolean): boolean {
    const k = this.keys;
    const has = (...names: string[]) => names.some((n) => k.has(n));
    // keyboard virtual yoke: deflect while held, re-center when released
    // progressive: gentle pressure while held, full deflection with Shift
    const big = has('Shift');
    const rate = (big ? 2.4 : 1.0) * dt;
    const center = 2.2 * dt;
    const pitchIn = (has('ArrowDown') ? 1 : 0) - (has('ArrowUp') ? 1 : 0);
    const rollIn = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0);
    const yawIn = (has('.', '>') ? 1 : 0) - (has(',', '<') ? 1 : 0);
    const step = (v: number, input: number, lim: number) => {
      if (input) return Math.max(-lim, Math.min(lim, v + input * rate));
      return Math.abs(v) < center ? 0 : v - Math.sign(v) * center;
    };
    this.kb.pitch = step(this.kb.pitch, pitchIn, big ? 1 : 0.42);
    this.kb.roll = step(this.kb.roll, rollIn, big ? 1 : 0.5);
    this.kb.yaw = step(this.kb.yaw, yawIn, 1);

    let elev = Math.max(-1, Math.min(1, this.kb.pitch + this.virtual.pitch));
    let ail = Math.max(-1, Math.min(1, this.kb.roll + this.virtual.roll));
    let rud = this.kb.yaw;
    // throttle keys
    if (has('=', '+', 'PageUp')) c.throttle = Math.min(1, c.throttle + dt * 0.4);
    if (has('-', '_', 'PageDown')) c.throttle = Math.max(0, c.throttle - dt * 0.4);
    // trim keys
    if (has('End')) c.trim = Math.min(1, c.trim + dt * 0.12);
    if (has('Home')) c.trim = Math.max(-1, c.trim - dt * 0.12);
    c.brake = has(' ') ? 1 : 0;

    // joystick
    const pad = this.current();
    this.joyActive = false;
    if (pad && this.profile) {
      this.raw = { axes: [...pad.axes], buttons: pad.buttons.map((b) => b.value) };
      const p = this.profile;
      const r = this.readAxis(pad, p.axes.roll);
      const e = this.readAxis(pad, p.axes.pitch);
      const y = this.readAxis(pad, p.axes.yaw);
      const t = this.readAxis(pad, p.axes.throttle);
      const b = this.readAxis(pad, p.axes.brake);
      if (r !== null) ail = Math.max(-1, Math.min(1, ail + r));
      if (e !== null) elev = Math.max(-1, Math.min(1, elev + e)); // stick forward (axis -1) = nose down
      if (y !== null) rud = Math.max(-1, Math.min(1, rud + y));
      if (t !== null) c.throttle = (t + 1) / 2;
      if (b !== null) c.brake = Math.max(c.brake, (b + 1) / 2);
      this.joyActive = r !== null || e !== null;
      // standard gamepad triggers for throttle
      if (pad.mapping === 'standard' && p.axes.throttle.index === null) {
        const up = pad.buttons[7]?.value ?? 0;
        const dn = pad.buttons[6]?.value ?? 0;
        c.throttle = Math.max(0, Math.min(1, c.throttle + (up - dn) * dt * 0.5));
      }
      // buttons (edge-triggered except hold actions)
      this.flapCooldown -= dt;
      const pressed = pad.buttons.map((bt) => bt.pressed);
      for (const [action, idx] of Object.entries(p.buttons) as [ButtonAction, number][]) {
        if (idx === undefined || idx >= pressed.length) continue;
        const now = pressed[idx];
        const before = this.prevButtons[idx] ?? false;
        if (action === 'trimUp' && now) c.trim = Math.min(1, c.trim + dt * 0.12);
        else if (action === 'trimDn' && now) c.trim = Math.max(-1, c.trim - dt * 0.12);
        else if (action === 'brake' && now) c.brake = 1;
        else if (now && !before) this.cb.onAction(action);
      }
      this.prevButtons = pressed;
    }

    if (apEngaged) {
      // control wheel steering style override: big deflection disconnects
      return Math.abs(elev) > this.overrideThreshold || Math.abs(ail) > this.overrideThreshold;
    }
    c.elevator = elev;
    c.aileron = ail;
    c.rudder = rud;
    return false;
  }
}

/** Watches a gamepad for the axis that moves the most (for "click Assign then move the axis"). */
export class AxisDetector {
  private start: number[] = [];
  private startButtons: boolean[] = [];
  constructor(private pad: () => Gamepad | null) {
    const p = pad();
    this.start = p ? [...p.axes] : [];
    this.startButtons = p ? p.buttons.map((b) => b.pressed) : [];
  }
  axis(): number | null {
    const p = this.pad();
    if (!p) return null;
    let best = -1;
    let bestD = 0.45;
    p.axes.forEach((v, i) => {
      const dd = Math.abs(v - (this.start[i] ?? 0));
      if (dd > bestD) {
        bestD = dd;
        best = i;
      }
    });
    return best >= 0 ? best : null;
  }
  button(): number | null {
    const p = this.pad();
    if (!p) return null;
    const i = p.buttons.findIndex((b, idx) => b.pressed && !this.startButtons[idx]);
    return i >= 0 ? i : null;
  }
}
