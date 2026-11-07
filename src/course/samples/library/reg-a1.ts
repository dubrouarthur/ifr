// Ground school — the course library, author A1's registry. Only author A1 edits this file: import your courses
// from ./<slug>.ts and list them here, in the order they should appear within their program.
import type { LibraryDef } from "./types";
import { IR_SCAN_ATTITUDE_ID, irScanAttitudeCourse } from "./ir-scan-attitude";
import {
  IR_PRESSURE_INSTRUMENTS_ID,
  irPressureInstrumentsCourse,
} from "./ir-pressure-instruments";
import { IR_GYROS_COMPASS_ID, irGyrosCompassCourse } from "./ir-gyros-compass";
import {
  PPL_HUMAN_PERFORMANCE_ID,
  pplHumanPerformanceCourse,
} from "./ppl-human-performance";
import {
  ATPL_022_INSTRUMENTS_ID,
  atpl022InstrumentsCourse,
} from "./atpl-022-instruments";

export const REG_A1: readonly LibraryDef[] = [
  {
    id: IR_SCAN_ATTITUDE_ID,
    program: "ir",
    build: irScanAttitudeCourse,
    blurb: {
      en: "The scan, control and performance, primary and supporting instruments, standard-rate turns: on the live six-pack, then flown",
      fr: "Le circuit visuel, pilotage et performances, instruments principaux et secondaires, virages au taux standard : sur les six instruments en direct, puis en vol",
    },
  },
  {
    id: IR_PRESSURE_INSTRUMENTS_ID,
    program: "ir",
    build: irPressureInstrumentsCourse,
    blurb: {
      en: "Pitot and static, the altimeter and its settings, pressure, density and cold-temperature altitude, the C172S arcs, blockages live",
      fr: "Pitot et statique, l’altimètre et ses calages, altitudes pression, densité et correction de froid, les arcs du C172S, obstructions en direct",
    },
  },
  {
    id: IR_GYROS_COMPASS_ID,
    program: "ir",
    build: irGyrosCompassCourse,
    blurb: {
      en: "Rigidity and precession, the vacuum gyros, compass errors, timed turns and the vacuum failure: partial panel on the live six-pack, then flown",
      fr: "Fixité et précession, les gyros à dépression, les erreurs du compas, les virages chronométrés et la panne de dépression : panne partielle en direct, puis en vol",
    },
  },
  {
    id: PPL_HUMAN_PERFORMANCE_ID,
    program: "lapl-ppl",
    build: pplHumanPerformanceCourse,
    blurb: {
      en: "Spatial disorientation and the spiral, vision, oxygen, IMSAFE and alcohol, threat and error management: a spiral recovery live, then flown",
      fr: "Désorientation spatiale et spirale, vision, oxygène, IMSAFE et alcool, gestion des menaces et des erreurs : une sortie de spirale en direct, puis en vol",
    },
  },
  {
    id: ATPL_022_INSTRUMENTS_ID,
    program: "atpl",
    build: atpl022InstrumentsCourse,
    blurb: {
      en: "The speed of sound and Mach, CAS and TAS, the PFD and its mode annunciator, the ND, AP and FD, GPWS and ACAS: on live airliner displays",
      fr: "Vitesse du son et Mach, Vc et Vp, le PFD et ses annonces de modes, le ND, AP et FD, GPWS et ACAS : sur des écrans d’avion de ligne en direct",
    },
  },
];
