// The library's classification: the ONE home (programme + subject) of every built-in item, its level, the subjects
// of other programmes where it is "also useful" (a pointer, never a second home, never counted there) and its
// one-line purpose when the source has none. Keyed by the item's own id: a course id (samples, samples/library, the
// planned catalogue), a sim lesson (train/curriculum.ts), a failure drill (train/drills.ts), a scenario (sim/sim.ts),
// a school circuit (train/circuits.ts) or a procedure's base id (train/procedureLibrary.ts). A crafted briefing deck
// has no row: it is the cover of its lesson. tests/library-model.test.ts checks that every source item, every
// registered library course and every planned one has exactly one row, that every subject exists and that "also"
// never points back into the item's own programme. Generated from the information architecture (libia/data.js).
import type { L10n } from "../course/types";
import type { Level, SubjectId } from "./programs";

export interface Placement {
  home: SubjectId;
  level: Level;
  also?: readonly SubjectId[];
  /** what you will be able to do, one line (the card's purpose), when the source has none of its own */
  purpose?: L10n;
  /** extra search words (the way a pilot asks for it: "panne moteur après le décollage") */
  words?: string;
}

export const CLASSIFICATION: Readonly<Record<string, Placement>> = {
  // ---- courses
  "sample-lib-ppl-airspace": {
    home: "ppl.law",
    level: 1,
    also: ["night.rules"],
  },
  "sample-lib-ppl-human-performance": {
    home: "ppl.hp",
    level: 1,
    also: ["night.hp", "atpl.040"],
    purpose: {
      en: "Disorientation and the spiral, vision, oxygen, IMSAFE",
      fr: "Désorientation et spirale, vision, oxygène, IMSAFE",
    },
  },
  "sample-lib-ppl-meteorology": {
    home: "ppl.met",
    level: 1,
    also: ["atpl.050"],
  },
  "sample-lib-club-phraseology": {
    home: "ppl.com",
    level: 1,
    also: ["club.life"],
  },
  "sample-lib-ppl-principles-of-flight": {
    home: "ppl.pof",
    level: 1,
    also: ["atpl.081"],
  },
  "sample-maths-vfr": {
    home: "ppl.fpp",
    level: 1,
    also: ["night.nav"],
    purpose: {
      en: "The nav log in your head: wind, fuel, crosswind, balance",
      fr: "Le log de navigation de tête : vent, carburant, travers, centrage",
    },
  },
  "sample-lib-ppl-performance-mass-balance": { home: "ppl.fpp", level: 2 },
  "sample-lib-ppl-vfr-navigation": {
    home: "ppl.nav",
    level: 1,
    also: ["night.nav"],
  },
  "sample-lib-c172-normal": { home: "ppl.prep", level: 1 },
  "sample-lib-ppl-circuit": { home: "ppl.circ", level: 1 },
  "sample-lib-c172-emergency": { home: "ppl.emer", level: 2 },
  "sample-lib-ppl-forced-landing": { home: "ppl.emer", level: 2 },
  "sample-lib-ir-scan-attitude": {
    home: "ir.att",
    level: 1,
    also: ["ppl.bif", "night.hp"],
    purpose: {
      en: "Control and performance, on the live six-pack",
      fr: "Pilotage et performances, sur les six instruments en direct",
    },
  },
  "sample-lib-ir-pressure-instruments": {
    home: "ir.att",
    level: 1,
    also: ["ppl.agk", "atpl.022"],
    purpose: {
      en: "Pitot, static, the altimeter and its settings, blockages live",
      fr: "Pitot, statique, altimètre et calages, obstructions en direct",
    },
  },
  "sample-lib-ir-gyros-compass": {
    home: "ir.att",
    level: 2,
    also: ["ppl.agk", "atpl.022"],
    purpose: {
      en: "Precession, compass errors, timed turns",
      fr: "Précession, erreurs du compas, virages chronométrés",
    },
  },
  "sample-vor": {
    home: "ir.nav",
    level: 2,
    also: ["ppl.xc", "atpl.062"],
    purpose: {
      en: "Read the HSI, intercept, bracket the wind",
      fr: "Lire le HSI, intercepter, encadrer le vent",
    },
  },
  "sample-lib-ir-ndb-adf": {
    home: "ir.nav",
    level: 2,
    also: ["atpl.062"],
    purpose: {
      en: "The RMI, MB = MH + RB, homing against tracking",
      fr: "Le RMI, QDM = Cm + Gt, ralliement contre suivi",
    },
  },
  "sample-holding": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "Clearance, the three entries, timing, triple drift",
      fr: "La clairance, les trois entrées, le chrono, la dérive triplée",
    },
  },
  "sample-lib-ir-ils-loc": { home: "ir.app", level: 2, also: ["atpl.062"] },
  "sample-lib-ir-rnav-gnss": { home: "ir.app", level: 2, also: ["atpl.062"] },
  "sample-lib-ir-lost-comms": { home: "ir.emer", level: 3 },
  "sample-maths-ifr": {
    home: "ir.proc",
    level: 2,
    also: ["atpl.061"],
    purpose: {
      en: "1 in 60, 3° path, VDP, cold: IFR mental maths",
      fr: "1 sur 60, plan à 3°, VDP, froid : le calcul mental IFR",
    },
  },
  "sample-lib-ir-departures-arrivals": { home: "ir.proc", level: 3 },
  "sample-lib-ir-flight-planning": { home: "ir.proc", level: 3 },
  "sample-lib-atpl-022-instruments": {
    home: "atpl.022",
    level: 3,
    purpose: {
      en: "Mach, the PFD and its modes, ND, AP/FD, GPWS and ACAS",
      fr: "Mach, PFD et modes, ND, AP/FD, GPWS et ACAS",
    },
  },
  "sample-lib-atpl-031-mass-balance": { home: "atpl.031", level: 3 },
  "sample-lib-atpl-033-flight-planning": { home: "atpl.033", level: 3 },
  "sample-lib-club-essentials": { home: "club.life", level: 1 },
  "sample-lib-club-teaching": { home: "instructors.teach", level: 1 },
  // ---- sim lessons (train/curriculum.ts)
  "bai-sl": {
    home: "ppl.hand",
    level: 1,
    also: ["ir.att", "night.hp"],
    purpose: {
      en: "Hold heading and altitude on instruments only",
      fr: "Tenir cap et altitude aux seuls instruments",
    },
  },
  "bai-turns": {
    home: "ppl.hand",
    level: 1,
    also: ["ir.att", "night.hp"],
    purpose: {
      en: "3° per second, bank from your airspeed",
      fr: "3° par seconde, l’inclinaison selon la vitesse",
    },
  },
  "bai-climb": {
    home: "ppl.hand",
    level: 1,
    also: ["ir.att", "night.hp"],
    purpose: {
      en: "Pitch holds the speed, power the rate",
      fr: "L’assiette tient la vitesse, la puissance le vario",
    },
  },
  "bai-climbturn": {
    home: "ppl.hand",
    level: 1,
    also: ["ir.att"],
    purpose: {
      en: "Two things at once, without losing the heading",
      fr: "Deux paramètres à la fois, sans perdre le cap",
    },
  },
  "bai-steep": {
    home: "ppl.hand",
    level: 2,
    also: ["ir.att"],
    purpose: {
      en: "45° of bank, ±100 ft, roll out on heading",
      fr: "45° d’inclinaison, ±100 ft, sortie sur le cap",
    },
  },
  "bai-unusual": {
    home: "ppl.bif",
    level: 2,
    also: ["ir.att", "night.hp"],
    purpose: {
      en: "Nose high or low, then recover in the right order",
      fr: "Reconnaître nez haut ou bas, puis rattraper dans l’ordre",
    },
  },
  "bai-slow": {
    home: "ppl.hand",
    level: 1,
    also: ["ir.att"],
    purpose: {
      en: "Flaps, approach speed, a steady attitude",
      fr: "Volets, vitesse d’approche, assiette stable",
    },
  },
  "pp-compass": {
    words: "partial panel panne partielle partial-panel",
    home: "ir.att",
    level: 2,
    also: ["ppl.bif", "night.emer"],
    purpose: {
      en: "No attitude, no heading: the clock and the compass",
      fr: "Sans horizon ni conservateur : le chrono et le compas",
    },
  },
  "pp-unusual": {
    words: "partial panel panne partielle partial-panel",
    home: "ir.att",
    level: 2,
    also: ["ppl.bif", "night.hp"],
    purpose: {
      en: "Recover without an attitude indicator",
      fr: "Rattraper sans horizon artificiel",
    },
  },
  "nav-vor-out": {
    home: "ir.nav",
    level: 2,
    also: ["ppl.xc"],
    purpose: {
      en: "Find your radial, intercept at 45°",
      fr: "Trouver son radial, intercepter à 45°",
    },
  },
  "nav-vor-in": {
    home: "ir.nav",
    level: 2,
    also: ["ppl.xc"],
    purpose: {
      en: "Bracket the wind, station passage",
      fr: "L’encadrement du vent, le passage de la station",
    },
  },
  "nav-arc": {
    home: "ir.nav",
    level: 2,
    purpose: {
      en: "The 10° rhythm and the lead radial",
      fr: "Le rythme de 10° et le radial d’anticipation",
    },
  },
  "nav-ndb": {
    home: "ir.nav",
    level: 2,
    purpose: {
      en: "Home, then track a bearing in wind",
      fr: "Rallier, puis suivre un QDM avec du vent",
    },
  },
  "nav-gps": {
    home: "ir.nav",
    level: 2,
    also: ["ppl.xc"],
    purpose: {
      en: "Direct-to, sequence the legs, track the deviation",
      fr: "Direct-to, séquencer les points, suivre l’écart",
    },
  },
  "int-loc30": {
    home: "ir.nav",
    level: 2,
    purpose: {
      en: "Intercept without overshooting",
      fr: "Intercepter sans dépasser l’axe",
    },
  },
  "int-loc45-tail": {
    home: "ir.nav",
    level: 2,
    purpose: {
      en: "Lead the turn when the wind pushes you",
      fr: "Anticiper le virage quand le vent pousse",
    },
  },
  "int-loc90": {
    home: "ir.nav",
    level: 3,
    purpose: {
      en: "A tight angle at the last moment",
      fr: "Un angle fermé au dernier moment",
    },
  },
  "int-lda": {
    home: "ir.nav",
    level: 3,
    purpose: {
      en: "A course that is not the runway",
      fr: "Un axe qui ne mène pas à la piste",
    },
  },
  "hold-direct": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "Fly straight to the fix, turn outbound, time 1 minute",
      fr: "Droit sur le point, virage en éloignement, 1 minute au chrono",
    },
  },
  "hold-teardrop": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "30° off the outbound leg, then turn back onto the inbound course",
      fr: "30° du parcours d’éloignement, puis retour sur l’axe de rapprochement",
    },
  },
  "hold-parallel": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "Parallel outbound on the non-holding side, then back to the fix",
      fr: "Éloignement parallèle côté non protégé, puis retour au point",
    },
  },
  "hold-left": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "The same entries mirrored: left turns, as ATC may clear you",
      fr: "Les mêmes entrées en miroir : virages à gauche, si l’ATC le demande",
    },
  },
  "hold-wind": {
    home: "ir.hold",
    level: 3,
    purpose: {
      en: "Correct the drift ×3 outbound and adjust the timing",
      fr: "Corriger la dérive ×3 en éloignement et ajuster le chrono",
    },
  },
  "hold-ndb": {
    home: "ir.hold",
    level: 3,
    purpose: {
      en: "Hold on the needle: RMI bearings, no course guidance",
      fr: "Attendre sur l’aiguille : relèvements RMI, sans guidage d’axe",
    },
  },
  "hold-fix": {
    home: "ir.hold",
    level: 2,
    purpose: {
      en: "Hold at a GPS waypoint, with the leg drawn on the map",
      fr: "Attendre sur un point GPS, avec la branche dessinée sur la carte",
    },
  },
  "hold-random": {
    home: "ir.hold",
    level: 3,
    purpose: {
      en: "A new clearance each time: decode, pick the entry, fly it",
      fr: "Une clairance nouvelle à chaque fois : décoder, choisir l’entrée, voler",
    },
  },
  "app-ils-ap": {
    home: "ir.app",
    level: 2,
    purpose: {
      en: "Let the autopilot fly the ILS: arm, capture, monitor",
      fr: "Laisser le pilote automatique voler l’ILS : armer, capturer, surveiller",
    },
  },
  "app-ils-hand": {
    home: "ir.app",
    level: 2,
    purpose: {
      en: "The full ILS by hand, from the IAF to the DA",
      fr: "L’ILS complet à la main, de l’IAF jusqu’à la DA",
    },
  },
  "app-loc": {
    home: "ir.app",
    level: 2,
    purpose: {
      en: "No glide path: step down to the MDA, time the approach",
      fr: "Sans glide : descente par paliers jusqu’à la MDA, au chrono",
    },
  },
  "app-vor-arc": {
    home: "ir.app",
    level: 3,
    purpose: {
      en: "Fly the 10 DME arc, then the VOR final to 21",
      fr: "Voler l’arc 10 DME, puis la finale VOR vers la 21",
    },
  },
  "app-ndb-pt": {
    home: "ir.app",
    level: 3,
    purpose: {
      en: "Outbound, the procedure turn, then the NDB final",
      fr: "Éloignement, virage conventionnel, puis la finale NDB",
    },
  },
  "app-rnav-hilpt": {
    home: "ir.app",
    level: 2,
    purpose: {
      en: "Reverse in the racetrack, then the LPV glide path",
      fr: "Demi-tour dans l’hippodrome, puis la descente LPV",
    },
  },
  "app-lnav-vnav": {
    home: "ir.app",
    level: 3,
    purpose: {
      en: "LNAV/VNAV with a gusty crosswind down to the DA",
      fr: "LNAV/VNAV par travers en rafales jusqu’à la DA",
    },
  },
  "app-bc": {
    home: "ir.app",
    level: 3,
    purpose: {
      en: "The localizer flown backwards: reverse sensing",
      fr: "Le localizer à l’envers : indications inversées",
    },
  },
  "app-circle": {
    home: "ir.app",
    level: 3,
    purpose: {
      en: "ILS to minima, then circle visually to the other runway",
      fr: "ILS jusqu’aux minima, puis tour à vue vers l’autre piste",
    },
  },
  "ma-da": {
    home: "ir.app",
    level: 2,
    purpose: {
      en: "Nothing at DA: go around and fly the published missed",
      fr: "Rien à la DA : remettre les gaz et suivre la procédure publiée",
    },
  },
  "ma-gsfail": {
    home: "ir.emer",
    level: 3,
    purpose: {
      en: "The flag appears: go LOC-only or go around",
      fr: "Le drapeau apparaît : passer en LOC ou remettre",
    },
  },
  "ma-pp": {
    words: "partial panel panne partielle partial-panel",
    home: "ir.emer",
    level: 3,
    purpose: {
      en: "The ILS without attitude or heading, at half rate",
      fr: "L’ILS sans horizon ni cap, au demi-taux",
    },
  },
  "ifr-local-lda": { home: "ir.proc", level: 3 },
  "ifr-pard-msvl-rnav": { home: "ir.proc", level: 3 },
  "ifr-msvl-pard-ils": { home: "ir.proc", level: 3 },
  "ifr-pard-msvl-vor": { home: "ir.proc", level: 3 },
  "ifr-msvl-pard-ndb": { home: "ir.proc", level: 3 },
  "ck-profile": {
    home: "ir.test",
    level: 3,
    purpose: {
      en: "Departure, hold, approach, missed: graded like the test",
      fr: "Départ, attente, approche, remise : noté comme au test",
    },
  },
  // ---- failure drills (train/drills.ts)
  "d-flaps": {
    home: "ppl.emer",
    level: 1,
    purpose: {
      en: "An approach and a no-flap landing",
      fr: "Une approche et un atterrissage sans volets",
    },
  },
  "d-efato": {
    home: "ppl.emer",
    level: 2,
    also: ["club.drills"],
    words:
      "efato apres le decollage after take-off takeoff panne moteur engine failure",
    purpose: {
      en: "Lined up; the engine quits in the initial climb",
      fr: "Aligné piste, la panne arrive dans la montée initiale",
    },
  },
  "d-forced-landing": {
    home: "ppl.emer",
    level: 2,
    also: ["club.drills"],
    words: "atterrissage force forced landing campagne field",
    purpose: {
      en: "Engine failure in cruise, glide and land in a field",
      fr: "Panne moteur en croisière, plané et atterrissage en campagne",
    },
  },
  "d-engine-cruise": {
    home: "ppl.emer",
    level: 2,
    also: ["club.drills"],
    words: "atterrissage force forced landing campagne field",
    purpose: {
      en: "Glide at 68 kt, pick a field, try a restart",
      fr: "Plané à 68 kt, choix du champ, tentative de remise en route",
    },
  },
  "d-engine-fire": {
    home: "ppl.emer",
    level: 2,
    purpose: {
      en: "Fuel off, 100 kt glide, forced landing",
      fr: "Coupure carburant, plané à 100 kt, atterrissage forcé",
    },
  },
  "d-elec-fire": {
    home: "ppl.emer",
    level: 2,
    also: ["night.emer"],
    purpose: {
      en: "Master off, ventilate, then only what you need",
      fr: "Master coupé, aération, puis remettre le strict nécessaire",
    },
  },
  "d-rough": {
    home: "ppl.emer",
    level: 2,
    purpose: {
      en: "Partial power loss in cruise",
      fr: "Perte partielle de puissance en croisière",
    },
  },
  "d-trim": {
    home: "ppl.emer",
    level: 2,
    purpose: {
      en: "Hold the attitude, trim off, carry on",
      fr: "Tenir l’assiette, couper le trim, continuer",
    },
  },
  "d-alternator-imc": { home: "ir.emer", level: 2, also: ["night.emer"] },
  "d-vacuum-app": {
    home: "ir.emer",
    level: 3,
    words: "partial panel panne partielle partial-panel",
  },
  "d-pitot-icing": { home: "ir.emer", level: 2, also: ["ppl.emer"] },
  "d-static": { home: "ir.emer", level: 3 },
  "d-lostcomms": { home: "ir.emer", level: 3 },
  "d-club-test": {
    home: "club.drills",
    level: 3,
    also: ["ppl.emer"],
    purpose: {
      en: "Two random failures, handled with the checklists",
      fr: "Deux pannes au hasard, à traiter avec les check-lists",
    },
  },
  // ---- graded routes (train/circuits.ts)
  "p-classic": { home: "ir.proc", level: 2 },
  "p-valley": { home: "ir.proc", level: 3 },
  "p-cross": { home: "ir.proc", level: 3 },
  "p-pp": {
    home: "ir.test",
    level: 3,
    words: "partial panel panne partielle partial-panel",
  },
  // ---- free practice (sim/sim.ts)
  free: {
    home: "discover.start",
    level: 1,
    also: ["ppl.hand"],
    purpose: {
      en: "Take off from Port Ardent and get the feel of the aircraft",
      fr: "Décoller de Port Ardent et prendre l’avion en main",
    },
  },
  "hold-ard": { home: "ir.hold", level: 2 },
  "ils27-vtf": { home: "ir.app", level: 1 },
  "ils27-full": { home: "ir.app", level: 2 },
  loc27: { home: "ir.app", level: 2 },
  rnav09: { home: "ir.app", level: 1 },
  locbc09: { home: "ir.app", level: 3 },
  ndb27: { home: "ir.app", level: 3 },
  vor21: { home: "ir.app", level: 2 },
  rnav03: { home: "ir.app", level: 2 },
  ils03: { home: "ir.app", level: 2 },
  lda36: { home: "ir.app", level: 3 },
  rwy27: { home: "ir.proc", level: 1 },
  // ---- checklists (train/procedureLibrary.ts, by base id)
  "c172.flaps": { home: "ppl.emer", level: 1 },
  "c172.takeoffRoll": { home: "ppl.emer", level: 1 },
  "c172.efato": { home: "ppl.emer", level: 2 },
  "c172.engineFailure": { home: "ppl.emer", level: 2 },
  "c172.forcedLanding": { home: "ppl.emer", level: 2 },
  "c172.roughEngine": { home: "ppl.emer", level: 2 },
  "c172.oilPressure": { home: "ppl.emer", level: 2 },
  "c172.fuelPump": { home: "ppl.emer", level: 2 },
  "c172.fuelLeak": { home: "ppl.emer", level: 2 },
  "c172.engineFire": { home: "ppl.emer", level: 2 },
  "c172.precautionary": { home: "ppl.emer", level: 2 },
  "c172.ditching": { home: "ppl.emer", level: 3 },
  "c172.fireStart": { home: "ppl.emer", level: 1 },
  "c172.cabinFire": { home: "ppl.emer", level: 2 },
  "c172.wingFire": { home: "ppl.emer", level: 2 },
  "c172.alternatorSteam": { home: "ppl.emer", level: 2, also: ["night.emer", "ir.emer"] },
  "c172.highVolts": { home: "ppl.emer", level: 2, also: ["night.emer"] },
  "c172.lowVoltsIdle": { home: "ppl.emer", level: 1 },
  "c172.battery": { home: "ppl.emer", level: 2, also: ["night.emer"] },
  "c172.stbyBatt": { home: "ir.emer", level: 2, also: ["night.emer"] },
  "c172.carbonMonoxide": { home: "ppl.emer", level: 1 },
  "c172.vacuumG1000": { home: "ir.emer", level: 2 },
  "c172.ahrs": { home: "ir.emer", level: 3 },
  "c172.icing": { home: "ir.emer", level: 3, also: ["night.emer"] },
  "c172.lostCommsSera": { home: "ir.emer", level: 3 },
  "c172.lostCommsVfr": { home: "ppl.emer", level: 2 },
  "c172.spin": { home: "ppl.emer", level: 2 },
  "c172.display": { home: "ir.emer", level: 3 },
  "c172.electricalFire": { home: "ppl.emer", level: 2, also: ["night.emer"] },
  "c172.trimRunaway": { home: "ppl.emer", level: 2 },
  "c172.xpdr": { home: "ppl.emer", level: 1, also: ["ir.emer"] },
  "c172.door": { home: "ppl.emer", level: 1 },
  "c172.noseHigh": { home: "ppl.bif", level: 2, also: ["ir.att", "night.hp"] },
  "c172.noseLow": { home: "ppl.bif", level: 2, also: ["ir.att", "night.hp"] },
  "c172.spiral": { home: "ppl.bif", level: 2, also: ["ir.att", "night.hp"] },
  "c172.alternator": {
    home: "ppl.emer",
    level: 2,
    also: ["night.emer", "ir.emer"],
  },
  "c172.vacuum": {
    home: "ir.emer",
    level: 2,
    also: ["night.emer"],
    words: "partial panel panne partielle partial-panel",
  },
  "c172.pitot": { home: "ir.emer", level: 2, also: ["ppl.emer"] },
  "c172.static": { home: "ir.emer", level: 3 },
  "c172.airData": { home: "ir.emer", level: 3 },
  "c172.lostComms": { home: "ir.emer", level: 3 },
  "c172.gpsLoss": { home: "ir.emer", level: 3 },
  "c172.nav1": { home: "ir.emer", level: 3 },
  "c172.gsFail": { home: "ir.emer", level: 3 },
  "c172.apFail": { home: "ir.emer", level: 2 },
};
