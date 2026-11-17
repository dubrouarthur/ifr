// The turbine engines in 3D (course/engines): a two-spool high by-pass turbofan (CFM56-7B class) and a
// free-turbine turboprop, both cut open by a quarter so the stages show. Each spool turns at its own speed (N1 /
// N2, Ng / Np: the gauges' numbers drive the picture, slowed down so the eye can follow); the air is coloured by
// station: cold at the intake, warmer through the compressors, burning in the chamber, hot through the turbines.
// The turbofan's by-pass stream flows round the core; its reversers slide the aft cowl back, the blocker doors
// close the duct and the cascades send the fan's air forward (AFH ch. 15, ATPL 021.12).
//
// The turboprop is drawn straight-through for clarity (intake, compressor, chamber, gas generator turbine, free
// turbine, then forward through the shaft to the reduction gearbox and the propeller); some turboprops (the PT6A
// family) are reverse-flow, with the same parts in the same order along the gas path (AFH ch. 14).
// Axes: the engine along X, air flowing towards +X; Y up.
import * as THREE from "three";
import {
  Builder,
  Flow,
  bladeRing,
  cylX,
  type EngineFrame,
  type EngineModel,
  type EngineStage,
  type FlowPath,
  type Mats,
  type PartLabel,
} from "./kit";
import type { L10n } from "../types";

const L = (en: string, fr: string): L10n => ({ en, fr });
const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * Math.min(1, Math.max(0, t));

/** A body of revolution round X, a quarter cut away (towards the viewer: +Y +Z), from (x, r) points. */
function shell(
  profile: [number, number][],
  seg = 28,
  full = false,
): THREE.BufferGeometry {
  const pts = profile.map(([x, r]) => new THREE.Vector2(r, x));
  const g = new THREE.LatheGeometry(
    pts,
    seg,
    0,
    full ? Math.PI * 2 : Math.PI * 1.5,
  );
  // lathe stands on Y: Y → X; the missing quarter lands between +Y and +Z
  g.rotateZ(-Math.PI / 2);
  return g;
}
/** colours of the gas by station */
const C = {
  air: 0x7cc4ff,
  cool: 0x9fd8ff,
  warm: 0xffe08a,
  burn: 0xff5a1f,
  hot: 0xff9a3c,
  out: 0xb8a89a,
};

// ------------------------------------------------------------------ the turbofan
export const TURBOFAN_STAGES: EngineStage[] = [
  {
    id: "fan",
    name: L("Fan and by-pass", "Soufflante et flux secondaire"),
    text: L(
      "The fan moves a large mass of air. About five times more air goes round the core than through it (by-pass ratio 5.1:1): this cold stream gives most of the thrust.",
      "La soufflante met en mouvement une grande masse d’air. Environ cinq fois plus d’air contourne le cœur qu’il n’en traverse (taux de dilution 5,1:1) : ce flux froid donne l’essentiel de la poussée.",
    ),
    focus: ["fan", "bypass"],
  },
  {
    id: "compressors",
    name: L("LP and HP compressors", "Compresseurs BP et HP"),
    text: L(
      "In the core, the low-pressure compressor (on the fan's shaft, N1) then the high-pressure compressor (its own shaft, N2) raise the pressure stage after stage.",
      "Dans le cœur, le compresseur basse pression (sur l’arbre de la soufflante, N1) puis le compresseur haute pression (son propre arbre, N2) font monter la pression étage après étage.",
    ),
    focus: ["lpc", "hpc"],
  },
  {
    id: "combustor",
    name: L("Combustion chamber", "Chambre de combustion"),
    text: L(
      "Fuel is sprayed into the annular chamber and burns continuously, at constant pressure: the gas leaves much hotter and faster.",
      "Le carburant est injecté dans la chambre annulaire et brûle en continu, à pression constante : le gaz en sort beaucoup plus chaud et plus rapide.",
    ),
    focus: ["combustor"],
  },
  {
    id: "turbines",
    name: L("HP and LP turbines", "Turbines HP et BP"),
    text: L(
      "The HP turbine drives the HP compressor (N2). The LP turbine drives the fan and the LP compressor (N1) through a shaft inside the HP shaft. EGT is measured after them.",
      "La turbine HP entraîne le compresseur HP (N2). La turbine BP entraîne la soufflante et le compresseur BP (N1) par un arbre logé dans l’arbre HP. L’EGT se mesure après elles.",
    ),
    focus: ["hpt", "lpt", "shafts"],
  },
  {
    id: "nozzle",
    name: L("Nozzle and thrust", "Tuyère et poussée"),
    text: L(
      "The hot core stream and the cold by-pass stream leave through their nozzles. Thrust grows steeply with N1: the last per cent of N1 gives a lot.",
      "Le flux chaud du cœur et le flux froid secondaire sortent par leurs tuyères. La poussée croît vite avec le N1 : les derniers pour cent de N1 comptent beaucoup.",
    ),
    focus: ["nozzle", "bypass"],
  },
  {
    id: "reversers",
    name: L("Thrust reversers", "Inverseurs de poussée"),
    text: L(
      "On the ground only: the aft cowl slides back, blocker doors close the by-pass duct and the cascades send the fan's air forward. Only the cold stream is reversed.",
      "Au sol seulement : le capot arrière recule, des volets obturent le canal secondaire et les grilles renvoient l’air de la soufflante vers l’avant. Seul le flux froid est inversé.",
    ),
    focus: ["reverser", "cascades"],
  },
];

