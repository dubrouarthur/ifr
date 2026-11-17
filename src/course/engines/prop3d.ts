// The constant-speed propeller and its governor in 3D (course/engines), after PHAK ch. 7 « Constant-speed
// propeller »: the engine drives the governor's flyweights; the speeder spring, set by the propeller lever, pushes
// against them; the pilot valve between them sends oil to the hub (or lets it out) and the hub's piston turns the
// blades. On speed the flyweights stand upright and the pilot valve covers its ports; overspeed tilts them out,
// underspeed in. Which way oil pressure turns the blades depends on the propeller's design (single-engine
// non-feathering or feathering twin): the picture shows oil going to the hub to coarsen the blades, one common
// design; the words stay true for both.
// Axes: the crankshaft along X (the propeller at −X), the governor standing on Y above the engine's nose.
import * as THREE from "three";
import {
  Builder,
  Flow,
  cylX,
  type EngineFrame,
  type EngineModel,
  type EngineStage,
  type Mats,
  type PartLabel,
} from "./kit";
import { flyweightTilt } from "./model";
import type { L10n } from "../types";

const L = (en: string, fr: string): L10n => ({ en, fr });
const DEG = Math.PI / 180;

export const PROP_STAGES: EngineStage[] = [
  {
    id: "overview",
    name: L("Constant-speed propeller", "Hélice à vitesse constante"),
    text: L(
      "The throttle sets the manifold pressure, the propeller lever sets the rpm. The governor changes the blade angle to hold that rpm whatever the power.",
      "La manette des gaz règle la pression d’admission, la manette d’hélice règle le régime. Le régulateur change le pas des pales pour tenir ce régime, quelle que soit la puissance.",
    ),
    focus: ["blades", "governor"],
  },
  {
    id: "flyweights",
    name: L("Flyweights", "Masselottes"),
    text: L(
      "Driven by the engine, the flyweights lean out as the rpm rises (centrifugal force) and in as it falls. The speeder spring pushes against them.",
      "Entraînées par le moteur, les masselottes s’écartent quand le régime monte (force centrifuge) et se referment quand il baisse. Le ressort de consigne s’y oppose.",
    ),
    focus: ["flyweights", "spring"],
  },
  {
    id: "spring",
    name: L("Speeder spring and lever", "Ressort de consigne et manette"),
    text: L(
      "The propeller lever squeezes the speeder spring more or less: that is the rpm asked for. More spring, more rpm before the flyweights win.",
      "La manette d’hélice comprime plus ou moins le ressort de consigne : c’est le régime demandé. Plus de ressort, plus de régime avant que les masselottes ne l’emportent.",
    ),
    focus: ["spring", "lever"],
  },
  {
    id: "pilotValve",
    name: L("Pilot valve and oil", "Distributeur et huile"),
    text: L(
      "On speed the pilot valve covers its ports. Overspeed lifts it one way, underspeed the other: oil moves the hub's piston and the blade angle changes until the rpm is back.",
      "En régime, le distributeur obture ses orifices. La survitesse le déplace dans un sens, la sous-vitesse dans l’autre : l’huile déplace le piston du moyeu et le pas change jusqu’au retour du régime.",
    ),
    focus: ["pilotValve", "oil", "hub"],
  },
  {
    id: "order",
    name: L("Lever order", "Ordre des manettes"),
    text: L(
      "To add power: rpm first (propeller), then manifold pressure (throttle). To reduce: throttle first, then propeller. Never a high manifold pressure at a low rpm.",
      "Pour augmenter la puissance : d’abord le régime (hélice), puis la pression d’admission (gaz). Pour réduire : d’abord les gaz, puis l’hélice. Jamais de forte pression d’admission à bas régime.",
    ),
    focus: ["lever", "governor"],
  },
];

