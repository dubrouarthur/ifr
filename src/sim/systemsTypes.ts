// CONTRACT (shared by the systems, cockpit, procedures and runner packages): aircraft systems of the C172S-class
// trainer — what the pilot can switch, what the systems read, which failures exist. Implementation lives in
// src/sim/systems.ts (SystemsModel), owned by the systems-core package. Keep this file stable: other packages
// code against it.

/** Every failure the simulator can inject (instructor, scenario, remote companion, random). The first seven are
 *  the historical avionics failures; the rest are aircraft-system failures for emergency-procedure training. */
export type FailureKey =
  // avionics (historical)
  | "gs"
  | "nav1"
  | "gps"
  | "ap"
  | "ahrs"
  | "airData"
  | "engine"
  // electrical
  | "alternator" // no charging: LOW VOLTS, battery discharges (≈ 30 min with load shedding)
  | "battery" // battery dead / contactor open
  | "electricalFire" // smoke + rising amps until the master is OFF (and the faulty bus isolated)
  // vacuum & air data
  | "vacuum" // LOW VACUUM: steam attitude + heading indicators drift and topple
  | "pitotBlocked" // ram + drain blocked: ASI behaves like an altimeter
  | "pitotIcing" // ASI slowly reads to zero unless PITOT HEAT is ON (cured by heat)
  | "staticBlocked" // altimeter frozen, VSI zero, ASI wrong; cured by ALT STATIC ON (small error)
  // engine & fuel
  | "engineRough" // one bad magneto: rough running, partial power; cured by selecting the good magneto
  | "enginePartial" // partial power loss (≈ 60 %) whatever the pilot does
  | "fuelPump" // engine-driven fuel pump fails: engine quits unless the AUX FUEL PUMP is ON
  | "fuelLeak" // left tank leaks (≈ 0.25 gal/min): LOW FUEL L, imbalance
  | "oilPressure" // oil pressure falls; the engine seizes about 10 min later
  | "engineFire" // fire in flight: goes out only with mixture cut-off, fuel selector OFF, aux pump OFF
  // other
  | "flaps" // flaps stuck at their current position
  | "trimRunaway" // electric trim runs nose-down until the trim/AP circuit breaker is pulled (switches.trimCb)
  | "comms" // radio failure (no transmit / receive): lost-communication procedure
  | "xpdr" // transponder inoperative
  | "door"; // door opens in flight: noise + slight drag, no other effect

export type Magnetos = "OFF" | "R" | "L" | "BOTH" | "START";
export type FuelSelector = "LEFT" | "BOTH" | "RIGHT" | "OFF";

/** What the pilot can operate. Defaults: everything normal for flight (both masters, avionics ON, BOTH, rich). */
export interface Switches {
  batMaster: boolean;
  altMaster: boolean;
  avionics: boolean;
  /** auxiliary (electric) fuel pump */
  auxPump: boolean;
  magnetos: Magnetos;
  /** 1 = full rich, 0 = idle cut-off */
  mixture: number;
  fuelSelector: FuelSelector;
  /** fuel shutoff valve (C172S): true = ON (pushed in) */
  fuelShutoff: boolean;
  pitotHeat: boolean;
  /** alternate static source valve open */
  altStatic: boolean;
  /** electric trim / autopilot circuit breaker pushed in (pull = false) */
  trimCb: boolean;
  /** cabin heat / air (closed in an engine fire) */
  cabinHeat: boolean;
  landingLight: boolean;
  beacon: boolean;
}

export const defaultSwitches = (): Switches => ({
  batMaster: true,
  altMaster: true,
  avionics: true,
  auxPump: false,
  magnetos: "BOTH",
  mixture: 1,
  fuelSelector: "BOTH",
  fuelShutoff: true,
  pitotHeat: false,
  altStatic: false,
  trimCb: true,
  cabinHeat: false,
  landingLight: false,
  beacon: true,
});

export type Annunciator =
  | "LOW VOLTS"
  | "LOW VACUUM"
  | "OIL PRESSURE"
  | "LOW FUEL L"
  | "LOW FUEL R"
  | "PITOT HEAT OFF"
  | "FUEL PRESS"
  | "SMOKE"
  | "FIRE"
  | "DOOR";