export function buildTurbofan(mats: Mats): EngineModel {
  const root = new THREE.Group();
  const still = new THREE.Group();
  const lp = new THREE.Group();
  const hp = new THREE.Group();
  const sleeve = new THREE.Group();
  root.add(still, lp, hp, sleeve);
  const b = new Builder();
  // stream profiles (x → radius)
  const hub = (x: number) =>
    x < -1.5
      ? lerp(0.15, 0.45, (x + 2.4) / 0.9)
      : x < 3
        ? lerp(0.45, 0.55, (x + 1.5) / 4.5)
        : lerp(0.55, 0.15, (x - 3) / 1.1);
  const coreOut = (x: number) =>
    x < -0.6
      ? lerp(0.9, 0.78, (x + 1.5) / 0.9)
      : x < 1
        ? lerp(0.76, 0.64, (x + 0.6) / 1.6)
        : x < 1.8
          ? 0.85
          : lerp(0.82, 1.0, (x - 1.8) / 1.4);
  const cowlOut = (x: number) =>
    x < -1.3
      ? 0.95
      : x < 0.6
        ? lerp(1.0, 1.12, (x + 1.3) / 1.9)
        : lerp(1.12, 0.98, (x - 0.6) / 2.8);
  const nacIn = (x: number) =>
    x < 0.6 ? 1.72 : lerp(1.72, 1.45, (x - 0.6) / 1.0);

  // nacelle: inlet lip and fan case (static), aft translating sleeve
  b.add(
    still,
    "paint",
    shell([
      [-2.75, 1.88],
      [-2.8, 1.8],
      [-2.7, 1.72],
      [-2.2, 1.72],
      [-0.2, 1.72],
      [-0.2, 1.95],
      [-2.2, 2.0],
      [-2.75, 1.88],
    ]),
  );
  b.add(
    sleeve,
    "paint",
    shell([
      [-0.2, 1.72],
      [0.6, 1.72],
      [1.6, 1.45],
      [1.6, 1.55],
      [0.6, 1.92],
      [-0.2, 1.95],
      [-0.2, 1.72],
    ]),
  );
  // core cowl (outside of the core), inner casing seen through
  b.add(
    still,
    "alu",
    shell([
      [-1.45, 0.92],
      [-1.3, 0.95],
      [0.6, 1.12],
      [3.0, 0.98],
      [3.2, 0.92],
    ]),
  );
  b.add(
    still,
    "ghost",
    shell(
      [
        [-1.45, 0.9],
        [-0.6, 0.78],
        [1.0, 0.64],
        [1.8, 0.86],
        [3.2, 1.0],
      ],
      28,
      true,
    ),
  );
  // spinner, shafts
  const spin = new THREE.ConeGeometry(0.45, 0.9, 20);
  spin.rotateZ(Math.PI / 2);
  b.add(lp, "alu", spin, { pos: [-2.45, 0, 0] });
  b.add(lp, "steel", cylX(0.1, 0.1, 5.4, 10), { pos: [0.3, 0, 0] });
  b.add(hp, "dark", cylX(0.2, 0.2, 2.6, 12, true), { pos: [0.6, 0, 0] });
  // fan (N1) and its outlet guide vanes
  bladeRing(b, lp, "fan", {
    x: -2.0,
    rIn: 0.42,
    rOut: 1.7,
    n: 22,
    chord: 0.42,
    twist: 0.65,
    thick: 0.03,
  });
  bladeRing(b, still, "dark", {
    x: -1.0,
    rIn: 1.1,
    rOut: 1.72,
    n: 30,
    chord: 0.18,
    twist: 0.1,
    thick: 0.02,
  });
  // LP compressor (booster, N1): 3 stages
  for (let k = 0; k < 3; k++)
    bladeRing(b, lp, "blade", {
      x: -1.4 + k * 0.22,
      rIn: hub(-1.4) + 0.02,
      rOut: coreOut(-1.4 + k * 0.22) - 0.02,
      n: 28,
      chord: 0.12,
      twist: 0.5,
    });
  // HP compressor (N2): 9 stages, the annulus closing
  for (let k = 0; k < 9; k++) {
    const x = -0.5 + k * 0.17;
    bladeRing(b, hp, "blade", {
      x,
      rIn: hub(x) + 0.02,
      rOut: coreOut(x) - 0.02,
      n: 30,
      chord: 0.09,
      twist: 0.45,
    });
  }
  // annular combustion chamber and its fuel nozzles
  const burnGeo = shell(
    [
      [1.15, 0.58],
      [1.2, 0.78],
      [1.75, 0.82],
      [1.8, 0.6],
      [1.15, 0.58],
    ],
    28,
    true,
  );
  const burnMat = new THREE.MeshBasicMaterial({
    color: 0xff6a1f,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const burn = new THREE.Mesh(burnGeo, burnMat);
  burn.renderOrder = 1;
  root.add(burn);
  b.add(
    still,
    "ghostDark",
    shell(
      [
        [1.1, 0.56],
        [1.1, 0.84],
        [1.85, 0.88],
        [1.85, 0.56],
      ],
      28,
    ),
  );
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.add(still, "brass", cylX(0.035, 0.035, 0.25, 6), {
      pos: [1.05, 0.7 * Math.cos(a), 0.7 * Math.sin(a)],
    });
  }
  // HP turbine (N2, 1 stage) and LP turbine (N1, 4 stages)
  bladeRing(b, hp, "hot", {
    x: 1.98,
    rIn: 0.56,
    rOut: 0.84,
    n: 32,
    chord: 0.12,
    twist: -0.6,
    thick: 0.03,
  });
  for (let k = 0; k < 4; k++) {
    const x = 2.25 + k * 0.22;
    bladeRing(b, lp, "hot", {
      x,
      rIn: 0.56,
      rOut: coreOut(x) - 0.02,
      n: 34,
      chord: 0.12,
      twist: -0.55,
      thick: 0.03,
    });
  }
  // exhaust plug
  const plug = new THREE.ConeGeometry(0.55, 1.2, 20);
  plug.rotateZ(-Math.PI / 2);
  b.add(still, "dark", plug, { pos: [3.75, 0, 0] });
  // reversers: cascades (exposed when the sleeve slides back) and blocker doors
  const cascades = new THREE.Group();
  root.add(cascades);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 1.5;
    const g = new THREE.BoxGeometry(0.5, 0.06, 0.32);
    b.add(cascades, "dark", g, {
      pos: [0.15, 1.83 * Math.cos(a), -1.83 * Math.sin(a)],
      rot: [-a, 0, 0],
    });
  }
  const doors: THREE.Object3D[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 1.5 + 0.2;
    const pivot = new THREE.Group();
    pivot.position.set(0.55, 1.68 * Math.cos(a), -1.68 * Math.sin(a));
    pivot.rotation.x = -a;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.03, 0.55),
      mats.steel,
    );
    door.position.set(0.25, 0, 0);
    pivot.add(door);
    sleeve.add(pivot);
    doors.push(pivot);
  }
  b.finish(mats);

  // the gas: core and by-pass (and the by-pass turned forward by the reversers)
  const paths: FlowPath[] = [
    {
      k: "axial",
      x0: -2.9,
      x1: 4.3,
      rIn: (x) => hub(x) + 0.03,
      rOut: (x) => coreOut(x) - 0.04,
      colors: [
        [0, C.air],
        [0.22, C.cool],
        [0.48, C.warm],
        [0.56, C.burn],
        [0.7, C.hot],
        [1, C.out],
      ],
      n: 170,
    },
    {
      k: "axial",
      x0: -2.9,
      x1: 3.0,
      rIn: (x) => (x < -1.3 ? hub(x) + 0.5 : cowlOut(x) + 0.04),
      rOut: (x) => nacIn(x) - 0.05,
      colors: [
        [0, C.air],
        [1, C.cool],
      ],
      n: 230,
    },
    {
      k: "axial",
      x0: -2.9,
      x1: 0.15,
      rIn: (x) => (x < -1.3 ? hub(x) + 0.5 : cowlOut(x) + 0.04),
      rOut: (x) => nacIn(x) - 0.05,
      colors: [
        [0, C.air],
        [1, C.cool],
      ],
      n: 120,
    },
    {
      k: "axial",
      x0: -1.6,
      x1: 0.2,
      rIn: (x) => 2.0 + (0.2 - x) * 0.25,
      rOut: (x) => 2.15 + (0.2 - x) * 0.45,
      colors: [
        [0, C.cool],
        [1, C.air],
      ],
      n: 120,
      reverse: true,
    },
  ];
  const flow = new Flow(paths, 0.07);
  root.add(flow.points);

  const parts: PartLabel[] = [
    {
      id: "fan",
      name: L("Fan", "Soufflante"),
      obj: root,
      at: new THREE.Vector3(-2.0, 1.3, 0.55),
    },
    {
      id: "bypass",
      name: L("By-pass stream", "Flux secondaire"),
      obj: root,
      at: new THREE.Vector3(-0.6, 1.0, 1.05),
    },
    {
      id: "lpc",
      name: L("LP compressor (N1)", "Compresseur BP (N1)"),
      obj: root,
      at: new THREE.Vector3(-1.2, 0.55, 0.45),
    },
    {
      id: "hpc",
      name: L("HP compressor (N2)", "Compresseur HP (N2)"),
      obj: root,
      at: new THREE.Vector3(0.2, 0.45, 0.4),
    },
    {
      id: "combustor",
      name: L("Combustion chamber", "Chambre de combustion"),
      obj: root,
      at: new THREE.Vector3(1.45, 0.62, 0.42),
    },
    {
      id: "hpt",
      name: L("HP turbine", "Turbine HP"),
      obj: root,
      at: new THREE.Vector3(1.98, 0.6, 0.45),
    },
    {
      id: "lpt",
      name: L("LP turbine", "Turbine BP"),
      obj: root,
      at: new THREE.Vector3(2.6, 0.72, 0.5),
    },
    {
      id: "shafts",
      name: L("N1 and N2 shafts", "Arbres N1 et N2"),
      obj: root,
      at: new THREE.Vector3(0.9, 0.18, 0.12),
    },
    {
      id: "nozzle",
      name: L("Exhaust nozzle", "Tuyère"),
      obj: root,
      at: new THREE.Vector3(3.9, 0.35, 0.3),
    },
    {
      id: "reverser",
      name: L("Translating cowl", "Capot coulissant"),
      obj: sleeve,
      at: new THREE.Vector3(1.0, 1.55, -1.0),
    },
    {
      id: "cascades",
      name: L("Cascades", "Grilles d’inversion"),
      obj: cascades,
      at: new THREE.Vector3(0.15, 2.0, -0.5),
    },
  ];

  let a1 = 0;
  let a2 = 0;
  let dep = 0;
  return {
    root,
    parts,
    stages: TURBOFAN_STAGES,
    view: {
      radius: 13.5,
      yaw: -0.6, pitch: 0.42, target: [0.4, -0.45, 0] },
    update(f: EngineFrame) {
      const n1 = f.v.n1 ?? 20;
      const n2 = f.v.n2 ?? 60;
      // N1 100 % shows as about 1.2 turns a second, N2 a little faster (slowed for the eye)
      if (!f.still) {
        a1 += (n1 / 100) * 7.5 * f.dt;
        a2 += (n2 / 100) * 9.5 * f.dt;
      }
      lp.rotation.x = a1;
      hp.rotation.x = a2;
      // reversers deploy over about 2 s
      const want = f.set.reverse ? 1 : 0;
      dep = f.still
        ? want
        : dep +
          Math.sign(want - dep) * Math.min(Math.abs(want - dep), f.dt * 0.6);
      sleeve.position.x = 0.55 * dep;
      for (const d of doors) d.rotation.z = -1.2 * dep;
      cascades.visible = dep > 0.05;
      const thrust = f.v.thrust ?? 0.1;
      burnMat.opacity = 0.25 + 0.55 * Math.min(1, (f.v.egt ?? 420) / 950);
      const k = f.still ? 0 : 0.25 + 0.6 * (n1 / 100);
      flow.setSpeed(0, k * 0.8);
      flow.setSpeed(1, dep > 0.5 ? 0 : k);
      flow.setSpeed(2, dep > 0.5 ? k * 1.4 : 0);
      flow.setSpeed(3, dep > 0.5 ? k : 0);
      void thrust;
      flow.step(f.still ? 0 : f.dt);
      if (f.still) {
        const show = f.stage === 5 || f.set.reverse ? [0, 2, 3] : [0, 1];
        for (const p of show) flow.setSpeed(p, 0.0001);
        flow.step(0);
      }
    },
  };
}

