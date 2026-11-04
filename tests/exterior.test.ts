// Exterior view: the procedural C172 model and the exterior camera rig.
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  Aircraft3D,
  C172_DIMS,
  type AircraftAnim,
} from "../src/avionics/aircraft3d";
import {
  CameraRig,
  VIEWS,
  AC_CENTRE,
  type AircraftFrame,
  type CameraEnv,
} from "../src/avionics/cameras";

const ac = new Aircraft3D({ textures: false });
const anim = (o: Partial<AircraftAnim> = {}): AircraftAnim => ({
  aileron: 0,
  elevator: 0,
  trim: 0,
  rudder: 0,
  flaps: 0,
  rpm: 0,
  gsMps: 0,
  onGround: true,
  aglFt: 0,
  dt: 1 / 60,
  t: 0,
  day: 1,
  ...o,
});
/** world-space bounding box of a mesh (geometry only, after its parents' transforms) */
const meshBox = (m: THREE.Object3D) => {
  m.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(m, true);
};
const centreOf = (m: THREE.Object3D) =>
  meshBox(m).getCenter(new THREE.Vector3());

describe("C172 model", () => {
  it("matches the published span, length and height within 3 %", () => {
    ac.update(anim());
    const b = ac.bounds();
    const size = b.getSize(new THREE.Vector3());
    expect(Math.abs(size.x - C172_DIMS.span) / C172_DIMS.span).toBeLessThan(
      0.03,
    );
    expect(Math.abs(size.z - C172_DIMS.length) / C172_DIMS.length).toBeLessThan(
      0.03,
    );
    expect(Math.abs(size.y - C172_DIMS.height) / C172_DIMS.height).toBeLessThan(
      0.03,
    );
    // sits on its wheels: the lowest point is the tyres at ground level, nose toward -z
    expect(Math.abs(b.min.y)).toBeLessThan(0.02);
    expect(b.min.z).toBeLessThan(-2);
    expect(b.max.z).toBeGreaterThan(5);
    // symmetric span
    expect(Math.abs(b.min.x + b.max.x)).toBeLessThan(0.05);
  });

  it("is cheap: few draw calls and a modest triangle count", () => {
    let meshes = 0,
      tris = 0;
    ac.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(24);
    expect(tris).toBeLessThan(60000);
  });

  it("moves the ailerons differentially with the roll input", () => {
    ac.update(anim());
    const r0 = centreOf(ac.parts.aileronR.mesh).y,
      l0 = centreOf(ac.parts.aileronL.mesh).y;
    ac.update(anim({ aileron: 1 }));
    const r1 = centreOf(ac.parts.aileronR.mesh).y,
      l1 = centreOf(ac.parts.aileronL.mesh).y;
    expect(r1).toBeGreaterThan(r0 + 0.02); // right aileron up for a right roll
    expect(l1).toBeLessThan(l0 - 0.02); // left aileron down
    // differential: more travel up than down
    expect(-ac.parts.aileronR.mesh.rotation.x).toBeGreaterThan(ac.parts.aileronL.mesh.rotation.x + 0.05);
    ac.update(anim({ aileron: -1 }));
    expect(centreOf(ac.parts.aileronL.mesh).y).toBeGreaterThan(l0 + 0.02);
  });

  it("raises the elevator trailing edge for nose-up input and moves the trim tab the other way", () => {
    ac.update(anim());
    const e0 = centreOf(ac.parts.elevator.mesh).y;
    ac.update(anim({ elevator: 1 }));
    expect(centreOf(ac.parts.elevator.mesh).y).toBeGreaterThan(e0 + 0.03);
    ac.update(anim({ elevator: -1 }));
    expect(centreOf(ac.parts.elevator.mesh).y).toBeLessThan(e0 - 0.03);
    // nose-up trim: the tab trailing edge goes down relative to the elevator
    ac.update(anim({ trim: 0 }));
    const t0 = centreOf(ac.parts.tab.mesh).y;
    ac.update(anim({ trim: 1 }));
    expect(centreOf(ac.parts.tab.mesh).y).toBeLessThan(t0 - 0.005);
  });

  it("swings the rudder trailing edge to the right for right rudder", () => {
    ac.update(anim());
    const x0 = centreOf(ac.parts.rudder.mesh).x;
    expect(Math.abs(x0)).toBeLessThan(0.01);
    ac.update(anim({ rudder: 1 }));
    expect(centreOf(ac.parts.rudder.mesh).x).toBeGreaterThan(0.05);
    ac.update(anim({ rudder: -1 }));
    expect(centreOf(ac.parts.rudder.mesh).x).toBeLessThan(-0.05);
  });

  it("lowers the flaps (down and aft) with the flap position", () => {
    ac.update(anim({ flaps: 0 }));
    const f0 = centreOf(ac.parts.flapL.mesh);
    ac.update(anim({ flaps: 1 }));
    const f1 = centreOf(ac.parts.flapL.mesh);
    expect(f1.y).toBeLessThan(f0.y - 0.08);
    expect(f1.z).toBeGreaterThan(f0.z + 0.02);
    // both flaps move together
    expect(Math.abs(centreOf(ac.parts.flapR.mesh).y - f1.y)).toBeLessThan(0.01);
  });

  it("spins the propeller with rpm and blends into a blur disc at high rpm", () => {
    ac.update(anim({ rpm: 0 }));
    const a0 = ac.parts.prop.rotation.z;
    ac.update(anim({ rpm: 300, t: 0.1 }));
    expect(ac.parts.prop.rotation.z).not.toBeCloseTo(a0, 3);
    expect(ac.parts.disc.visible).toBe(false);
    ac.update(anim({ rpm: 2400, t: 0.2 }));
    expect(ac.parts.disc.visible).toBe(true);
    expect(
      (ac.parts.disc.material as THREE.MeshBasicMaterial).opacity,
    ).toBeGreaterThan(0.9);
  });

  it("switches the lights automatically (beacon with the engine, strobes in flight, landing light below 1000 ft)", () => {
    ac.update(anim({ rpm: 0, onGround: true }));
    expect(ac.lights.beacon).toBe(false);
    expect(ac.lights.strobe).toBe(false);
    ac.update(anim({ rpm: 2300, onGround: false, aglFt: 600 }));
    expect(ac.lights).toMatchObject({
      beacon: true,
      strobe: true,
      landing: true,
    });
    ac.update(anim({ rpm: 2300, onGround: false, aglFt: 4000 }));
    expect(ac.lights.landing).toBe(false);
  });
});

