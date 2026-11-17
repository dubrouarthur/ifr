// The flat-four piston engine in 3D (course/engines): an O-360 class four-cylinder boxer, cut open. Crankshaft,
// connecting rods and pistons move with the slider-crank of model.ts; the valves open on their timing; each
// cylinder's gas shows its stroke (fresh mixture, compressed, burning, exhaust); the spark plugs flash in firing
// order 1-3-2-4, the left magneto feeding the upper plugs and the right one the lower plugs (dual ignition, PHAK
// ch. 7). Below: the updraft carburettor with its throttle valve and mixture needle, the air box and the
// carburettor heat valve that takes warm air from the shroud round the muffler.
//
// Axes: the crankshaft along X (the propeller at −X, the nose), Y up, Z across (the pilot's right is −Z).
// Cylinder 1 is right front, 2 left front, 3 right rear, 4 left rear (Lycoming numbering).
import * as THREE from "three";
import {
  Builder,
  Flow,
  cylX,
  cylZ,
  type EngineFrame,
  type EngineModel,
  type Mats,
  type PartLabel,
} from "./kit";
import {
  FLAT_FOUR,
  cylinderPhase,
  flame,
  pistonTravel,
  strokeAt,
  valves,
  type Stroke,
} from "./model";
import { PISTON_STAGES } from "./stages";
export { PISTON_STAGES };
import type { L10n } from "../types";

const L = (en: string, fr: string): L10n => ({ en, fr });
const DEG = Math.PI / 180;

/** crank radius, rod, pin-to-crown, in model units (the O-360's 4.375 in stroke ≈ 0.875) */
const R = 0.44;
const ROD = R * FLAT_FOUR.rodRatio;
const PIN_CROWN = 0.3;
const HEAD = R + ROD + PIN_CROWN + 0.08; // the chamber's roof, from the crank axis
const BORE = 0.5;

interface Cyl {
  n: number;
  /** +1: the cylinder points +Z (left bank), −1: −Z (right bank) */
  s: number;
  x: number;
  /** crank throw angle on the shaft (rad) */
  psi: number;
  piston: THREE.Mesh;
  rod: THREE.Mesh;
  gas: THREE.Mesh;
  gasMat: THREE.MeshBasicMaterial;
  iv: THREE.Object3D;
  ev: THREE.Object3D;
  sparkHi: THREE.Mesh;
  sparkLo: THREE.Mesh;
}


