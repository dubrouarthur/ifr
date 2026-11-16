// Ground school — designed slides: instruments that move by themselves. A short scripted flight of the slide's
// situation (keyframes on airspeed, altitude, vertical speed, heading, attitude, power, the needles of a VOR or an
// ILS, a vacuum failure) is "baked" into a timeline of complete flight states with the couplings of a real
// aircraft (a rate of turn gives the bank from the speed and the heading from the bank; a vertical speed gives the
// altitude and, with the speed, the flight path and the pitch the wing needs; a deviation places the aircraft where
// the receiver shows it). Each frame writes that state into the situation's Sim and the simulator's own renderers
// draw it: every instrument of the slide that shows the situation moves as one aircraft (canvas/instruments.ts).
//
// Sources for the numbers (comments at each preset): Cessna 172S Pilot's Operating Handbook (POH) sections 2 and 5,
// FAA-H-8083-3C Airplane Flying Handbook (AFH), FAA-H-8083-25C Pilot's Handbook of Aeronautical Knowledge (PHAK),
// FAA-H-8083-15B Instrument Flying Handbook (IFH), FAA-S-ACS-6C Private Pilot ACS. Time is compressed where the
// real manoeuvre takes minutes (it is said at the preset); speeds, angles, rates and RPM are the aircraft's.
import type { Sim } from "../../sim/sim";
import { AIRFRAME } from "../../sim/aircraft";
import { G, FT, KT, density } from "../../sim/environment";
import { rederive, tasForIas } from "../scene";
import { tunedNavaid } from "../../nav/radios";
import {
  bearingDeg,
  destination,
  distanceNm,
  DEG,
  FT_PER_NM,
  type LatLon,
} from "../../nav/geo";
import type {
  InstrumentMotion,
  InstrumentView,
  L10n,
  MotionChannel,
  MotionMark,
  MotionScript,
} from "../types";

const L = (en: string, fr: string): L10n => ({ en, fr });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const norm360 = (d: number) => ((d % 360) + 360) % 360;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export const MOTION_CHANNELS: readonly MotionChannel[] = [
  "ias",
  "alt",
  "vs",
  "hdg",
  "pitch",
  "bank",
  "turn",
  "rpm",
  "cdi",
  "gs",
  "vacuum",
];

/** A signal the animation needs from the situation (else it starts from its own ready situation). */
export type MotionNeed = "loc" | "gs" | "vor" | "adf" | "steam";

export interface MotionPreset extends MotionScript {
  id: string;
  level: "ppl" | "ifr";
  name: L10n;
  /** what the student sees, one line */
  what: L10n;
  /** the instrument that shows it best (the studio's preview and the « Ajouter » suggestion) */
  view: InstrumentView;
  needs?: MotionNeed;
  /** the ready situation (course/situations.ts READY_SITUATIONS) it starts from when the slide's has not the signal */
  situation?: string;
  /** the animation goes to the stall on purpose (the limit test lets it reach VS1) */
  stall?: boolean;
}

const six: InstrumentView = { kind: "six" };
const gauge = (
  g: "asi" | "ai" | "alt" | "tc" | "hsi" | "vsi" | "cdi" | "rmi",
): InstrumentView => ({
  kind: "gauge",
  gauge: g,
});

/**
 * The named animations an author picks in one click. Heading and altitude are measured from the situation (a turn
 * turns from where the slide's aircraft is heading); speeds, RPM and attitudes are the numbers of the C172S.
 */