/** What the systems read (gauges, annunciators) and what the displays may rely on. */
export interface SystemsReadout {
  busVolts: number; // 28 V system: ≈ 28.0 charging, ≈ 24 on battery, < 20 dead
  /** battery ammeter: + charging, − discharging (A) */
  battAmps: number;
  /** remaining battery charge 0..1 */
  battCharge: number;
  /** essential bus powered (PFD / MFD / radios / GPS / AP / electric trim) */
  powered: boolean;
  /** the avionics bus (MFD, COM2, NAV2, GPS, AP) is powered */
  avionicsPowered: boolean;
  vacuumInHg: number; // normal 4.5–5.5
  oilPressPsi: number;
  oilTempF: number;
  fuelGalL: number;
  fuelGalR: number;
  fuelFlowGph: number;
  engineRunning: boolean;
  /** power available as a fraction of normal (rough engine, partial power) */
  powerFactor: number;
  fire: boolean;
  smoke: boolean;
  /** steam attitude / heading indicator health 0..1 (vacuum): below ≈ 0.6 they drift, at 0 they topple */
  gyroHealth: number;
  /** indicated values after pitot-static faults (displays read these, physics never does) */
  indicated: { iasKt: number; altFt: number; vsFpm: number };
  comOk: boolean;
  xpdrOk: boolean;
  flapsStuck: boolean;
  annunciators: Annunciator[];
  // ---- additive (systems-core): always filled by SystemsModel — read them through `SystemsState` (all required)
  /** steam attitude indicator and directional gyro (vacuum) as the pilot sees them: true attitude while the
   *  vacuum is good, slow drift then a toppled gyro after a vacuum failure. G1000 AHRS is electrical: unaffected. */
  gyro?: { pitchDeg: number; rollDeg: number; hdgDeg: number };
  /** engine vibration / roughness 0..1 (rough magneto, lean misfire, engine about to seize) */
  vibration?: number;
  /** alternator output (A) and total electrical load (A) */
  altAmps?: number;
  loadAmps?: number;
  /** which consumers have power — the cockpit draws dead screens / flags from these */
  elec?: ElecFlags;
  /** fuel pressure available at the engine (engine-driven pump turning, or aux pump ON) */
  fuelPressOk?: boolean;
  egtF?: number;
  chtF?: number;
  /** what is burning (null = no fire) */
  fireKind?: "engine" | "electrical" | null;
  /** cabin smoke density 0..1 (smoke = smokeLevel > 0.2) */
  smokeLevel?: number;
  /** pitot ice accretion 0..1 */
  pitotIce?: number;
  /** visible moisture at a freezing OAT, or pitot icing injected: PITOT HEAT should be ON */
  icingConditions?: boolean;
  engineSeized?: boolean;
  /** starter engaged (magnetos START, battery power, RPM < 300) */
  starterEngaged?: boolean;
  /** electric trim currently running away */
  trimRunning?: boolean;
  doorOpen?: boolean;
  /** magneto of the engineRough failure (null when none) */
  badMag?: "L" | "R" | null;
}

/** consumers powered by the electrical system (true = working) */
export interface ElecFlags {
  /** PFD (essential bus) */
  pfd: boolean;
  /** MFD (avionics bus) */
  mfd: boolean;
  com1: boolean;
  com2: boolean;
  nav1: boolean;
  nav2: boolean;
  gps: boolean;
  adf: boolean;
  xpdr: boolean;
  ap: boolean;
  /** electric pitch trim (also needs the trim/AP breaker in) */
  trim: boolean;
  flaps: boolean;
  turnCoord: boolean;
  /** stall warning horn is pneumatic in a C172: always true, listed for completeness */
  stallHorn: boolean;
  pitotHeat: boolean;
  landingLight: boolean;
  beacon: boolean;
  auxPump: boolean;
}

/** SystemsReadout with every additive field present (what `sim.sys` holds) */
export type SystemsState = Required<SystemsReadout>;

/** G1000 annunciator colours: red WARNING (chime, repeats until acknowledged) or amber CAUTION (single chime) */
export const ANNUNCIATOR_LEVEL: Record<Annunciator, "warning" | "caution"> = {
  "LOW VOLTS": "warning",
  "OIL PRESSURE": "warning",
  FIRE: "warning",
  SMOKE: "warning",
  "LOW VACUUM": "caution",
  "LOW FUEL L": "caution",
  "LOW FUEL R": "caution",
  "PITOT HEAT OFF": "caution",
  "FUEL PRESS": "caution",
  DOOR: "caution",
};

/** pilot-facing switch names (event log, debrief, checklists) */
export const SWITCH_LABELS_EN: Record<keyof Switches, string> = {
  batMaster: "Master BAT",
  altMaster: "Master ALT",
  avionics: "Avionics master",
  auxPump: "Aux fuel pump",
  magnetos: "Magnetos",
  mixture: "Mixture",
  fuelSelector: "Fuel selector",
  fuelShutoff: "Fuel shutoff valve",
  pitotHeat: "Pitot heat",
  altStatic: "Alternate static",
  trimCb: "Trim / AP breaker",
  cabinHeat: "Cabin heat / air",
  landingLight: "Landing light",
  beacon: "Beacon",
};

export const SWITCH_LABELS_FR: Record<keyof Switches, string> = {
  batMaster: "Batterie (BAT)",
  altMaster: "Alternateur (ALT)",
  avionics: "Avionique",
  auxPump: "Pompe électrique",
  magnetos: "Magnétos",
  mixture: "Mélange",
  fuelSelector: "Robinet carburant",
  fuelShutoff: "Coupe-carburant",
  pitotHeat: "Réchauffage pitot",
  altStatic: "Prise statique secours",
  trimCb: "Disjoncteur trim / PA",
  cabinHeat: "Chauffage / air cabine",
  landingLight: "Phare d’atterrissage",
  beacon: "Anticollision",
};