describe("ground effects", () => {
  it("puts the landing-light pool ahead of the nose and the shadow under the aircraft", () => {
    const sun = new THREE.Vector3(0, 1, 0);
    for (const hdgDeg of [0, 90, 270]) {
      const hdg = (hdgDeg * Math.PI) / 180;
      ac.update(anim({ onGround: true, gsMps: 20, rpm: 2400 })); // take-off roll: landing light on
      expect(ac.lights.landing).toBe(true);
      ac.placeGround(new THREE.Vector3(0, 0, 0), hdg, 0, 0, 0, sun, 1, 1);
      const fwd = new THREE.Vector3(Math.sin(hdg), 0, -Math.cos(hdg)); // scene: x east, -z north
      expect(ac.pool.visible).toBe(true);
      expect(ac.pool.position.clone().setY(0).normalize().dot(fwd)).toBeGreaterThan(0.99);
      expect(Math.hypot(ac.shadow.position.x, ac.shadow.position.z)).toBeLessThan(0.01);
      expect(ac.shadow.visible).toBe(true);
    }
    // high up: no shadow, no pool
    ac.update(anim({ onGround: false, aglFt: 3000, rpm: 2400 }));
    ac.placeGround(new THREE.Vector3(0, 900, 0), 0, 0, 0, 0, sun, 1, 1);
    expect(ac.shadow.visible).toBe(false);
    expect(ac.pool.visible).toBe(false);
  });
});