export const MOTION_PRESETS: MotionPreset[] = [
  // ---------------------------------------------------------------- PPL
  {
    // POH 2 (airspeed indicator markings, KIAS): white arc 40–85 (VSO–VFE), green 48–129 (VS1–VNO), yellow
    // 129–163, red line 163 (VNE). The sweep stays at 160, under the red line: from slow flight (just above VS1)
    // full power level to 120, then a dive (−1 500 ft/min) to 160, then back to level at 100. Compressed time.
    id: "asi-arcs",
    level: "ppl",
    name: L("Sweep of the airspeed arcs", "Balayage des arcs de l’anémomètre"),
    what: L(
      "The needle runs through the green, the white and the yellow arcs up to the red line.",
      "L’aiguille parcourt l’arc vert, l’arc blanc et l’arc jaune jusqu’au trait rouge.",
    ),
    view: gauge("asi"),
    duration: 34,
    tracks: {
      ias: [
        [0, 51],
        [8, 85],
        [15, 129],
        [22, 160],
        [26, 160],
        [34, 100],
      ],
      vs: [
        [0, 0],
        [13, 0],
        [17, -1500],
        [24, -1500],
        [28, 0],
        [34, 0],
      ],
      rpm: [
        [0, 2450],
        [13, 2500],
        [17, 2300],
        [26, 2350],
        [34, 2300],
      ],
    },
    telling: 15,
    marks: [
      {
        id: "vfe",
        channel: "ias",
        value: 85,
        label: L(
          "VFE 85 kt: top of the white arc",
          "VFE 85 kt : haut de l’arc blanc",
        ),
      },
      {
        id: "vno",
        channel: "ias",
        value: 129,
        label: L(
          "VNO 129 kt: the yellow arc begins",
          "VNO 129 kt : début de l’arc jaune",
        ),
      },
      {
        id: "vne",
        channel: "ias",
        value: 160,
        label: L(
          "The red line, VNE 163 kt, is just above",
          "Le trait rouge, VNE 163 kt, est juste au-dessus",
        ),
      },
    ],
  },
  {
    // POH 4 (normal climb) / 5 (maximum rate of climb): VY 74 KIAS at sea level, full throttle, 730 ft/min at sea
    // level and 2 550 lb (about 650 ft/min at 3 000 ft). AFH 3: attitude first, then the power, the speed settles.
    id: "climb-vy",
    level: "ppl",
    name: L("Climb at VY", "Montée à VY"),
    what: L(
      "The nose comes up, full power, the speed settles at 74 kt and the climb at about 650 ft/min.",
      "Le nez monte, pleine puissance, la vitesse se stabilise à 74 kt et la montée vers 650 ft/min.",
    ),
    view: six,
    duration: 22,
    tracks: {
      rpm: [
        [0, 2300],
        [2, 2300],
        [4, 2450],
        [22, 2420],
      ],
      ias: [
        [0, 100],
        [3, 100],
        [12, 74],
        [22, 74],
      ],
      vs: [
        [0, 0],
        [3, 50],
        [12, 650],
        [22, 650],
      ],
    },
    telling: 16,
    marks: [
      {
        id: "vy",
        channel: "ias",
        value: 74,
        label: L(
          "VY 74 kt: the best rate of climb",
          "VY 74 kt : le meilleur taux de montée",
        ),
      },
      {
        id: "rate",
        channel: "vs",
        value: 640,
        label: L("About 650 ft/min", "Environ 650 ft/min"),
      },
    ],
  },
  {
    // AFH 3 (level off from a climb): lead the level-off by about 10 % of the vertical speed (65 ft at 650 ft/min);
    // attitude to level first, the speed builds, then the power is reduced to cruise (POH 5: 2 300 RPM, ~105 KIAS
    // at 3 000 ft). With a fixed-pitch propeller the RPM rises with the speed before the reduction.
    id: "level-off",
    level: "ppl",
    name: L("Levelling off", "Mise en palier"),
    what: L(
      "Lead the altitude, nose down to level, the speed builds, then the power comes back to 2 300 RPM.",
      "On anticipe l’altitude, le nez revient à l’horizon, la vitesse monte, puis on réduit à 2 300 tr/min.",
    ),
    view: six,
    duration: 30,
    tracks: {
      vs: [
        [0, 650],
        [6, 650],
        [10, 0],
        [30, 0],
      ],
      ias: [
        [0, 74],
        [10, 80],
        [22, 105],
        [30, 105],
      ],
      rpm: [
        [0, 2420],
        [18, 2530],
        [22, 2540],
        [25, 2300],
        [30, 2300],
      ],
    },
    telling: 14,
    marks: [
      {
        id: "lead",
        t: 6,
        label: L(
          "10 % of the climb rate before: 65 ft early",
          "10 % du vario avant : 65 ft plus tôt",
        ),
      },
      {
        id: "power",
        t: 23,
        label: L(
          "At cruise speed, power to 2 300 RPM",
          "À la vitesse de croisière, 2 300 tr/min",
        ),
      },
    ],
  },
  {
    // IFH 4 / PHAK 8: a standard-rate turn is 3°/s (360° in 2 minutes); the bank that gives it is about TAS/10 + 7
    // (≈ 17°); tan φ = ω·V / g gives 15.4° at 100 kt TAS and 16° at 105 kt: the slides say « about 15° » everywhere
    // (gallery recap, quiz, this preset). The bank is computed from the speed here.
    id: "turn-std",
    level: "ppl",
    name: L("Standard-rate turn", "Virage standard"),
    what: L(
      "The aircraft banks about 15°, the turn coordinator sits on the mark, the heading turns 3° a second.",
      "L’avion s’incline d’environ 15°, l’indicateur de virage est sur le repère, le cap tourne de 3° par seconde.",
    ),
    view: six,
    duration: 36,
    // ramps of 3 s (4.5° each) and 27 s at 3°/s: 90° in all
    tracks: {
      turn: [
        [0, 0],
        [3, 3],
        [30, 3],
        [33, 0],
        [36, 0],
      ],
      vs: [[0, 0]],
      rpm: [
        [0, 2300],
        [3, 2330],
        [30, 2330],
        [33, 2300],
      ],
    },
    telling: 16,
    marks: [
      {
        id: "rate",
        channel: "turn",
        value: 3,
        label: L("3° a second: 90° in 30 s", "3° par seconde : 90° en 30 s"),
      },
    ],
  },
  {
    // AFH 9 (steep turns, ACS 45° ± 5°) and PHAK 5 (load factor chart): at 45° the load factor is 1.41 and the stall
    // speed grows with its square root, 48 × √1.41 ≈ 57 KIAS (POH 5: VS1 48 KIAS). Power added to hold the speed.
    // 95 KIAS (VA at 2 550 lb is 105 KIAS, POH 2). A full 360°.
    id: "turn-45",
    level: "ppl",
    name: L(
      "Steep turn, 45° (load factor)",
      "Virage à 45° (facteur de charge)",
    ),
    what: L(
      "45° of bank: 1.41 g, back pressure and power; the stall speed climbs from 48 to 57 kt.",
      "45° d’inclinaison : 1,41 g, on tire et on remet de la puissance ; la vitesse de décrochage passe de 48 à 57 kt.",
    ),
    view: six,
    duration: 42,
    tracks: {
      bank: [
        [0, 0],
        [5, 45],
        [32.5, 45],
        [37.5, 0],
        [42, 0],
      ],
      ias: [[0, 95]],
      vs: [[0, 0]],
      rpm: [
        [0, 2300],
        [4, 2450],
        [34, 2450],
        [38.5, 2300],
      ],
    },
    telling: 18,
    marks: [
      {
        id: "bank45",
        channel: "bank",
        value: 45,
        label: L(
          "45°: 1.41 g, stall at 57 kt",
          "45° : 1,41 g, décrochage à 57 kt",
        ),
      },
    ],
  },
  {
    // ACS PA.VII (power-off stall) / AFH 5: power to idle, hold the altitude, the speed falls about 1 kt a second;
    // POH 2: the stall warning sounds 5 to 10 kt before the stall; POH 5: VS1 48 KIAS (flaps up, power off). The
    // recovery: lower the nose, full power, level at 65 kt. Idle in flight ≈ 1 100 RPM (windmilling).
    id: "stall",
    level: "ppl",
    name: L("Approaching the stall", "Approche du décrochage"),
    what: L(
      "Power off, the nose comes up to hold the height, the speed falls to 48 kt; then the recovery.",
      "Réduction, le nez monte pour tenir l’altitude, la vitesse tombe à 48 kt ; puis la sortie.",
    ),
    view: six,
    stall: true,
    duration: 50,
    tracks: {
      rpm: [
        [0, 2300],
        [2, 1100],
        [40, 1100],
        [41.5, 2450],
        [50, 2450],
      ],
      ias: [
        [0, 90],
        [2, 89],
        [38, 50],
        [40, 48],
        [44, 56],
        [48, 65],
        [50, 66],
      ],
      vs: [
        [0, 0],
        [37, 0],
        [40, -250],
        [42, -600],
        [47, 0],
        [50, 0],
      ],
    },
    telling: 33,
    marks: [
      {
        id: "warn",
        channel: "ias",
        value: 56,
        label: L(
          "Stall warning: 5 to 10 kt before",
          "Avertisseur : 5 à 10 kt avant",
        ),
      },
      {
        id: "stall",
        channel: "ias",
        value: 48.5,
        label: L(
          "Stall: 48 kt (POH, flaps up)",
          "Décrochage : 48 kt (POH, volets rentrés)",
        ),
      },
    ],
  },
  {
    // AFH 3 (descents): reduce the power, hold the speed with the attitude: about 1 900–2 000 RPM gives −500 ft/min at
    // 100 KIAS in the C172S (POH 5 cruise power table, 2 300 RPM for level at 100–105 KIAS).
    id: "descent-500",
    level: "ppl",
    name: L("Descent at 500 ft/min", "Descente à 500 ft/min"),
    what: L(
      "Power reduced, the speed held at 100 kt: the vertical speed settles at −500 ft/min.",
      "Puissance réduite, vitesse tenue à 100 kt : le variomètre se stabilise à −500 ft/min.",
    ),
    view: six,
    duration: 30,
    tracks: {
      rpm: [
        [0, 2300],
        [2, 2300],
        [4, 1950],
        [30, 1950],
      ],
      ias: [[0, 100]],
      vs: [
        [0, 0],
        [4, -80],
        [10, -500],
        [30, -500],
      ],
    },
    telling: 20,
    marks: [
      {
        id: "vs",
        channel: "vs",
        value: -490,
        label: L(
          "−500 ft/min: 1 000 ft in 2 minutes",
          "−500 ft/min : 1 000 ft en 2 minutes",
        ),
      },
    ],
  },
  {
    // PHAK 6 (power and attitude): in level flight more power first shows on the tachometer, then the speed builds
    // (seconds of lag), then the nose has to come down a little to stay level (less angle of attack at more speed).
    // 2 100 → 2 500 RPM, 90 → 108 KIAS (POH 5 cruise table, ~2 500 RPM for 110+ KIAS low down).
    id: "power",
    level: "ppl",
    name: L("Effect of power", "Effet de la puissance"),
    what: L(
      "The RPM first, then the speed, then the attitude: the nose lowers a little to stay level.",
      "D’abord les tours, puis la vitesse, puis l’assiette : le nez baisse un peu pour rester en palier.",
    ),
    view: six,
    duration: 24,
    tracks: {
      rpm: [
        [0, 2100],
        [2, 2100],
        [3.5, 2500],
        [24, 2500],
      ],
      ias: [
        [0, 90],
        [3.5, 90],
        [18, 108],
        [24, 109],
      ],
      vs: [[0, 0]],
    },
    telling: 14,
    marks: [
      { id: "rpm", t: 3.5, label: L("The RPM first", "D’abord les tours") },
      {
        id: "speed",
        channel: "ias",
        value: 100,
        label: L("Then the speed", "Puis la vitesse"),
      },
    ],
  },
  {
    // PHAK 8 (magnetic compass, turning errors): turning from north the compass lags, through south it leads; the
    // heading indicator shows the real heading. A standard-rate left turn from north to south (180° in 60 s).
    id: "compass",
    level: "ppl",
    name: L("Compass errors in a turn", "Erreurs du compas en virage"),
    what: L(
      "A standard-rate turn from north to south: compare the compass with the heading indicator.",
      "Un virage standard du nord au sud : comparez le compas et le conservateur de cap.",
    ),
    view: six,
    hdgRef: "abs",
    duration: 64,
    tracks: {
      hdg: [
        [0, 360],
        [2, 359],
        [62, 180],
        [64, 180],
      ],
      vs: [[0, 0]],
    },
    telling: 14,
    marks: [
      {
        id: "west",
        channel: "hdg",
        value: 270,
        label: L("West: the compass agrees", "Ouest : le compas est d’accord"),
      },
    ],
  },
  // ---------------------------------------------------------------- IFR
  {
    // IFH 9 (ILS): a 3° glide path needs about 5 × the ground speed in ft/min (90 kt → ≈ 480 ft/min). The aircraft
    // starts half a scale above the path and settles on it; the altitude is placed so that the receiver shows it.
    id: "ils-glide",
    level: "ifr",
    name: L("Descent on the 3° glide path", "Descente sur le glide 3°"),
    what: L(
      "Above the path, the diamond is low; a little more descent and it centres at about −480 ft/min.",
      "Au-dessus du plan, l’index est bas ; un peu plus de descente et il se centre vers −480 ft/min.",
    ),
    view: { kind: "gauge", gauge: "cdi" },
    needs: "gs",
    situation: "ils27",
    duration: 40,
    tracks: {
      gs: [
        [0, -0.3],
        [24, 0],
        [40, 0],
      ],
      cdi: [[0, 0]],
      ias: [[0, 90]],
      rpm: [[0, 1950]],
    },
    telling: 26,
    marks: [
      {
        id: "on",
        channel: "gs",
        value: -0.02,
        label: L(
          "On the path: 5 × the ground speed",
          "Sur le plan : 5 × la vitesse sol",
        ),
      },
    ],
  },
  {
    // IFH 9 / AFH: a 30° intercept; the localizer is 4 times as sensitive as a VOR (about ±2.5° full scale): start
    // the turn when the bar starts to move. The aircraft is placed where the receiver shows the deviation asked.
    id: "loc-capture",
    level: "ifr",
    name: L("Capturing the localizer", "Capture du localizer"),
    what: L(
      "Heading 30° off the course, the bar leaves the side; turn when it moves and it centres.",
      "Cap à 30° de l’axe, la barre quitte le bord ; on tourne quand elle bouge et elle se centre.",
    ),
    view: { kind: "gauge", gauge: "hsi" },
    needs: "loc",
    situation: "ils27",
    hdgRef: "course",
    duration: 34,
    tracks: {
      cdi: [
        [0, 1],
        [6, 1],
        [14, 0.55],
        [22, 0.08],
        [28, 0],
        [34, 0],
      ],
      hdg: [
        [0, 30],
        [12, 30],
        [22, 6],
        [28, 0],
        [34, 0],
      ],
      alt: [[0, 0]],
      vs: [[0, 0]],
      ias: [[0, 90]],
    },
    telling: 16,
    marks: [
      {
        id: "move",
        channel: "cdi",
        value: 0.6,
        label: L(
          "The bar moves: start the turn",
          "La barre bouge : on commence le virage",
        ),
      },
    ],
  },
  {
    // IFH 9 (VOR station passage): inbound the flag shows TO, over the station (the cone of confusion) it shows OFF,
    // then FROM; the DME counts down then up. 100 KIAS, from 0.9 NM. Real time (no compression).
    id: "vor-cross",
    level: "ifr",
    name: L("Over a VOR (TO / FROM)", "Croisement d’un VOR (TO / FROM)"),
    what: L(
      "Inbound TO, over the station the flag goes, then FROM: the DME counts down then up.",
      "En rapprochement TO, à la verticale le drapeau disparaît, puis FROM : la DME diminue puis augmente.",
    ),
    view: { kind: "gauge", gauge: "cdi" },
    needs: "vor",
    situation: "vor-inbound",
    hdgRef: "course",
    startDme: 0.9,
    duration: 60,
    tracks: { hdg: [[0, 0]], vs: [[0, 0]], ias: [[0, 100]] },
    telling: 52,
    marks: [
      {
        id: "to",
        t: 4,
        label: L("TO: the station is ahead", "TO : la station est devant"),
      },
      {
        id: "over",
        t: 27,
        label: L(
          "Overhead: the flag goes",
          "À la verticale : le drapeau disparaît",
        ),
      },
      {
        id: "from",
        t: 50,
        label: L(
          "FROM: the station is behind",
          "FROM : la station est derrière",
        ),
      },
    ],
  },
  {
    // IFH 5 (timed turns, partial panel): at standard rate (3°/s) a 45° heading change takes 15 s; the clock and the
    // turn coordinator are enough. Ramps of 1.5 s (2.25° each) and 13.5 s at 3°/s: the clock starts as the roll-in
    // begins (t = 0) and the roll-out begins at 15 s, so the two marks are exactly 15 s apart and the turn is 45°.
    id: "timed-turn",
    level: "ifr",
    name: L("Timed turn", "Virage chronométré"),
    what: L(
      "Start the clock as you roll in: 15 s at standard rate for 45°, then roll out.",
      "Top chrono à la mise en virage : 15 s au taux standard pour 45°, puis on remet à plat.",
    ),
    view: six,
    duration: 22,
    tracks: {
      turn: [
        [0, 0],
        [1.5, 3],
        [15, 3],
        [16.5, 0],
        [22, 0],
      ],
      vs: [[0, 0]],
    },
    telling: 8,
    marks: [
      {
        id: "start",
        t: 0,
        label: L("Clock: 3° a second", "Top chrono : 3° par seconde"),
      },
      {
        id: "stop",
        t: 15,
        label: L("15 s: 45°, roll out", "15 s : 45°, on remet à plat"),
      },
    ],
  },
  {
    // IFH 5 (vacuum failure): the suction falls to zero at once, then the gyros slow over minutes and the attitude
    // and heading indicators drift and topple while the electric turn coordinator, the airspeed, the altimeter and
    // the compass stay right. Minutes compressed into 40 s. The aircraft itself stays level.
    id: "vacuum",
    level: "ifr",
    name: L(
      "Vacuum failure (the horizon tips slowly)",
      "Panne de dépression (l’horizon bascule lentement)",
    ),
    what: L(
      "The aircraft stays level, yet the attitude indicator slowly tips and the heading indicator wanders.",
      "L’avion reste à plat, pourtant l’horizon bascule lentement et le conservateur de cap dérive.",
    ),
    view: six,
    needs: "steam",
    duration: 44,
    tracks: {
      vacuum: [
        [0, 0],
        [4, 0],
        [44, 1],
      ],
      vs: [[0, 0]],
    },
    telling: 34,
    marks: [
      {
        id: "tip",
        t: 24,
        label: L(
          "The horizon tips: the turn coordinator says level",
          "L’horizon penche : l’indicateur de virage dit à plat",
        ),
      },
    ],
  },
  {
    // IFH 9 (ADF): magnetic bearing to the station = heading + relative bearing. Abeam the NDB (relative 090), a
    // standard-rate right turn of 90° brings the needle to the nose.
    id: "adf",
    level: "ifr",
    name: L("ADF bearing", "Relèvement ADF"),
    what: L(
      "The beacon on the right wing: turn right 90° and the needle comes round to the nose.",
      "La balise sur l’aile droite : virage à droite de 90° et l’aiguille revient sur le nez.",
    ),
    view: { kind: "gauge", gauge: "rmi" },
    needs: "adf",
    situation: "ndb-abeam",
    duration: 44,
    tracks: {
      turn: [
        [0, 0],
        [3, 3],
        [35, 3],
        [38, 0],
        [44, 0],
      ],
      vs: [[0, 0]],
    },
    telling: 16,
    marks: [
      {
        id: "abeam",
        t: 1,
        label: L(
          "Relative 090: on the right wing",
          "Gisement 090 : sur l’aile droite",
        ),
      },
      {
        id: "nose",
        t: 39,
        label: L("On the nose: relative 000", "Sur le nez : gisement 000"),
      },
    ],
  },
];