export function buildPiston(mats: Mats): EngineModel {
  const root = new THREE.Group();
  const still = new THREE.Group();
  const crank = new THREE.Group();
  const prop = new THREE.Group();
  root.add(still, crank, prop);
  const b = new Builder();

  // ---- crankcase and accessory case (seen through)
  b.add(still, "ghostDark", new THREE.BoxGeometry(3.4, 1.1, 1.5), {
    pos: [0, 0, 0],
  });
  b.add(still, "ghostDark", new THREE.BoxGeometry(0.6, 1.3, 1.3), {
    pos: [2.0, 0.05, 0],
  });
  // ---- crankshaft: journals, throws, counterweights
  b.add(crank, "steel", cylX(0.15, 0.15, 5.0, 14), { pos: [-0.2, 0, 0] });
  const cylDefs: [number, number, number][] = [
    // n, side, x (the right bank forward: offset by a crank cheek)
    [1, -1, -1.05],
    [2, 1, -0.6],
    [3, -1, 0.6],
    [4, 1, 1.05],
  ];
  const offs: Record<number, number> = { 1: 0, 3: 180, 2: 360, 4: 540 };
  const cyls: Cyl[] = [];
  const pistonGeo = cylZ(BORE - 0.03, 0.55, 20);
  const rodGeo = new THREE.BoxGeometry(0.14, ROD, 0.11);
  const gasGeo = cylZ(BORE - 0.04, 1, 20);
  const valveGeo = (() => {
    const stem = cylZ(0.035, 0.55, 8);
    stem.translate(0, 0, 0.3);
    const head = cylZ(0.13, 0.04, 14);
    const g = new THREE.BufferGeometry();
    const merged = [stem.toNonIndexed(), head.toNonIndexed()];
    stem.dispose();
    head.dispose();
    const pos = new Float32Array(
      merged[0].attributes.position.count * 3 +
        merged[1].attributes.position.count * 3,
    );
    const nor = new Float32Array(pos.length);
    pos.set(merged[0].attributes.position.array as Float32Array, 0);
    pos.set(
      merged[1].attributes.position.array as Float32Array,
      merged[0].attributes.position.array.length,
    );
    nor.set(merged[0].attributes.normal.array as Float32Array, 0);
    nor.set(
      merged[1].attributes.normal.array as Float32Array,
      merged[0].attributes.normal.array.length,
    );
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.forEach((m) => m.dispose());
    return g;
  })();
  const sparkGeo = new THREE.SphereGeometry(0.07, 8, 6);
  for (const [n, s, x] of cylDefs) {
    const o = offs[n];
    // throw angle so that s·cos(θ + ψ) = cos(θ − offset) for every crank angle θ (model.ts)
    const psi = (s > 0 ? -o : 180 - o) * DEG;
    // crankpin and cheeks
    const py = R * Math.sin(psi);
    const pz = R * Math.cos(psi);
    b.add(crank, "steel", cylX(0.12, 0.12, 0.3, 12), { pos: [x, py, pz] });
    for (const dx of [-0.19, 0.19]) {
      const cheek = new THREE.BoxGeometry(0.08, 0.34, R + 0.3);
      cheek.translate(0, 0, R / 2);
      b.add(crank, "dark", cheek, { pos: [x + dx, 0, 0], rot: [-psi, 0, 0] });
      const cw = new THREE.BoxGeometry(0.08, 0.5, 0.26);
      cw.translate(0, 0, -0.26);
      b.add(crank, "dark", cw, { pos: [x + dx, 0, 0], rot: [-psi, 0, 0] });
    }
    // barrel (seen through), cooling fins, head
    const zb = 1.1;
    b.add(still, "ghost", cylZ(BORE + 0.05, HEAD - zb, 22, true), {
      pos: [x, 0, s * (zb + (HEAD - zb) / 2)],
    });
    for (let k = 0; k < 6; k += 2)
      b.add(still, "ghostDark", cylZ(BORE + 0.2, 0.025, 22, true), {
        pos: [x, 0, s * (zb + 0.2 + k * 0.19)],
      });
    b.add(still, "ghost", cylZ(BORE + 0.12, 0.6, 22), {
      pos: [x, 0, s * (HEAD + 0.3)],
    });
    for (let k = 0; k < 3; k++)
      b.add(still, "ghostDark", new THREE.BoxGeometry(0.02, 1.25, 1.25 * 0.5), {
        pos: [x - 0.25 + k * 0.25, 0, s * (HEAD + 0.32)],
      });
    // spark plugs (upper and lower)
    for (const y of [0.42, -0.42]) {
      b.add(still, "brass", new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), {
        pos: [x, y + Math.sign(y) * 0.12, s * (HEAD + 0.08)],
      });
      b.add(still, "black", new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), {
        pos: [x, y + Math.sign(y) * 0.33, s * (HEAD + 0.08)],
      });
    }
    const piston = new THREE.Mesh(pistonGeo, mats.alu);
    const rod = new THREE.Mesh(rodGeo, mats.steel);
    const gasMat = new THREE.MeshBasicMaterial({
      color: 0x6fd18a,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const gas = new THREE.Mesh(gasGeo, gasMat);
    gas.renderOrder = 1;
    const mkValve = (dx: number, mat: THREE.Material) => {
      const v = new THREE.Group();
      const m = new THREE.Mesh(valveGeo, mat);
      if (s < 0) m.rotation.y = Math.PI;
      v.add(m);
      v.position.set(x + dx, 0, s * HEAD);
      return v;
    };
    // intake valve forward, exhaust valve aft
    const iv = mkValve(-0.2, mats.steel);
    const ev = mkValve(0.2, mats.hot);
    const sparkHi = new THREE.Mesh(sparkGeo, mats.spark);
    const sparkLo = new THREE.Mesh(sparkGeo, mats.spark);
    sparkHi.position.set(x, 0.3, s * (HEAD - 0.06));
    sparkLo.position.set(x, -0.3, s * (HEAD - 0.06));
    root.add(piston, rod, gas, iv, ev, sparkHi, sparkLo);
    cyls.push({
      n,
      s,
      x,
      psi,
      piston,
      rod,
      gas,
      gasMat,
      iv,
      ev,
      sparkHi,
      sparkLo,
    });
  }

  // ---- propeller (direct drive)
  prop.position.set(-2.9, 0, 0);
  const spinner = new THREE.ConeGeometry(0.34, 0.6, 16);
  spinner.rotateZ(Math.PI / 2);
  b.add(prop, "alu", spinner, { pos: [-0.25, 0, 0] });
  for (const sgn of [1, -1]) {
    const blade = new THREE.BoxGeometry(0.06, 2.3, 0.3);
    blade.translate(0, sgn * 1.25, 0);
    b.add(prop, "dark", blade, { rot: [0, 0.45 * sgn, 0] });
    const tip = new THREE.BoxGeometry(0.065, 0.25, 0.3);
    tip.translate(0, sgn * 2.27, 0);
    b.add(prop, "oil", tip, { rot: [0, 0.45 * sgn, 0] });
  }

  // ---- induction: air filter, air box, carburettor (updraft, under the sump), plenum and intake pipes
  const carbY = -1.45;
  b.add(still, "black", new THREE.BoxGeometry(0.7, 0.3, 0.6), {
    pos: [-0.7, carbY - 0.55, 0],
  }); // filter
  b.add(still, "ghostDark", new THREE.BoxGeometry(0.75, 0.42, 0.62), {
    pos: [0, carbY - 0.55, 0],
  }); // air box
  b.add(still, "ghost", cylZ(0.18, 0.5, 14).rotateX(Math.PI / 2), {
    pos: [0, carbY, 0],
  }); // venturi
  b.add(still, "paint", new THREE.BoxGeometry(0.5, 0.18, 0.5), {
    pos: [0, carbY + 0.3, 0],
  }); // carburettor body
  b.add(still, "paint", new THREE.BoxGeometry(0.35, 0.28, 0.2), {
    pos: [0.3, carbY + 0.05, 0.28],
  }); // float bowl
  b.add(still, "alu", new THREE.BoxGeometry(1.1, 0.2, 0.5), {
    pos: [0, -0.85, 0],
  }); // plenum (in the sump)
  const throttleValve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14),
    mats.brass,
  );
  throttleValve.position.set(0, carbY + 0.15, 0);
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.012, 0.35, 6),
    mats.brass,
  );
  needle.position.set(0.3, carbY + 0.05, 0.28);
  const heatValve = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.36, 0.56),
    mats.brass,
  );
  heatValve.position.set(-0.22, carbY - 0.55, 0);
  root.add(throttleValve, needle, heatValve);
  const intakePts: THREE.Vector3[][] = [];
  const exhaustPts: THREE.Vector3[][] = [];
  for (const c of cyls) {
    const ip = [
      new THREE.Vector3(c.x * 0.5, -0.85, 0),
      new THREE.Vector3(c.x * 0.85, -0.95, c.s * 0.9),
      new THREE.Vector3(c.x - 0.2, -0.75, c.s * (HEAD - 0.25)),
      new THREE.Vector3(c.x - 0.2, -0.35, c.s * (HEAD + 0.1)),
      new THREE.Vector3(c.x - 0.2, -0.05, c.s * (HEAD - 0.15)),
    ];
    intakePts.push(ip);
    b.add(
      still,
      "alu",
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(ip.slice(0, 4)),
        16,
        0.08,
        8,
      ),
    );
    const ep = [
      new THREE.Vector3(c.x + 0.2, -0.05, c.s * (HEAD - 0.15)),
      new THREE.Vector3(c.x + 0.2, -0.4, c.s * (HEAD + 0.15)),
      new THREE.Vector3(c.x + 0.3, -1.1, c.s * (HEAD - 0.2)),
      new THREE.Vector3(1.0, -1.45, c.s * 0.75),
      new THREE.Vector3(1.6, -1.6, c.s * 0.25),
      new THREE.Vector3(2.6, -1.65, 0),
    ];
    exhaustPts.push(ep);
    b.add(
      still,
      "hot",
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(ep.slice(1, 5)),
        20,
        0.08,
        8,
      ),
    );
  }
  // muffler and its heat shroud (the warm air for the carburettor heat), the duct to the air box
  b.add(still, "hot", cylX(0.24, 0.24, 1.2, 14), { pos: [2.0, -1.62, 0] });
  b.add(still, "ghost", cylX(0.34, 0.34, 0.9, 16, true), {
    pos: [2.0, -1.62, 0],
  });
  const ductPts = [
    new THREE.Vector3(1.6, -1.75, 0.2),
    new THREE.Vector3(1.0, -2.1, 0.35),
    new THREE.Vector3(0.2, -2.15, 0.35),
    new THREE.Vector3(-0.1, carbY - 0.55, 0.1),
  ];
  b.add(
    still,
    "ghostDark",
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(ductPts),
      16,
      0.09,
      8,
      false,
    ),
  );

  // ---- the two magnetos on the accessory case, their leads to the plugs
  const magL = new THREE.Group();
  const magR = new THREE.Group();
  magL.position.set(2.45, 0.35, 0.35);
  magR.position.set(2.45, 0.35, -0.35);
  root.add(magL, magR);
  b.add(magL, "black", cylX(0.17, 0.17, 0.45, 14));
  b.add(magR, "black", cylX(0.17, 0.17, 0.45, 14));
  const leadsL = new THREE.LineBasicMaterial({ color: 0xc8a24a, transparent: true, opacity: 0.55 });
  const leadsR = new THREE.LineBasicMaterial({ color: 0xc8a24a, transparent: true, opacity: 0.55 });
  const lead = (from: THREE.Vector3, to: THREE.Vector3[]) => {
    const pts: number[] = [];
    for (const t of to) pts.push(from.x, from.y, from.z, t.x, t.y + 0.1, t.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  };
  const upper = cyls.map(
    (c) => new THREE.Vector3(c.x, 0.85, c.s * (HEAD + 0.08)),
  );
  const lower = cyls.map(
    (c) => new THREE.Vector3(c.x, -0.85, c.s * (HEAD + 0.08)),
  );
  root.add(
    new THREE.LineSegments(
      lead(new THREE.Vector3(2.45, 0.5, 0.35), upper),
      leadsL,
    ),
  );
  root.add(
    new THREE.LineSegments(
      lead(new THREE.Vector3(2.45, 0.2, -0.35), lower),
      leadsR,
    ),
  );

  b.finish(mats);

  // ---- the gas flow: air in, mixture to each cylinder, exhaust out
  const AIR = 0x7cc4ff;
  const MIX = 0x8fe08a;
  const WARM = 0xffb36b;
  const BURNT = 0x9b938c;
  const HOT = 0xff7a33;
  const paths = [
    // 0: cold air through the filter into the carburettor
    {
      k: "poly" as const,
      pts: [
        new THREE.Vector3(-1.2, carbY - 0.55, 0),
        new THREE.Vector3(-0.3, carbY - 0.55, 0),
        new THREE.Vector3(0, carbY - 0.2, 0),
        new THREE.Vector3(0, -0.9, 0),
      ],
      radius: 0.12,
      colors: [
        [0, AIR],
        [0.55, AIR],
        [0.8, MIX],
        [1, MIX],
      ] as [number, number][],
      n: 40,
    },
    // 1: warm air from the shroud (carburettor heat)
    {
      k: "poly" as const,
      pts: [
        ...ductPts,
        new THREE.Vector3(0, carbY - 0.2, 0),
        new THREE.Vector3(0, -0.9, 0),
      ],
      radius: 0.1,
      colors: [
        [0, WARM],
        [0.7, WARM],
        [1, MIX],
      ] as [number, number][],
      n: 40,
    },
    ...intakePts.map((pts) => ({
      k: "poly" as const,
      pts,
      radius: 0.06,
      colors: [
        [0, MIX],
        [1, MIX],
      ] as [number, number][],
      n: 18,
    })),
    ...exhaustPts.map((pts) => ({
      k: "poly" as const,
      pts,
      radius: 0.06,
      colors: [
        [0, HOT],
        [0.4, BURNT],
        [1, BURNT],
      ] as [number, number][],
      n: 22,
    })),
  ];
  const flow = new Flow(paths, 0.07);
  root.add(flow.points);

  // ---- labels
  const c1 = cyls[0];
  const parts: PartLabel[] = [
    // the cylinders' numbers: the caption follows cylinder 1, the firing order is 1-3-2-4
    ...cyls.map((c) => ({
      id: `cyl${c.n}`,
      name: L(`Cylinder ${c.n}`, `Cylindre ${c.n}`),
      obj: root,
      at: new THREE.Vector3(c.x, -0.75, c.s * (HEAD + 0.35)),
    })),
    {
      id: "piston",
      name: L("Piston", "Piston"),
      obj: c1.piston,
      at: new THREE.Vector3(0, 0.35, 0),
    },
    {
      id: "rod",
      name: L("Connecting rod", "Bielle"),
      obj: c1.rod,
      at: new THREE.Vector3(0, 0, 0),
    },
    {
      id: "crank",
      name: L("Crankshaft", "Vilebrequin"),
      obj: root,
      at: new THREE.Vector3(0.15, 0.15, 0),
    },
    {
      id: "intakeValve",
      name: L("Intake valve", "Soupape d’admission"),
      obj: c1.iv,
      at: new THREE.Vector3(0, 0.12, 0),
    },
    {
      id: "exhaustValve",
      name: L("Exhaust valve", "Soupape d’échappement"),
      obj: c1.ev,
      at: new THREE.Vector3(0, 0.12, 0),
    },
    {
      id: "plugs",
      name: L("Spark plugs", "Bougies"),
      obj: root,
      at: new THREE.Vector3(c1.x, 0.95, c1.s * (HEAD + 0.08)),
    },
    {
      id: "magL",
      name: L("Left magneto", "Magnéto gauche"),
      obj: magL,
      at: new THREE.Vector3(0, 0.2, 0.05),
    },
    {
      id: "magR",
      name: L("Right magneto", "Magnéto droite"),
      obj: magR,
      at: new THREE.Vector3(0, 0.2, -0.05),
    },
    {
      id: "carb",
      name: L("Carburettor", "Carburateur"),
      obj: root,
      at: new THREE.Vector3(0, carbY + 0.4, -0.25),
    },
    {
      id: "throttleValve",
      name: L("Throttle valve", "Papillon des gaz"),
      obj: throttleValve,
      at: new THREE.Vector3(0, 0, -0.18),
    },
    {
      id: "mixtureNeedle",
      name: L("Mixture needle", "Pointeau de mélange"),
      obj: needle,
      at: new THREE.Vector3(0.05, 0.1, 0.1),
    },
    {
      id: "heatValve",
      name: L("Carb heat valve", "Volet de réchauffage"),
      obj: heatValve,
      at: new THREE.Vector3(0, -0.15, 0.25),
    },
    {
      id: "airFilter",
      name: L("Air filter", "Filtre à air"),
      obj: root,
      at: new THREE.Vector3(-0.9, carbY - 0.55, 0.3),
    },
    {
      id: "muffler",
      name: L(
        "Muffler and heat shroud",
        "Silencieux et manchon de réchauffage",
      ),
      obj: root,
      at: new THREE.Vector3(2.2, -1.62, 0.34),
    },
    {
      id: "intake",
      name: L("Intake pipe", "Pipe d’admission"),
      obj: root,
      at: intakePts[1][2],
    },
    {
      id: "exhaust",
      name: L("Exhaust", "Échappement"),
      obj: root,
      at: exhaustPts[1][2],
    },
    {
      id: "prop",
      name: L("Propeller", "Hélice"),
      obj: prop,
      at: new THREE.Vector3(0, 1.6, 0),
    },
  ];

  const STROKE_COLOR: Record<Stroke, number> = {
    intake: MIX,
    compression: 0xe8d35a,
    power: 0xff6a1a,
    exhaust: BURNT,
  };
  let theta = 90; // crank angle (cylinder 1's cycle), °
  let liveStroke = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  const pose = (f: EngineFrame) => {
    crank.rotation.x = -theta * DEG;
    prop.rotation.x = -theta * DEG;
    const mags = f.set.mags;
    leadsL.color.setHex(
      mags === "both" || mags === "left" ? 0xd9b45a : 0x3a3f46,
    );
    leadsR.color.setHex(
      mags === "both" || mags === "right" ? 0xd9b45a : 0x3a3f46,
    );
    for (const c of cyls) {
      const phi = cylinderPhase(theta, c.n);
      const a = theta * DEG + c.psi;
      // crankpin, then the piston pin on the cylinder's axis
      const py = R * Math.sin(a);
      const pz = R * Math.cos(a);
      const d = c.s * pz + Math.sqrt(ROD * ROD - py * py);
      tmpA.set(c.x, py, pz);
      tmpB.set(c.x, 0, c.s * d);
      c.rod.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      tmpD.copy(tmpB).sub(tmpA).normalize();
      c.rod.quaternion.setFromUnitVectors(up, tmpD);
      const crown = d + PIN_CROWN;
      c.piston.position.set(c.x, 0, c.s * (crown - 0.275));
      // the gas between the crown and the roof
      const h = Math.max(0.02, HEAD - crown);
      c.gas.scale.set(1, 1, h);
      c.gas.position.set(c.x, 0, c.s * (crown + h / 2));
      const st = strokeAt(phi);
      const fl = flame(phi);
      c.gasMat.color.setHex(STROKE_COLOR[st]);
      c.gasMat.opacity =
        st === "power"
          ? 0.35 + 0.5 * fl
          : st === "compression"
            ? 0.35 + 0.35 * (1 - pistonTravel(phi))
            : 0.4;
      // valves: lift moves the valve into the chamber
      const v = valves(phi);
      c.iv.position.z = c.s * (HEAD - 0.16 * v.intake);
      c.ev.position.z = c.s * (HEAD - 0.16 * v.exhaust);
      // the spark: one per magneto still on
      const spark = phi >= 335 && phi < 352;
      c.sparkHi.visible = spark && (mags === "both" || mags === "left");
      c.sparkLo.visible = spark && (mags === "both" || mags === "right");
    }
    throttleValve.rotation.z = (90 - 80 * f.set.throttle) * DEG - Math.PI / 2;
    needle.position.y = carbY + 0.05 + 0.12 * (1 - f.set.mixture);
    heatValve.rotation.y = f.set.carbHeat ? 0.9 : 0;
  };

  return {
    root,
    parts,
    stages: PISTON_STAGES,
    view: { radius: 13, yaw: 0.32, pitch: 0.82, target: [0.1, -1.05, 0] },
    liveStage: () => liveStroke,
    update(f) {
      const rpm = f.v.rpm ?? 0;
      if (f.still) {
        // the stroke chosen: cylinder 1 in the middle of it (the systems steps keep the intake picture)
        theta = f.stage < 4 ? f.stage * 180 + 100 : 100;
      } else {
        // the crank turns slowed down so the eye can follow: 2,700 rpm shows as about one turn a second
        theta = (theta + (rpm / FLAT_FOUR.ratedRpm) * 360 * 1.0 * f.dt) % 720;
      }
      liveStroke = Math.floor(cylinderPhase(theta, 1) / 180);
      pose(f);
      const k = f.still ? 0 : (rpm / FLAT_FOUR.ratedRpm) * 0.9;
      const air = k * (0.25 + 0.75 * f.set.throttle);
      flow.setSpeed(0, f.set.carbHeat ? 0 : air);
      flow.setSpeed(1, f.set.carbHeat ? air : 0);
      cyls.forEach((c, i) => {
        const v = valves(cylinderPhase(theta, c.n));
        flow.setSpeed(2 + i, v.intake > 0.05 ? k * 1.4 * v.intake : 0);
        flow.setSpeed(6 + i, v.exhaust > 0.05 ? k * 1.4 * v.exhaust : 0);
      });
      flow.step(f.still ? 0 : f.dt);
      if (f.still) {
        // a still picture still says where the gas goes in the chosen step
        const show =
          f.stage === 0
            ? [0, 2]
            : f.stage === 3
              ? [6]
              : f.stage === 6
                ? [1]
                : f.stage === 5
                  ? [0]
                  : [];
        for (const p of show) flow.setSpeed(p, 0.0001);
        if (show.length) flow.step(0);
      }
    },
  };
}
