// Exterior camera rig for the 3D outside view: chase, orbit, tower and fly-by views around the aircraft.
// Pure math on three.js vectors (no renderer, no DOM) so it can be unit-tested; Outside3D feeds it the
// aircraft pose every frame and applies the result to its PerspectiveCamera.
import * as THREE from "three";

export type ViewMode = "cockpit" | "chase" | "orbit" | "tower" | "flyby";
export const VIEWS: readonly ViewMode[] = [
  "cockpit",
  "chase",
  "orbit",
  "tower",
  "flyby",
];
export const VIEW_LABELS: Record<ViewMode, string> = {
  cockpit: "Cockpit",
  chase: "Chase",
  orbit: "Orbit",
  tower: "Tower",
  flyby: "Fly-by",
};

/** what the rig needs to know about the aircraft this frame (scene metres, y up, -z north) */
export interface AircraftFrame {
  /** model origin: the ground contact point under the main wheels */
  pos: THREE.Vector3;
  /** body attitude (model nose along -z) */
  quat: THREE.Quaternion;
  /** true heading, rad (0 = north = -z) */
  hdg: number;
  /** body pitch, rad */
  pitch: number;
  /** velocity over the ground, m/s, scene frame */
  vel: THREE.Vector3;
  onGround: boolean;
}

export interface CameraEnv {
  /** terrain / runway height (scene y, m) at a scene x/z */
  groundAt(x: number, z: number): number;
  /** tower cab eye positions (scene metres) of the airports with 3D scenery */
  towers: THREE.Vector3[];
}

export interface CameraShot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** vertical field of view in degrees, or null to keep the default */
  fov: number | null;
  /** near clipping plane, m */
  near: number;
}

const DEG = Math.PI / 180;
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** exponential smoothing factor for a time constant */
const ease = (dt: number, tau: number) =>
  1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tau));

/** the aircraft's visual centre relative to the model origin (body frame): mid-cabin, a little above the wing root */
export const AC_CENTRE = new THREE.Vector3(0, 1.35, 1.1);
/** clearance radius around the visual centre the cameras keep (half the wingspan plus a margin) */
export const AC_CLEAR = 6.4;

export class CameraRig {
  mode: ViewMode = "cockpit";
  /** orbit: yaw relative to the aircraft heading (0 = behind), pitch above the horizon, distance */
  orbit = { yaw: 0.75, pitch: 0.2, dist: 18 };
  /** chase: distance behind and the drag offsets (ease back to zero when released) */
  chase = { dist: 19, yawOfs: 0, pitchOfs: 0 };
  /** tower / fly-by zoom (1 = framed automatically, >1 zooms in) */
  zoom = 1;
  dragging = false;
  private chaseYaw = NaN;
  private chasePitch = 0;
  private flyAnchor: THREE.Vector3 | null = null;
  private flyAge = 0;
  private tower: THREE.Vector3 | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly shot: CameraShot = {
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: null,
    near: 3,
  };

  setMode(m: ViewMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.chaseYaw = NaN;
    this.flyAnchor = null;
    this.tower = null;
    this.zoom = 1;
  }