export const motionPreset = (
  id: string | undefined,
): MotionPreset | undefined =>
  id ? MOTION_PRESETS.find((p) => p.id === id) : undefined;

/** The script an instrument's animation plays (its preset, or its own), or null. */
export function motionScript(
  m: InstrumentMotion | undefined,
): MotionScript | null {
  if (!m) return null;
  return motionPreset(m.preset) ?? m.script ?? null;
}

// ------------------------------------------------------------------ interpolation
/** Monotone cubic interpolation (Fritsch–Carlson) of sorted keys: passes through every key, never overshoots. */
export class Curve {
  private t: number[];
  private v: number[];
  private m: number[];
  constructor(keys: readonly (readonly [number, number])[]) {
    const ks = [...keys].sort((a, b) => a[0] - b[0]);
    this.t = ks.map((k) => k[0]);
    this.v = ks.map((k) => k[1]);
    const n = ks.length;
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const h = this.t[i + 1] - this.t[i];
      d.push(h > 0 ? (this.v[i + 1] - this.v[i]) / h : 0);
    }
    const m = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++)
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    // the ends start and stop gently (zero slope): a manoeuvre eases in and out
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        m[i] = k * a * d[i];
        m[i + 1] = k * b * d[i];
      }
    }
    this.m = m;
  }
  at(x: number): number {
    const { t, v, m } = this;
    const n = t.length;
    if (n === 0) return 0;
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (i < n - 2 && x > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    if (h <= 0) return v[i + 1];
    const s = (x - t[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * v[i] +
      (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * v[i + 1] +
      (s3 - s2) * h * m[i + 1]
    );
  }
}

// ------------------------------------------------------------------ the timeline
/** One complete flight state of the animation. */
export interface MotionFrame {
  t: number;
  /** KIAS */
  ias: number;
  /** indicated altitude, ft */
  alt: number;
  vs: number;
  /** true heading as the Sim holds it, ° */
  hdg: number;
  pitch: number;
  bank: number;
  /** rate of turn, °/s */
  turn: number;
  rpm: number;
  /** load factor */
  g: number;
  lat: number;
  lon: number;
  /** vacuum failure 0..1 (NaN: the channel is not used) */
  vac: number;
}

export interface MotionTimeline {
  script: MotionScript;
  duration: number;
  /** sample step, s */
  h: number;
  frames: MotionFrame[];
  telling: number;
  /** resolved marks (time of each) */
  marks: { id: string; t: number; label: L10n }[];
  /** the start (throttle and RPM, to keep the throttle with the RPM for the hand-over) */
  base: { throttle: number; rpm: number };
  usesVacuum: boolean;
}

interface NavGeom {
  station: LatLon & { elevFt: number };
  course: number;
  /** the radial the aircraft is on is course + 180 + off ("to"/"loc") or course − off ("from") */
  side: "to" | "from" | "loc";
  /** full-scale deflection in degrees */
  fullDeg: number;
  gs?: { pos: LatLon; angle: number };
}

/** The receiver the CDI shows (NAV1 or NAV2 as selected), as geometry. */
function navGeom(sim: Sim): NavGeom | null {
  const src = sim.av.cdi === "NAV2" ? "nav2" : "nav1";
  if (sim.av.cdi === "GPS") return null;
  const out = sim[src];
  if (!out.valid) return null;
  const n = tunedNavaid(sim.av[src].active);
  if (!n) return null;
  const obs = src === "nav2" ? sim.av.obs2 : sim.av.obs1;
  const station = { lat: n.lat, lon: n.lon, elevFt: n.elevFt };
  if (out.isLoc) {
    // radios.ts: ±2.5° full scale on the localizer, 0.7° on the glide path
    return {
      station,
      course: n.course ?? obs,
      side: "loc",
      fullDeg: 2.5,
      ...(n.gsPos && n.gsAngle
        ? { gs: { pos: n.gsPos, angle: n.gsAngle } }
        : {}),
    };
  }
  // radios.ts: ±10° full scale on a VOR
  return {
    station,
    course: obs,
    side: out.toFrom === "FROM" ? "from" : "to",
    fullDeg: 10,
  };
}

/** The angle of attack (°) the wing needs at this true airspeed, load factor and flap (AIRFRAME lift curve). */
function aoaFor(
  tasMs: number,
  altTrueFt: number,
  n: number,
  flap: number,
  oat: number,
): number {
  const rho = density(altTrueFt, oat);
  const q = 0.5 * rho * tasMs * tasMs;
  const cl = (n * AIRFRAME.massKg * G) / Math.max(1, q * AIRFRAME.wingArea);
  const a = (cl - AIRFRAME.cl0 - AIRFRAME.flapCl * flap) / AIRFRAME.cla;
  return clamp(
    a / DEG,
    -4,
    (AIRFRAME.alphaStall - AIRFRAME.flapAlphaStall * flap) / DEG + 1,
  );
}

const H = 1 / 30;

/**
 * Bake a script from the Sim's state (a situation just applied): the coupled flight states every 1/30 s. Pure in
 * the Sim (it reads it, never writes it).
 */
export function bakeMotion(script: MotionScript, sim: Sim): MotionTimeline {
  const s = sim.ac.s;
  const d = sim.ac.data;
  const w = sim.weather;
  const baroCorr = (sim.av.baro - w.qnh) * 1000;
  const curve: Partial<Record<MotionChannel, Curve>> = {};
  for (const ch of MOTION_CHANNELS) {
    const k = script.tracks[ch];
    if (k?.length) curve[ch] = new Curve(k);
  }
  const val = (ch: MotionChannel, t: number): number | undefined =>
    curve[ch]?.at(t);
  const nav = navGeom(sim);
  const start = {
    ias: d.iasKt,
    alt: s.altFt + baroCorr,
    vs: d.vsFpm,
    hdg: norm360(s.psi / DEG),
    pitch: s.theta / DEG,
    bank: s.phi / DEG,
    rpm: s.rpm,
    flap: s.flapPos,
  };
  let pos: LatLon = { lat: s.lat, lon: s.lon };
  if (nav && script.startDme !== undefined) {
    const radial = bearingDeg(nav.station, pos);
    pos = destination(nav.station, radial, Math.max(0.05, script.startDme));
  }
  const hdgBase =
    script.hdgRef === "abs"
      ? 0
      : script.hdgRef === "course" && nav
        ? nav.course
        : start.hdg;
  const duration = clamp(script.duration, 1, 180);
  const n = Math.round(duration / H);
  const frames: MotionFrame[] = [];
  let alt = start.alt;
  let hdg = start.hdg;
  let bank = val("bank", 0) ?? start.bank;
  const altFromGeometry = !!(curve.gs && nav?.gs) || !!curve.alt;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(duration, i * H);
    const ias = clamp(val("ias", t) ?? start.ias, 0, 200);
    const rpm = clamp(val("rpm", t) ?? start.rpm, 0, 2800);
    const tas = Math.max(
      15,
      tasForIas(Math.max(20, ias), alt - baroCorr, w, bank),
    );
    // the bank: from the rate of turn and the speed (tan φ = ω V / g), else its own keys, else the start's
    const rate = val("turn", t);
    if (rate !== undefined)
      bank =
        Math.sign(rate) * (Math.atan((Math.abs(rate) * DEG * tas) / G) / DEG);
    else bank = val("bank", t) ?? start.bank;
    const turn = (G * Math.tan(bank * DEG)) / tas / DEG;
    // the heading: its keys, else the turn integrated
    const hk = val("hdg", t);
    if (hk !== undefined) hdg = norm360(hdgBase + hk);
    else if (i > 0) hdg = norm360(hdg + turn * H);
    // the position: dead reckoning along the heading (still air), then where the receiver shows the deviation
    if (i > 0) pos = destination(pos, hdg, ((tas / KT) * H) / 3600);
    const cdi = val("cdi", t);
    if (nav && cdi !== undefined) {
      const dist = distanceNm(nav.station, pos);
      const off = clamp(cdi, -1.2, 1.2) * nav.fullDeg;
      const radial =
        nav.side === "from" ? nav.course - off : nav.course + 180 + off;
      pos = destination(nav.station, norm360(radial), dist);
    }
    // the height: on the glide path where the receiver shows the deviation, else the altitude keys, else the
    // vertical speed integrated
    const gs = val("gs", t);
    let vs = 0;
    if (nav?.gs && gs !== undefined) {
      const dg = distanceNm(nav.gs.pos, pos) * FT_PER_NM;
      const angle = nav.gs.angle - clamp(gs, -1.2, 1.2) * 0.7;
      alt = nav.station.elevFt + Math.tan(angle * DEG) * dg + baroCorr;
    } else if (curve.alt) alt = start.alt + (val("alt", t) ?? 0);
    else {
      vs = val("vs", t) ?? start.vs;
      if (i > 0) alt += (vs * H) / 60;
    }
    const vac = curve.vacuum ? clamp(val("vacuum", t) ?? 0, 0, 1) : NaN;
    const g = 1 / Math.max(0.2, Math.cos(bank * DEG));
    frames.push({
      t,
      ias,
      alt,
      vs,
      hdg,
      pitch: 0,
      bank,
      turn,
      rpm,
      g,
      lat: pos.lat,
      lon: pos.lon,
      vac,
    });
  }
  // the vertical speed of a height placed by geometry or keys: its derivative (central, then a light smoothing)
  if (altFromGeometry) {
    const raw = frames.map((_, i) => {
      const a = frames[Math.max(0, i - 1)];
      const b = frames[Math.min(frames.length - 1, i + 1)];
      return b.t > a.t ? ((b.alt - a.alt) / (b.t - a.t)) * 60 : 0;
    });
    const k = 6;
    frames.forEach((f, i) => {
      let sum = 0;
      let c = 0;
      for (
        let j = Math.max(0, i - k);
        j <= Math.min(frames.length - 1, i + k);
        j++
      ) {
        sum += raw[j];
        c++;
      }
      f.vs = sum / c;
    });
  }
  // the pitch: its keys, else the flight path plus the angle of attack the wing needs (fuselage reference)
  for (const f of frames) {
    const pk = val("pitch", f.t);
    if (pk !== undefined) {
      f.pitch = pk;
      continue;
    }
    const tas = tasForIas(Math.max(20, f.ias), f.alt - baroCorr, w, f.bank);
    const gamma = Math.asin(clamp((f.vs * FT) / 60 / tas, -0.5, 0.5)) / DEG;
    f.pitch = clamp(
      gamma + aoaFor(tas, f.alt - baroCorr, f.g, start.flap, w.oatSeaLevelC),
      -20,
      25,
    );
  }
  const marks = (script.marks ?? []).map((m) => ({
    id: m.id,
    t: markTime(m, frames, val),
    label: m.label,
  }));
  return {
    script,
    duration,
    h: H,
    frames,
    telling: clamp(script.telling ?? duration / 2, 0, duration),
    marks,
    base: { throttle: sim.controls.throttle, rpm: Math.max(500, start.rpm) },
    usesVacuum: !!curve.vacuum,
  };
}

/** When a mark happens: its time, or the first frame where its channel reaches its value. */
function markTime(
  m: MotionMark,
  frames: MotionFrame[],
  val: (ch: MotionChannel, t: number) => number | undefined,
): number {
  if (m.t !== undefined) return m.t;
  if (!m.channel || m.value === undefined || !frames.length) return 0;
  const pick = (f: MotionFrame): number => {
    switch (m.channel) {
      case "ias":
        return f.ias;
      case "alt":
        return f.alt - frames[0].alt;
      case "vs":
        return f.vs;
      case "hdg":
        return f.hdg;
      case "pitch":
        return f.pitch;
      case "bank":
        return f.bank;
      case "turn":
        return f.turn;
      case "rpm":
        return f.rpm;
      case "vacuum":
        return f.vac;
      default:
        // cdi / gs: the deviation is the key itself (the aircraft is placed where the receiver shows it)
        return val(m.channel!, f.t) ?? NaN;
    }
  };
  const v0 = pick(frames[0]);
  if (!Number.isFinite(v0)) return 0;
  const up = m.value >= v0;
  for (const f of frames) {
    const v = pick(f);
    if (m.channel === "hdg") {
      if (Math.abs(wrap180(v - m.value)) < 1) return f.t;
    } else if (up ? v >= m.value : v <= m.value) return f.t;
  }
  return frames[frames.length - 1].t;
}

/** The frame at time t (linear between the 1/30 s samples, the heading the short way round). */
export function frameAt(tl: MotionTimeline, t: number): MotionFrame {
  const fr = tl.frames;
  const x = clamp(t, 0, tl.duration) / tl.h;
  const i = Math.min(fr.length - 1, Math.floor(x));
  const j = Math.min(fr.length - 1, i + 1);
  const a = fr[i];
  const b = fr[j];
  const k = x - i;
  if (i === j || k <= 0) return a;
  const mix = (p: number, q: number) => p + (q - p) * k;
  return {
    t: mix(a.t, b.t),
    ias: mix(a.ias, b.ias),
    alt: mix(a.alt, b.alt),
    vs: mix(a.vs, b.vs),
    hdg: norm360(a.hdg + wrap180(b.hdg - a.hdg) * k),
    pitch: mix(a.pitch, b.pitch),
    bank: mix(a.bank, b.bank),
    turn: mix(a.turn, b.turn),
    rpm: mix(a.rpm, b.rpm),
    g: mix(a.g, b.g),
    lat: mix(a.lat, b.lat),
    lon: mix(a.lon, b.lon),
    vac: mix(a.vac, b.vac),
  };
}

interface SystemsInternals {
  vac: number;
  gyroHealth: number;
  topple: number;
  gErr: { pitch: number; roll: number; hdg: number };
  gDir: { pitch: number; roll: number; hdg: number };
}

/**
 * Write a frame into the Sim: the aircraft's state, then everything derived from it (indicated air data, turn
 * rate, load factor, the systems, the receivers), exactly as a situation is applied (scene.ts rederive). The
 * renderers then draw what the aircraft would show.
 */
export function applyFrame(sim: Sim, tl: MotionTimeline, f: MotionFrame): void {
  const s = sim.ac.s;
  const w = sim.weather;
  s.altFt = f.alt - (sim.av.baro - w.qnh) * 1000;
  s.lat = f.lat;
  s.lon = f.lon;
  s.psi = f.hdg * DEG;
  s.phi = f.bank * DEG;
  s.theta = f.pitch * DEG;
  s.tas = tasForIas(Math.max(20, f.ias), s.altFt, w, f.bank);
  s.gamma = Math.asin(clamp((f.vs * FT) / 60 / s.tas, -0.5, 0.5));
  s.q = 0;
  s.p = 0;
  s.beta = 0;
  s.rpm = f.rpm;
  // a fixed-pitch propeller absorbs about the cube of its RPM: the throttle follows (the hand-over keeps the power)
  sim.controls.throttle = clamp(
    tl.base.throttle * Math.pow(f.rpm / tl.base.rpm, 3),
    0,
    1,
  );
  if (tl.usesVacuum && Number.isFinite(f.vac)) setVacuum(sim, f.vac);
  rederive(sim);
  sim.updateAvionics(0);
}

/**
 * The vacuum failure at a stage of its course (0..1): the suction falls in the first fifth (the pump is gone), the
 * gyros run down after (systems.ts: the attitude indicator topples and the heading indicator wanders).
 */
function setVacuum(sim: Sim, v: number) {
  if (v > 0 && !sim.failures.vacuum) sim.setFailure("vacuum", true);
  if (v <= 0 && sim.failures.vacuum) sim.setFailure("vacuum", false);
  const sy = sim.systems as unknown as SystemsInternals;
  sy.vac = 5 * clamp(1 - v * 5, 0, 1);
  sy.gyroHealth = clamp(1 - v, 0, 1);
  const k = clamp((v - 0.2) / 0.8, 0, 1);
  sy.topple = k * k * (3 - 2 * k);
  sy.gErr.roll = 0;
  sy.gErr.pitch = 0;
  sy.gErr.hdg = sy.gDir.hdg * 40 * k;
}

/** Does the situation give the signal the animation needs? */
export function motionFits(
  p: MotionPreset | null | undefined,
  sim: Sim,
  cockpit?: string,
): boolean {
  if (!p?.needs) return true;
  const nav = sim.av.cdi === "NAV2" ? sim.nav2 : sim.nav1;
  switch (p.needs) {
    case "gs":
      return nav.valid && nav.isLoc && nav.gsValid;
    case "loc":
      return nav.valid && nav.isLoc;
    case "vor":
      return nav.valid && !nav.isLoc;
    case "adf":
      return sim.adf.valid;
    case "steam":
      return cockpit === undefined || cockpit === "steam";
  }
}

// ------------------------------------------------------------------ playing
export type MotionState = "armed" | "playing" | "paused" | "ended" | "handed";

/** True when the viewer asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/**
 * The clock of one animation on one situation (shared by every instrument showing it). It never steps the flight
 * model: it writes frames. Once handed over (« Prendre les commandes »), it stops for good and the situation flies
 * from the frame it was showing.
 */
export class MotionRun {
  state: MotionState = "armed";
  t = 0;
  speed: number;
  loop: boolean;
  /** the editor and thumbnails rest on the telling frame */
  rest: "start" | "telling";
  private listeners = new Set<(r: MotionRun) => void>();
  constructor(
    public tl: MotionTimeline,
    o: {
      speed?: number;
      loop?: boolean;
      rest?: "start" | "telling";
      reduced?: boolean;
    },
  ) {
    this.speed = clamp(o.speed ?? 1, 0.25, 4);
    this.loop = !!o.loop;
    this.rest = o.rest ?? "start";
    // reduced motion: the telling picture, played only on « Rejouer »
    if (o.reduced) {
      this.rest = "telling";
      this.state = "ended";
    }
    this.t = this.rest === "telling" ? tl.telling : 0;
  }
  on(f: (r: MotionRun) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit() {
    for (const f of this.listeners) f(this);
  }
  get frame(): MotionFrame {
    return frameAt(this.tl, this.t);
  }
  /** shown on screen for the first time (the slide, or its reveal step): an armed animation starts */
  start() {
    if (this.state !== "armed") return;
    this.t = 0;
    this.state = "playing";
    this.emit();
  }
  /** advance; returns true when the frame changed */
  tick(dt: number): boolean {
    if (this.state !== "playing") return false;
    this.t += dt * this.speed;
    if (this.t >= this.tl.duration) {
      if (this.loop) this.t %= this.tl.duration;
      else {
        this.t = this.rest === "telling" ? this.tl.telling : this.tl.duration;
        this.state = "ended";
        this.emit();
      }
    }
    return true;
  }
  replay() {
    if (this.state === "handed") return;
    this.t = 0;
    this.state = "playing";
    this.emit();
  }
  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.emit();
  }
  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.emit();
  }
  /** the student took the controls: the animation stops here for good */
  handOver() {
    if (this.state === "handed") return;
    this.state = "handed";
    this.emit();
  }
  /** back to the start (« Réinitialiser »): armed again */
  reset(tl?: MotionTimeline) {
    if (tl) this.tl = tl;
    this.state = this.rest === "telling" ? "ended" : "armed";
    this.t = this.rest === "telling" ? this.tl.telling : 0;
    this.emit();
  }
  /** a callout tied to this mark is shown now */
  markShown(id: string): boolean {
    const m = this.tl.marks.find((x) => x.id === id);
    if (!m) return true;
    if (this.state === "handed") return true;
    return this.t + 1e-6 >= m.t;
  }
}