// ------------------------------------------------------------------ the free-turbine turboprop
export const TURBOPROP_STAGES: EngineStage[] = [
  {
    id: "inlet",
    name: L("Air intake", "Entrée d’air"),
    text: L(
      "The air comes in through the intake and its screen, then turns into the compressor.",
      "L’air entre par l’entrée d’air et sa grille de protection, puis s’engage dans le compresseur.",
    ),
    focus: ["inlet"],
  },
  {
    id: "compressor",
    name: L("Compressor", "Compresseur"),
    text: L(
      "Axial stages then a centrifugal stage compress the air. The compressor turns with the gas generator turbine: their speed is Ng.",
      "Des étages axiaux puis un étage centrifuge compriment l’air. Le compresseur tourne avec la turbine du générateur de gaz : leur vitesse est le Ng.",
    ),
    focus: ["compressor"],
  },
  {
    id: "combustor",
    name: L("Combustion chamber", "Chambre de combustion"),
    text: L(
      "Fuel burns continuously in the annular chamber. ITT, between the two turbines, is the temperature to watch at start and at high power.",
      "Le carburant brûle en continu dans la chambre annulaire. L’ITT, entre les deux turbines, est la température à surveiller au démarrage et à forte puissance.",
    ),
    focus: ["combustor", "itt"],
  },
  {
    id: "ggTurbine",
    name: L("Gas generator turbine", "Turbine du générateur de gaz"),
    text: L(
      "This turbine takes just enough energy to drive the compressor. With the compressor and the chamber it makes the gas generator (Ng).",
      "Cette turbine prélève juste assez d’énergie pour entraîner le compresseur. Avec lui et la chambre, elle forme le générateur de gaz (Ng).",
    ),
    focus: ["ggTurbine"],
  },
  {
    id: "freeTurbine",
    name: L("Free turbine", "Turbine libre"),
    text: L(
      "The free turbine has no mechanical link with the compressor: the gas alone drives it. It turns the propeller through its own shaft (Np).",
      "La turbine libre n’a aucun lien mécanique avec le compresseur : seul le gaz l’entraîne. Elle fait tourner l’hélice par son propre arbre (Np).",
    ),
    focus: ["freeTurbine", "shaft"],
  },
  {
    id: "gearbox",
    name: L("Reduction gearbox and propeller", "Réducteur et hélice"),
    text: L(
      "The reduction gearbox brings the turbine's very high speed down to the propeller's. The governor holds Np; the torque gauge reads the power.",
      "Le réducteur ramène la très grande vitesse de la turbine à celle de l’hélice. Le régulateur tient le Np ; le couplemètre indique la puissance.",
    ),
    focus: ["gearbox", "prop"],
  },
];