  /** pointer drag in pixels */
  drag(dx: number, dy: number) {
    if (this.mode === "orbit") {
      this.orbit.yaw = wrapPi(this.orbit.yaw - dx * 0.006);
      this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.005, -0.12, 1.45);
    } else if (this.mode === "chase") {
      this.chase.yawOfs = clamp(
        this.chase.yawOfs - dx * 0.006,
        -Math.PI,
        Math.PI,
      );
      this.chase.pitchOfs = clamp(this.chase.pitchOfs + dy * 0.005, -0.25, 1.2);
    }
  }

  /** zoom by a factor (>1 = closer / narrower) */
  zoomBy(f: number) {
    if (!(f > 0) || !isFinite(f)) return;
    if (this.mode === "orbit")
      this.orbit.dist = clamp(this.orbit.dist / f, 9, 600);
    else if (this.mode === "chase")
      this.chase.dist = clamp(this.chase.dist / f, 11, 80);
    else this.zoom = clamp(this.zoom * f, 0.35, 12);
  }

  reset() {
    this.orbit = { yaw: 0.75, pitch: 0.2, dist: 18 };
    this.chase = { dist: 19, yawOfs: 0, pitchOfs: 0 };
    this.zoom = 1;
    this.flyAnchor = null;
  }

  /** aircraft visual centre in the scene */
  centre(ac: AircraftFrame, out = new THREE.Vector3()) {
    return out.copy(AC_CENTRE).applyQuaternion(ac.quat).add(ac.pos);
  }

  update(dt: number, ac: AircraftFrame, env: CameraEnv): CameraShot {
    dt = clamp(isFinite(dt) ? dt : 0, 0, 0.25);
    const c = this.centre(ac);
    const sh = this.shot;
    sh.fov = null;
    if (this.mode === "chase" || this.mode === "cockpit")
      this.chaseCam(dt, ac, c);
    else if (this.mode === "orbit") this.orbitCam(ac, c);
    else if (this.mode === "tower") this.towerCam(ac, c, env);
    else this.flybyCam(dt, ac, c, env);
    // never below the ground
    const gy = env.groundAt(sh.pos.x, sh.pos.z);
    const minY = (isFinite(gy) ? gy : 0) + (this.mode === "tower" ? 2 : 1.3);
    if (sh.pos.y < minY) sh.pos.y = minY;
    // keep clear of the airframe (a pushed-down chase/orbit camera on the ground could end up in the wing)
    const d = this.tmp.copy(sh.pos).sub(c);
    const len = d.length();
    if (len < AC_CLEAR) {
      if (len < 1e-6) d.set(0, 0.3, 1);
      sh.pos.copy(c).addScaledVector(d.normalize(), AC_CLEAR);
    }
    const dist = sh.pos.distanceTo(c);
    // a near plane as far out as the shot allows keeps the depth buffer precise for runway markings
    sh.near = clamp((dist - 7) * 0.45, 0.4, 3);
    return sh;
  }

  private chaseCam(dt: number, ac: AircraftFrame, c: THREE.Vector3) {
    // heading follows with a short lag; pitch follows at half amplitude so climbs and flares read clearly
    if (!isFinite(this.chaseYaw)) {
      this.chaseYaw = ac.hdg;
      this.chasePitch = ac.pitch * 0.5;
    }
    this.chaseYaw += wrapPi(ac.hdg - this.chaseYaw) * ease(dt, 0.55);
    this.chasePitch += (ac.pitch * 0.5 - this.chasePitch) * ease(dt, 0.7);
    if (!this.dragging) {
      const k = ease(dt, 1.4);
      this.chase.yawOfs -= this.chase.yawOfs * k;
      this.chase.pitchOfs -= this.chase.pitchOfs * k;
    }
    const yaw = -this.chaseYaw + this.chase.yawOfs;
    const pitch = clamp(
      0.2 + this.chasePitch * 0.6 + this.chase.pitchOfs,
      -0.2,
      1.4,
    );
    const dist = this.chase.dist;
    const sh = this.shot;
    sh.pos
      .set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      )
      .multiplyScalar(dist)
      .add(c);
    // aim a little ahead of the aircraft so it sits in the lower-middle of the frame, like a real chase plane
    const fwd = this.tmp.set(
      -Math.sin(this.chaseYaw),
      0,
      -Math.cos(this.chaseYaw),
    );
    sh.target.copy(c).addScaledVector(fwd, dist * 0.1);
    sh.target.y += 0.35;
  }

  private orbitCam(ac: AircraftFrame, c: THREE.Vector3) {
    const yaw = -ac.hdg + this.orbit.yaw;
    const p = this.orbit.pitch;
    this.shot.pos
      .set(
        Math.sin(yaw) * Math.cos(p),
        Math.sin(p),
        Math.cos(yaw) * Math.cos(p),
      )
      .multiplyScalar(this.orbit.dist)
      .add(c);
    this.shot.target.copy(c);
  }

  private towerCam(ac: AircraftFrame, c: THREE.Vector3, env: CameraEnv) {
    // nearest tower, with hysteresis so the view does not jump between two airports half-way
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const t of env.towers) {
      const d = t.distanceTo(c);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (
      !this.tower ||
      !best ||
      (best !== this.tower && bd < this.tower.distanceTo(c) * 0.8)
    )
      this.tower = best;
    // no tower within ~12 nm: a spotter on the ground 1.2 nm ahead and left of the track, re-sited as needed
    if (!this.tower || this.tower.distanceTo(c) > 22000) {
      if (!this.flyAnchor || this.flyAnchor.distanceTo(c) > 6000) {
        const dir = this.horizDir(ac);
        this.flyAnchor = c
          .clone()
          .addScaledVector(dir, 2200)
          .add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(-500));
        this.flyAnchor.y = -1e9; // clamped to the ground + 2 m in update()
      }
      this.shot.pos.copy(this.flyAnchor);
    } else this.shot.pos.copy(this.tower);
    this.shot.target.copy(c);
    const dist = Math.max(1, this.shot.pos.distanceTo(c));
    // frame ~26 m of sky around the aircraft, zoomable
    this.shot.fov = clamp(
      (2 * Math.atan(9 / (dist * this.zoom))) / DEG,
      0.8,
      55,
    );
  }

  private flybyCam(
    dt: number,
    ac: AircraftFrame,
    c: THREE.Vector3,
    env: CameraEnv,
  ) {
    const speed = Math.hypot(ac.vel.x, ac.vel.z);
    const dir = this.horizDir(ac);
    const lead = clamp(speed * 7, 70, 700);
    this.flyAge += dt;
    let need = !this.flyAnchor;
    if (this.flyAnchor) {
      const rel = this.tmp.copy(c).sub(this.flyAnchor);
      rel.y = 0;
      const along = rel.dot(dir); // > 0 once the aircraft has passed the camera
      if (
        speed > 3 &&
        (along > lead * 0.8 || rel.length() > lead * 2.6 || this.flyAge > 40)
      )
        need = true;
      if (speed <= 3 && rel.length() > 120) need = true;
    }
    if (need) {
      const side = new THREE.Vector3(-dir.z, 0, dir.x); // right of track
      const s =
        (Math.floor(this.flyAge * 7.3) % 2 ? 1 : -1) * (speed > 3 ? 1 : 1.4);
      const lat = speed > 3 ? 14 + speed * 0.22 : 22;
      const ahead = speed > 3 ? lead : 20;
      this.flyAnchor = c
        .clone()
        .addScaledVector(dir, ahead)
        .addScaledVector(side, s * lat);
      // camera a few metres above whatever the aircraft is flying over (or at eye height beside a runway)
      const g = env.groundAt(this.flyAnchor.x, this.flyAnchor.z);
      const gy = isFinite(g) ? g : 0;
      this.flyAnchor.y = ac.onGround
        ? gy + 1.8
        : Math.max(gy + 2, c.y + (s > 0 ? -4 : 5));
      this.flyAge = 0;
    }
    this.shot.pos.copy(this.flyAnchor!);
    this.shot.target.copy(c);
    const dist = Math.max(1, this.shot.pos.distanceTo(c));
    this.shot.fov = clamp(
      (2 * Math.atan(22 / (dist * this.zoom))) / DEG,
      6,
      64,
    );
  }

  /** horizontal direction of travel (velocity, or the heading when slow) */
  private horizDir(ac: AircraftFrame) {
    const v = new THREE.Vector3(ac.vel.x, 0, ac.vel.z);
    if (v.lengthSq() < 4) v.set(-Math.sin(ac.hdg), 0, -Math.cos(ac.hdg));
    return v.normalize();
  }
}