// ------------------------------------------------------------------ the editor's « Rejouer »
const replayers = new Map<string, Set<() => void>>();
/** An instrument with an animation is on screen (blocks.ts): « Rejouer » in the inspector reaches it. */
export function registerReplay(blockId: string, f: () => void): () => void {
  let set = replayers.get(blockId);
  if (!set) replayers.set(blockId, (set = new Set()));
  set.add(f);
  return () => {
    set!.delete(f);
    if (!set!.size) replayers.delete(blockId);
  };
}
/** Play the animation of an element again wherever it is drawn (the editor's canvas). */
export function replayMotion(blockId: string): boolean {
  const set = replayers.get(blockId);
  if (!set?.size) return false;
  for (const f of set) f();
  return true;
}

// ------------------------------------------------------------------ validation (validate.ts)
/** What is wrong with an instrument's animation (empty: nothing). Pure. */
export function motionIssues(m: unknown): L10n[] {
  const out: L10n[] = [];
  if (typeof m !== "object" || m === null || Array.isArray(m))
    return [L("An animation is an object", "Une animation est un objet")];
  const o = m as InstrumentMotion;
  if (
    o.preset !== undefined &&
    (typeof o.preset !== "string" || !motionPreset(o.preset))
  )
    out.push(
      L(
        `Unknown animation '${String(o.preset)}'`,
        `Animation inconnue « ${String(o.preset)} »`,
      ),
    );
  if (o.preset === undefined && o.script === undefined)
    out.push(
      L(
        "An animation names a preset or has its own keys",
        "Une animation nomme un modèle ou a ses propres repères",
      ),
    );
  if (
    o.speed !== undefined &&
    !(typeof o.speed === "number" && o.speed >= 0.25 && o.speed <= 4)
  )
    out.push(
      L(
        "The speed of an animation is between 0.25 and 4",
        "La vitesse d’une animation est entre 0,25 et 4",
      ),
    );
  if (o.loop !== undefined && typeof o.loop !== "boolean")
    out.push(L("“Loop” is yes or no", "« Boucle » est oui ou non"));
  if (o.script !== undefined) out.push(...scriptIssues(o.script));
  return out;
}
function scriptIssues(s: unknown): L10n[] {
  const out: L10n[] = [];
  if (typeof s !== "object" || s === null)
    return [
      L(
        "The animation's keys are missing",
        "Les repères de l’animation manquent",
      ),
    ];
  const sc = s as MotionScript;
  if (
    !(typeof sc.duration === "number" && sc.duration >= 1 && sc.duration <= 180)
  )
    out.push(
      L("An animation lasts 1 to 180 s", "Une animation dure de 1 à 180 s"),
    );
  if (typeof sc.tracks !== "object" || sc.tracks === null) {
    out.push(L("The animation has no keys", "L’animation n’a pas de repères"));
    return out;
  }
  for (const [ch, keys] of Object.entries(sc.tracks)) {
    if (!MOTION_CHANNELS.includes(ch as MotionChannel)) {
      out.push(L(`Unknown channel '${ch}'`, `Grandeur inconnue « ${ch} »`));
      continue;
    }
    const ok =
      Array.isArray(keys) &&
      keys.length > 0 &&
      keys.every(
        (k, i) =>
          Array.isArray(k) &&
          k.length === 2 &&
          Number.isFinite(k[0]) &&
          Number.isFinite(k[1]) &&
          (i === 0 || k[0] >= keys[i - 1][0]),
      );
    if (!ok)
      out.push(
        L(
          `The keys of '${ch}' are [time, value] pairs in order`,
          `Les repères de « ${ch} » sont des paires [temps, valeur] dans l’ordre`,
        ),
      );
  }
  if (
    sc.hdgRef !== undefined &&
    !["start", "course", "abs"].includes(sc.hdgRef)
  )
    out.push(
      L(
        "The heading is measured from 'start', 'course' or 'abs'",
        "Le cap se mesure depuis « start », « course » ou « abs »",
      ),
    );
  for (const mk of sc.marks ?? [])
    if (!mk || typeof mk.id !== "string" || !mk.label)
      out.push(
        L(
          "A moment has an id and a label",
          "Un moment a un identifiant et un libellé",
        ),
      );
  return out;
}

/** The marks an author can tie a callout to (preset or own script). */
export function motionMarks(m: InstrumentMotion | undefined): MotionMark[] {
  return motionScript(m)?.marks ?? [];
}

/** A short key of the animation: instruments with the same one share a Sim. */
export function motionKey(m: InstrumentMotion | undefined): string {
  if (!m) return "";
  return m.preset ? `p:${m.preset}` : `s:${JSON.stringify(m.script ?? null)}`;
}