export function buildProp(mats: Mats): EngineModel {
  const root = new THREE.Group();
  const still = new THREE.Group();
  const spin = new THREE.Group(); // propeller and crankshaft flange
  const head = new THREE.Group(); // the governor's flyweight head (turns on Y)
  root.add(still, spin, head);
  const b = new Builder();
  // the engine's nose (seen through) and crankshaft
  b.add(still, "ghostDark", new THREE.BoxGeometry(2.6, 1.3, 1.6), {
    pos: [1.4, -0.2, 0],
  });
  b.add(spin, "steel", cylX(0.16, 0.16, 2.4, 12), { pos: [0.6, 0, 0] });
  // propeller hub (seen through) with its piston, spinner, two blades
  spin.position.set(0, 0, 0);
  b.add(spin, "ghost", cylX(0.36, 0.36, 0.7, 18), { pos: [-0.55, 0, 0] });
  const sp = new THREE.ConeGeometry(0.36, 0.7, 18);
  sp.rotateZ(Math.PI / 2);
  b.add(spin, "alu", sp, { pos: [-1.25, 0, 0] });
  const hubPiston = new THREE.Mesh(cylX(0.3, 0.3, 0.12, 16), mats.brass);
  spin.add(hubPiston);
  const blades: THREE.Object3D[] = [];
  for (const k of [0, 1]) {
    const arm = new THREE.Group();
    arm.rotation.x = k * Math.PI;
    const blade = new THREE.Group();
    blade.position.set(-0.55, 0.3, 0);
    const g = new THREE.BoxGeometry(0.07, 2.2, 0.36);
    g.translate(0, 1.1, 0);
    blade.add(new THREE.Mesh(g, mats.black));
    arm.add(blade);
    spin.add(arm);
    blades.push(blade);
  }
  // the governor: body (seen through), drive at the bottom
  const gx = 1.4;
  b.add(
    still,
    "ghost",
    new THREE.CylinderGeometry(0.42, 0.42, 1.9, 20, 1, true),
    { pos: [gx, 1.45, 0] },
  );
  b.add(still, "dark", new THREE.CylinderGeometry(0.45, 0.45, 0.15, 20), {
    pos: [gx, 0.5, 0],
  });
  head.position.set(gx, 0.85, 0);
  b.add(head, "steel", new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16));
  const weights: THREE.Object3D[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * s, 0.05, 0);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.42, 0.14),
      mats.copper,
    );
    arm.position.set(0, 0.21, 0);
    const toe = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.12),
      mats.copper,
    );
    toe.position.set(-0.09 * s, 0.03, 0);
    pivot.add(arm, toe);
    head.add(pivot);
    weights.push(pivot);
  }
  const pilot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10),
    mats.steel,
  );
  root.add(pilot);
  for (const y of [0.2, 0.55]) {
    const land = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12),
      mats.steel,
    );
    land.position.y = y - 0.35;
    pilot.add(land);
  }
  // the speeder spring (a helix) and its cap moved by the propeller lever
  const springPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 80; k++) {
    const t = k / 80;
    springPts.push(
      new THREE.Vector3(
        0.16 * Math.cos(t * Math.PI * 14),
        t,
        0.16 * Math.sin(t * Math.PI * 14),
      ),
    );
  }
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(springPts),
      160,
      0.022,
      6,
    ),
    mats.steel,
  );
  spring.position.set(gx, 1.62, 0);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16),
    mats.dark,
  );
  root.add(spring, cap);
  const lever = new THREE.Group();
  const leverArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.08, 0.08),
    mats.paint,
  );
  leverArm.position.set(0.45, 0, 0);
  lever.add(leverArm);
  root.add(lever);
  // the oil line: from the governor down into the crankshaft and forward to the hub
  const oilPts = [
    new THREE.Vector3(gx + 0.2, 0.6, 0.25),
    new THREE.Vector3(gx + 0.2, 0.15, 0.25),
    new THREE.Vector3(gx - 0.2, 0.05, 0.1),
    new THREE.Vector3(0.2, 0, 0),
    new THREE.Vector3(-0.5, 0, 0),
  ];
  b.add(
    still,
    "ghostDark",
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(oilPts.slice(0, 3)),
      12,
      0.05,
      6,
    ),
  );
  b.finish(mats);
  const flow = new Flow(
    [
      {
        k: "poly",
        pts: oilPts,
        radius: 0.04,
        colors: [
          [0, 0xffc433],
          [1, 0xffc433],
        ],
        n: 40,
      },
      {
        k: "poly",
        pts: [...oilPts].reverse(),
        radius: 0.04,
        colors: [
          [0, 0xffc433],
          [1, 0xffc433],
        ],
        n: 40,
      },
    ],
    0.08,
  );
  root.add(flow.points);

  const parts: PartLabel[] = [
    {
      id: "blades",
      name: L("Blades", "Pales"),
      obj: blades[0],
      at: new THREE.Vector3(0, 1.9, 0),
    },
    {
      id: "hub",
      name: L("Hub and pitch piston", "Moyeu et piston de pas"),
      obj: root,
      at: new THREE.Vector3(-0.55, -0.45, 0.3),
    },
    {
      id: "governor",
      name: L("Governor", "Régulateur"),
      obj: root,
      at: new THREE.Vector3(gx + 0.45, 2.3, 0),
    },
    {
      id: "flyweights",
      name: L("Flyweights", "Masselottes"),
      obj: head,
      at: new THREE.Vector3(0.3, 0.35, 0.2),
    },
    {
      id: "spring",
      name: L("Speeder spring", "Ressort de consigne"),
      obj: spring,
      at: new THREE.Vector3(0.25, 0.5, 0),
    },
    {
      id: "pilotValve",
      name: L("Pilot valve", "Distributeur"),
      obj: pilot,
      at: new THREE.Vector3(-0.12, 0.1, 0.12),
    },
    {
      id: "lever",
      name: L("Propeller lever", "Manette d’hélice"),
      obj: leverArm,
      at: new THREE.Vector3(0.4, 0.1, 0),
    },
    {
      id: "oil",
      name: L("Oil to the hub", "Huile vers le moyeu"),
      obj: root,
      at: new THREE.Vector3(0.3, 0.15, 0.2),
    },
  ];

  let ang = 0;
  let spinHead = 0;
  return {
    root,
    parts,
    stages: PROP_STAGES,
    view: { radius: 8, yaw: -0.85, pitch: 0.38, target: [0.4, 0.6, 0] },
    update(f: EngineFrame) {
      const rpm = f.v.rpm ?? 2400;
      const set = f.v.rpmSet ?? 2400;
      const beta = f.v.blade ?? 20;
      if (!f.still) {
        ang += (rpm / 2700) * 6.3 * f.dt;
        spinHead += (rpm / 2700) * 8 * f.dt;
      }
      spin.rotation.x = ang;
      head.rotation.y = spinHead;
      // the governor's state: on speed upright, overspeed out, underspeed in
      const tilt = f.still ? 0 : flyweightTilt(rpm, set);
      weights[0].rotation.z = -tilt * 0.45;
      weights[1].rotation.z = tilt * 0.45;
      pilot.position.set(gx, 1.3 + tilt * 0.12, 0);
      // spring: the lever squeezes it (shorter = more rpm asked)
      const p = f.set.prop;
      const len = 0.62 - 0.22 * p;
      spring.scale.set(1, len, 1);
      cap.position.set(gx, 1.62 + len + 0.03, 0);
      lever.position.set(gx, 1.62 + len + 0.07, 0);
      lever.rotation.z = (-10 + 25 * p) * DEG;
      for (const bl of blades) bl.rotation.y = beta * DEG;
      hubPiston.position.set(-0.75 + (beta - 14) * 0.02, 0, 0);
      // oil: towards the hub in overspeed, back in underspeed, still on speed
      const k = f.still ? 0 : Math.min(1.2, Math.abs(tilt) * 2.5);
      flow.setSpeed(0, tilt > 0.03 ? k : 0);
      flow.setSpeed(1, tilt < -0.03 ? k : 0);
      flow.step(f.still ? 0 : f.dt);
    },
  };
}