describe("exterior cameras", () => {
  const env: CameraEnv = {
    groundAt: () => 0,
    towers: [new THREE.Vector3(400, 30, -250)],
  };
  const frames: [string, AircraftFrame][] = [
    [
      "parked",
      {
        pos: new THREE.Vector3(0, 0, 0),
        quat: new THREE.Quaternion(),
        hdg: 0,
        pitch: 0,
        vel: new THREE.Vector3(),
        onGround: true,
      },
    ],
    [
      "climbing turn",
      (() => {
        const e = new THREE.Euler(
          (10 * Math.PI) / 180,
          -1.2,
          (-25 * Math.PI) / 180,
          "YXZ",
        );
        return {
          pos: new THREE.Vector3(300, 450, -900),
          quat: new THREE.Quaternion().setFromEuler(e),
          hdg: 1.2,
          pitch: 0.17,
          vel: new THREE.Vector3(36, 3.5, -16),
          onGround: false,
        };
      })(),
    ],
    [
      "far from any tower",
      {
        pos: new THREE.Vector3(60000, 900, 40000),
        quat: new THREE.Quaternion(),
        hdg: 3,
        pitch: 0,
        vel: new THREE.Vector3(5, 0, 50),
        onGround: false,
      },
    ],
  ];
  // the airframe's bounding box in the body frame, slightly enlarged
  ac.update(anim());
  ac.group.position.set(0, 0, 0);
  ac.group.rotation.set(0, 0, 0);
  const body = ac.bounds().expandByScalar(0.3);

  for (const [name, f] of frames)
    for (const v of VIEWS.filter((x) => x !== "cockpit"))
      it(`${v} camera stays finite, above ground and outside the airframe (${name})`, () => {
        const rig = new CameraRig();
        rig.setMode(v);
        let shot = rig.update(0, f, env);
        // run a few seconds so springs and repositioning settle, with the aircraft moving
        const pos = f.pos.clone();
        for (let i = 0; i < 240; i++) {
          pos.addScaledVector(f.vel, 1 / 60);
          shot = rig.update(1 / 60, { ...f, pos }, env);
          for (const c of [
            shot.pos.x,
            shot.pos.y,
            shot.pos.z,
            shot.target.x,
            shot.target.y,
            shot.target.z,
            shot.near,
          ])
            expect(Number.isFinite(c)).toBe(true);
          expect(shot.pos.y).toBeGreaterThanOrEqual(1.29);
          // camera position in the aircraft body frame
          const local = shot.pos
            .clone()
            .sub(pos)
            .applyQuaternion(f.quat.clone().invert());
          expect(body.containsPoint(local)).toBe(false);
        }
        if (shot.fov !== null) expect(shot.fov).toBeGreaterThan(0.5);
        expect(shot.near).toBeGreaterThan(0.3);
        // the target is the aircraft (within a few metres of its centre)
        const c = AC_CENTRE.clone().applyQuaternion(f.quat).add(pos);
        expect(shot.target.distanceTo(c)).toBeLessThan(6);
      });

  it("orbit responds to drag and zoom", () => {
    const rig = new CameraRig();
    rig.setMode("orbit");
    const f = frames[0][1];
    const a = rig.update(0, f, env).pos.clone();
    rig.drag(120, 0);
    const b = rig.update(0, f, env).pos.clone();
    expect(a.distanceTo(b)).toBeGreaterThan(5);
    const d0 = b.distanceTo(rig.centre(f));
    rig.zoomBy(2);
    const d1 = rig.update(0, f, env).pos.distanceTo(rig.centre(f));
    expect(d1).toBeLessThan(d0 * 0.6);
  });

  it("fly-by waits ahead of the aircraft and repositions once it has passed", () => {
    const rig = new CameraRig();
    rig.setMode("flyby");
    const f: AircraftFrame = { pos: new THREE.Vector3(0, 300, 0), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, "YXZ")), hdg: Math.PI / 2, pitch: 0, vel: new THREE.Vector3(50, 0, 0), onGround: false };
    const first = rig.update(1 / 60, f, env).pos.clone();
    expect(first.x).toBeGreaterThan(150); // east = ahead
    const pos = f.pos.clone();
    let moved = false;
    for (let i = 0; i < 60 * 20; i++) {
      pos.x += 50 / 60;
      const p = rig.update(1 / 60, { ...f, pos }, env).pos;
      if (p.distanceTo(first) > 50) {
        moved = true;
        expect(p.x).toBeGreaterThan(pos.x);
        break;
      }
    }
    expect(moved).toBe(true);
  });

  it("chase follows the heading from behind", () => {
    const rig = new CameraRig();
    rig.setMode("chase");
    const f = { ...frames[0][1], hdg: Math.PI / 2 }; // facing east (+x)
    let s = rig.update(0, f, env);
    for (let i = 0; i < 300; i++) s = rig.update(1 / 60, f, env);
    expect(s.pos.x).toBeLessThan(-8); // behind = west
    expect(s.pos.y).toBeGreaterThan(2);
  });

  it("chase drops toward the flight path in a climb so the nose-up attitude shows", () => {
    const settle = (pitch: number) => {
      const rig = new CameraRig();
      rig.setMode("chase");
      const f: AircraftFrame = { ...frames[0][1], pos: new THREE.Vector3(0, 500, 0), pitch, onGround: false };
      let s = rig.update(0, f, env);
      for (let i = 0; i < 300; i++) s = rig.update(1 / 60, f, env);
      return s.pos.y - rig.centre(f).y;
    };
    const level = settle(0),
      climb = settle(10 * (Math.PI / 180));
    expect(level).toBeGreaterThan(1.5); // a little above in level flight
    expect(climb).toBeLessThan(level - 0.5);
    expect(climb).toBeGreaterThan(0); // still above the aircraft, never looking up at its belly
  });

  it("tower view frames the aircraft and zooms out to a wide view of the field", () => {
    const rig = new CameraRig();
    rig.setMode("tower");
    const f = frames[0][1];
    const tight = rig.update(0, f, env).fov!;
    expect(tight).toBeGreaterThan(1);
    expect(tight).toBeLessThan(8);
    for (let i = 0; i < 40; i++) rig.zoomBy(0.8);
    expect(rig.update(0, f, env).fov!).toBeGreaterThan(45);
  });
});