export function buildTurboprop(mats: Mats): EngineModel {
  const root = new THREE.Group();
  const still = new THREE.Group();
  const gg = new THREE.Group(); // Ng: compressor + gas generator turbine
  const pt = new THREE.Group(); // Np: free turbine + its shaft + sun gear
  const prop = new THREE.Group(); // propeller (geared down)
  root.add(still, gg, pt, prop);
  const b = new Builder();
  const hub = (x: number) =>
    x < -1.2 ? 0.4 : x < 1.2 ? lerp(0.4, 0.35, (x + 1.2) / 2.4) : 0.35;
  const out = (x: number) =>
    x < -1.2
      ? 0.95
      : x < 0
        ? lerp(0.8, 0.6, (x + 1.2) / 1.2)
        : x < 0.5
          ? 0.95
          : x < 1.3
            ? 0.85
            : lerp(0.8, 0.95, (x - 1.3) / 1.2);
  // casing (cut), intake with its screen, exhaust duct
  b.add(
    still,
    "alu",
    shell([
      [-1.7, 1.05],
      [-1.0, 1.05],
      [-0.2, 0.75],
      [0.3, 1.1],
      [1.4, 1.0],
      [2.6, 1.05],
      [2.6, 1.15],
      [1.4, 1.1],
      [0.3, 1.2],
      [-0.2, 0.85],
      [-1.0, 1.15],
      [-1.7, 1.15],
      [-1.7, 1.05],
    ]),
  );
  b.add(
    still,
    "ghostDark",
    shell(
      [
        [-1.75, 0.45],
        [-1.75, 1.05],
      ],
      28,
      true,
    ),
  );
  b.add(
    still,
    "hot",
    shell([
      [2.6, 1.05],
      [3.2, 1.15],
      [3.2, 1.25],
      [2.6, 1.15],
    ]),
  );
  // gearbox case and propeller shaft housing in front
  b.add(
    still,
    "ghostDark",
    shell(
      [
        [-3.1, 0.35],
        [-2.9, 0.75],
        [-2.0, 0.85],
        [-1.75, 0.5],
        [-3.1, 0.35],
      ],
      28,
      true,
    ),
  );
  // compressor (Ng): 3 axial stages and a centrifugal impeller
  for (let k = 0; k < 3; k++)
    bladeRing(b, gg, "blade", {
      x: -1.25 + k * 0.25,
      rIn: hub(-1.25) + 0.02,
      rOut: out(-1.25 + k * 0.25) - 0.03,
      n: 26,
      chord: 0.12,
      twist: 0.5,
    });
  const imp = new THREE.CylinderGeometry(0.4, 0.82, 0.35, 24);
  imp.rotateZ(Math.PI / 2);
  b.add(gg, "blade", imp, { pos: [-0.35, 0, 0] });
  b.add(gg, "dark", cylX(0.2, 0.2, 2.0, 12, true), { pos: [0.4, 0, 0] });
  // annular chamber
  const burnMat = new THREE.MeshBasicMaterial({
    color: 0xff6a1f,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const burn = new THREE.Mesh(
    shell(
      [
        [0.15, 0.55],
        [0.2, 0.85],
        [0.95, 0.85],
        [1.0, 0.55],
        [0.15, 0.55],
      ],
      28,
      true,
    ),
    burnMat,
  );
  burn.renderOrder = 1;
  root.add(burn);
  b.add(
    still,
    "ghostDark",
    shell(
      [
        [0.1, 0.5],
        [0.1, 0.9],
        [1.05, 0.9],
        [1.05, 0.5],
      ],
      28,
    ),
  );
  // gas generator turbine (Ng) and the free turbine (Np, 2 stages)
  bladeRing(b, gg, "hot", {
    x: 1.3,
    rIn: 0.4,
    rOut: 0.84,
    n: 30,
    chord: 0.13,
    twist: -0.6,
    thick: 0.03,
  });
  for (let k = 0; k < 2; k++)
    bladeRing(b, pt, "hot", {
      x: 1.75 + k * 0.3,
      rIn: 0.4,
      rOut: out(1.75 + k * 0.3) - 0.03,
      n: 32,
      chord: 0.14,
      twist: -0.55,
      thick: 0.03,
    });
  // the power shaft runs forward inside the gas generator to the gearbox
  b.add(pt, "steel", cylX(0.1, 0.1, 4.6, 10), { pos: [-0.3, 0, 0] });
  // reduction gearbox: the sun gear (Np) and the planet carrier (propeller)
  b.add(pt, "brass", cylX(0.2, 0.2, 0.18, 12), { pos: [-2.45, 0, 0] });
  b.add(
    still,
    "ghostDark",
    new THREE.TorusGeometry(0.62, 0.06, 6, 28).rotateY(Math.PI / 2),
    { pos: [-2.45, 0, 0] },
  );
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add(prop, "brass", cylX(0.2, 0.2, 0.16, 12), {
      pos: [0.45, 0.4 * Math.cos(a), 0.4 * Math.sin(a)],
    });
  }
  // propeller: hub, spinner, 4 blades whose angle the governor sets
  prop.position.set(-2.9, 0, 0);
  b.add(prop, "steel", cylX(0.08, 0.08, 0.9, 10), { pos: [0.25, 0, 0] });
  const sp = new THREE.ConeGeometry(0.42, 0.8, 20);
  sp.rotateZ(Math.PI / 2);
  b.add(prop, "alu", sp, { pos: [-0.55, 0, 0] });
  const blades: THREE.Object3D[] = [];
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.x = (k / 4) * Math.PI * 2;
    const blade = new THREE.Group();
    blade.position.set(-0.25, 0, 0);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 2.1, 0.32),
      mats.black,
    );
    m.position.y = 1.35;
    blade.add(m);
    arm.add(blade);
    prop.add(arm);
    blades.push(blade);
  }
  b.finish(mats);

  const paths: FlowPath[] = [
    {
      k: "axial",
      x0: -1.75,
      x1: 3.3,
      rIn: (x) => hub(x) + 0.04,
      rOut: (x) => out(x) - 0.05,
      colors: [
        [0, C.air],
        [0.2, C.cool],
        [0.33, C.warm],
        [0.4, C.burn],
        [0.55, C.hot],
        [1, C.out],
      ],
      n: 220,
    },
  ];
  const flow = new Flow(paths, 0.07);
  root.add(flow.points);

  const parts: PartLabel[] = [
    {
      id: "inlet",
      name: L("Air intake", "Entrée d’air"),
      obj: root,
      at: new THREE.Vector3(-1.7, 0.8, 0.55),
    },
    {
      id: "compressor",
      name: L("Compressor (Ng)", "Compresseur (Ng)"),
      obj: root,
      at: new THREE.Vector3(-0.8, 0.55, 0.45),
    },
    {
      id: "combustor",
      name: L("Combustion chamber", "Chambre de combustion"),
      obj: root,
      at: new THREE.Vector3(0.6, 0.7, 0.4),
    },
    {
      id: "ggTurbine",
      name: L("Gas generator turbine", "Turbine générateur de gaz"),
      obj: root,
      at: new THREE.Vector3(1.3, 0.62, 0.45),
    },
    {
      id: "itt",
      name: L("ITT probe", "Sonde ITT"),
      obj: root,
      at: new THREE.Vector3(1.52, 0.95, 0.2),
    },
    {
      id: "freeTurbine",
      name: L("Free turbine (Np)", "Turbine libre (Np)"),
      obj: root,
      at: new THREE.Vector3(1.95, 0.7, 0.5),
    },
    {
      id: "shaft",
      name: L("Power shaft", "Arbre de puissance"),
      obj: root,
      at: new THREE.Vector3(-1.0, 0.1, 0.1),
    },
    {
      id: "gearbox",
      name: L("Reduction gearbox", "Réducteur"),
      obj: root,
      at: new THREE.Vector3(-2.45, 0.7, 0.3),
    },
    {
      id: "prop",
      name: L("Propeller", "Hélice"),
      obj: prop,
      at: new THREE.Vector3(-0.2, 1.7, 0.2),
    },
  ];

  let ag = 0;
  let ap = 0;
  return {
    root,
    parts,
    stages: TURBOPROP_STAGES,
    view: {
      radius: 13,
      yaw: -0.62, pitch: 0.42, target: [-0.3, -0.45, 0] },
    update(f: EngineFrame) {
      const ng = f.v.ng ?? 52;
      const np = f.v.np ?? 1000;
      if (!f.still) {
        ag += (ng / 100) * 9 * f.dt;
        // the free turbine turns much faster than the propeller (geared down about 15:1): shown 3:1 here
        ap += (np / 1900) * 2.2 * f.dt;
      }
      gg.rotation.x = ag;
      pt.rotation.x = ap * 3;
      prop.rotation.x = ap;
      for (const bl of blades)
        bl.rotation.y = ((f.v.blade ?? 20) * Math.PI) / 180;
      burnMat.opacity = 0.2 + 0.6 * Math.min(1, ((f.v.itt ?? 520) - 400) / 400);
      flow.setSpeed(0, f.still ? 0.0001 : 0.25 + 0.6 * ((ng - 50) / 50));
      flow.step(f.still ? 0 : f.dt);
    },
  };
}