/** the value of a switch as a pilot says it (EN): 'ON', 'OFF', 'IDLE CUT-OFF', 'BOTH', 'PULLED'… */
export function switchValueText(k: keyof Switches, v: Switches[keyof Switches]): string {
  if (k === "mixture") {
    const m = Number(v);
    return m < 0.06 ? "IDLE CUT-OFF" : m >= 0.98 ? "FULL RICH" : `LEAN (${Math.round(m * 100)} %)`;
  }
  if (k === "trimCb") return v ? "IN" : "PULLED";
  if (k === "altStatic") return v ? "OPEN" : "CLOSED";
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  return String(v);
}

/** the same in French: 'MARCHE', 'ARRÊT', 'ÉTOUFFOIR', 'LES DEUX'… */
export function switchValueTextFr(k: keyof Switches, v: Switches[keyof Switches]): string {
  if (k === "mixture") {
    const m = Number(v);
    return m < 0.06 ? "ÉTOUFFOIR" : m >= 0.98 ? "PLEIN RICHE" : `APPAUVRI (${Math.round(m * 100)} %)`;
  }
  if (k === "trimCb") return v ? "ENFONCÉ" : "TIRÉ";
  if (k === "altStatic") return v ? "OUVERTE" : "FERMÉE";
  if (k === "fuelSelector") return ({ LEFT: "GAUCHE", RIGHT: "DROITE", BOTH: "LES DEUX", OFF: "FERMÉ" } as Record<string, string>)[String(v)] ?? String(v);
  if (k === "magnetos") return ({ OFF: "ARRÊT", L: "G", R: "D", BOTH: "LES DEUX", START: "DÉMARRAGE" } as Record<string, string>)[String(v)] ?? String(v);
  if (typeof v === "boolean") return v ? "MARCHE" : "ARRÊT";
  return String(v);
}

export const FAILURE_LABELS_EN: Record<FailureKey, string> = {
  gs: "Glideslope",
  nav1: "NAV1 receiver",
  gps: "GPS (loss of integrity)",
  ap: "Autopilot",
  ahrs: "AHRS (attitude & heading)",
  airData: "Air data (pitot-static)",
  engine: "Engine failure",
  alternator: "Alternator failure",
  battery: "Battery failure",
  electricalFire: "Electrical fire",
  vacuum: "Vacuum pump failure",
  pitotBlocked: "Pitot tube blocked",
  pitotIcing: "Pitot icing",
  staticBlocked: "Static port blocked",
  engineRough: "Rough engine (magneto)",
  enginePartial: "Partial power loss",
  fuelPump: "Engine-driven fuel pump failure",
  fuelLeak: "Fuel leak (left tank)",
  oilPressure: "Loss of oil pressure",
  engineFire: "Engine fire in flight",
  flaps: "Flaps jammed",
  trimRunaway: "Electric trim runaway",
  comms: "Radio failure (lost comms)",
  xpdr: "Transponder failure",
  door: "Door open in flight",
};

export const FAILURE_LABELS_FR: Record<FailureKey, string> = {
  gs: "Glide",
  nav1: "Récepteur NAV1",
  gps: "GPS (perte d’intégrité)",
  ap: "Pilote automatique",
  ahrs: "AHRS (assiette et cap)",
  airData: "Anémo-baro (pitot-statique)",
  engine: "Panne moteur",
  alternator: "Panne d’alternateur",
  battery: "Panne de batterie",
  electricalFire: "Feu électrique",
  vacuum: "Panne de dépression",
  pitotBlocked: "Pitot obstrué",
  pitotIcing: "Givrage du pitot",
  staticBlocked: "Prise statique obstruée",
  engineRough: "Moteur qui tourne mal (magnéto)",
  enginePartial: "Perte partielle de puissance",
  fuelPump: "Panne de pompe à carburant mécanique",
  fuelLeak: "Fuite de carburant (réservoir gauche)",
  oilPressure: "Perte de pression d’huile",
  engineFire: "Feu moteur en vol",
  flaps: "Volets bloqués",
  trimRunaway: "Emballement du trim électrique",
  comms: "Panne radio",
  xpdr: "Panne de transpondeur",
  door: "Porte ouverte en vol",
};

export const FAILURE_GROUPS: {
  id: "avionics" | "electrical" | "instruments" | "engine" | "other";
  keys: FailureKey[];
}[] = [
  {
    id: "engine",
    keys: [
      "engine",
      "enginePartial",
      "engineRough",
      "fuelPump",
      "fuelLeak",
      "oilPressure",
      "engineFire",
    ],
  },
  { id: "electrical", keys: ["alternator", "battery", "electricalFire"] },
  {
    id: "instruments",
    keys: [
      "vacuum",
      "pitotBlocked",
      "pitotIcing",
      "staticBlocked",
      "ahrs",
      "airData",
    ],
  },
  { id: "avionics", keys: ["gs", "nav1", "gps", "ap", "comms", "xpdr"] },
  { id: "other", keys: ["flaps", "trimRunaway", "door"] },
];
