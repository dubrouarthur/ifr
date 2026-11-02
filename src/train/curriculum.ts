// IFR curriculum: stages, exercises and learning paths for flight schools.
import { S, startAt, setAttitude, radialQuiz, fmtHdg, type Exercise, type Step } from './engine';
import { findFix, navaid, runway } from '../nav/data';
import { destination } from '../nav/geo';
import { clearanceText, holdEntry, type HoldDef, type Turn } from '../nav/holding';
import { holdDiagramSvg } from './diagram';
import type { Sim } from '../sim/sim';

const F = (id: string) => findFix(id)!;
const ARD = navaid('ARD');
const MSV = navaid('MSV');
const PA = navaid('PA');
const r27 = runway('PARD', '27');
const OPEN = { pos: destination(F('PARD'), 160, 18) };

export const STAGES = [
  { id: 'S1', title: 'Stage 1 — Basic attitude instrument flying', desc: 'Scan, attitude + power, standard-rate turns, climbs and descents, steep turns, unusual attitudes.' },
  { id: 'S2', title: 'Stage 2 — Partial panel', desc: 'AHRS failure: standby attitude, magnetic compass turns, timed turns.' },
  { id: 'S3', title: 'Stage 3 — Radio navigation', desc: 'VOR orientation, intercepts and tracking with wind, DME arcs, NDB/ADF tracking.' },
  { id: 'S4', title: 'Stage 4 — Holding', desc: 'Direct, teardrop and parallel entries, wind correction, ATC hold clearances, holds on an NDB.' },
  { id: 'S5', title: 'Stage 5 — Instrument approaches', desc: 'ILS, LOC, VOR/DME with arc, NDB with procedure turn, RNAV LPV with HILPT, LNAV/VNAV, back course, circling.' },
  { id: 'S6', title: 'Stage 6 — Missed approaches & abnormals', desc: 'Go-around at DA, missed approach holds, GS/AP failures, partial-panel approach.' },
  { id: 'S7', title: 'Stage 7 — Checkride preparation', desc: 'Full IFR profiles evaluated against the ACS.' },
];

function holdExercise(id: string, title: string, fixId: string, inbound: number, turn: Turn, courseToFix: number, alt: number, opts: { wind?: [number, number]; vor?: boolean; summary?: string; laps?: number } = {}): Exercise {
  const fx = F(fixId);
  const isVor = opts.vor ?? fx.kind === 'vor';
  return {
    id,
    stage: 'S4',
    title,
    summary: opts.summary ?? `Hold at ${fixId}, inbound ${fmtHdg(inbound)}°, ${turn === 'R' ? 'right' : 'left'} turns. Determine and fly the correct entry.`,
    objectives: ['Determine the AIM entry from your course to the fix', 'Fly the entry and establish on the inbound course', 'Adjust outbound timing to get 1:00 inbound legs', 'Stay on the holding side, ±100 ft'],
    standards: ['Correct entry procedure', 'Altitude ±100 ft', 'Inbound legs 1:00 ±15 s', 'Non-holding side excursion < 0.6 NM'],
    briefing: ['Six Ts at the fix: Turn – Time – Twist – Throttle – Talk – Track.', 'Hold at 90 KIAS (C172 maximum holding speed below 6000 ft is 200 KIAS).', 'Wind: triple the drift correction on the outbound leg.'],
    allowAp: true,
    minutes: 12,
    setup: (sim: Sim) => {
      const start = destination(fx, courseToFix + 180, 7);
      const hold: HoldDef = { fix: { ident: fx.ident, lat: fx.lat, lon: fx.lon }, inbound, turn, legMin: 1, altFt: alt };
      startAt(sim, {
        pos: start,
        altFt: alt,
        hdg: courseToFix,
        iasKt: 90,
        weather: opts.wind ? { windDir: opts.wind[0], windKt: opts.wind[1], ceilingFt: 900, visibilitySm: 2 } : { ceilingFt: 900, visibilitySm: 2 },
        setup: (s) => {
          s.ap.altSel = alt;
          s.ap.hdgBug = Math.round(courseToFix) || 360;
          if (fx.kind === 'vor') {
            s.av.nav1.active = navaid(fx.ident).freq;
            s.av.obs1 = Math.round(inbound) || 360;
          }
          if (fx.kind === 'ndb') {
            s.av.adf.active = navaid(fx.ident).freq;
            s.av.bearing1 = 'ADF';
          }
          s.fp.setHold({ ident: fx.ident, lat: fx.lat, lon: fx.lon }, inbound, turn, 1, s.ac.s, alt);
        },
      });
      const entry = holdEntry(inbound, turn, courseToFix);
      const opts3 = ['DIRECT', 'TEARDROP', 'PARALLEL'];
      return {
        hold,
        clearance: clearanceText(hold, isVor),
        quiz: {
          question: `ATC: "${clearanceText(hold, isVor)}" — You are proceeding to ${fx.ident} on course ${fmtHdg(courseToFix)}°. Which entry?`,
          options: opts3,
          answer: opts3.indexOf(entry),
          explain: `Course ${fmtHdg(courseToFix)}° relative to the inbound course ${fmtHdg(inbound)}° puts you in the ${entry} sector (70° line rule, AIM 5-3-8).`,
          svg: holdDiagramSvg(inbound, turn, fx.ident, courseToFix),
        },
        steps: [S.hold(hold, opts.laps ?? 2)],
        allowanceSec: 25,
      };
    },
  };
}

function approachExercise(id: string, stage: string, title: string, approachId: string, transition: string | null, o: { pos: ReturnType<typeof destination>; alt: number; hdg: number; ceiling: number; vis: number; wind?: [number, number, number?]; allowAp: boolean; goAround?: boolean; failures?: Record<string, boolean>; mode?: 'activate' | 'vtf'; summary: string; briefing: string[]; turb?: number; gsFail?: boolean; extraSetup?: (s: Sim) => void; minutes?: number; failAfterFaf?: 'gs' | 'ap' | 'ahrs' | 'gps' }): Exercise {
  return {
    id,
    stage,
    title,
    summary: o.summary,
    objectives: ['Brief the approach plate (frequencies, courses, altitudes, minimums, missed)', 'Fly the procedure within ACS tolerances', o.goAround ? 'Go around at DA/MAP and fly the missed approach' : 'Land, or go around if not visual at minimums'],
    standards: ['CDI / GS within ¾ scale on final', 'Airspeed ±10 KIAS on final', 'No descent below segment altitudes or DA/MDA without visual references', 'Stabilized below 500 ft AGL'],
    briefing: o.briefing,
    plate: approachId,
    allowAp: o.allowAp,
    minutes: o.minutes ?? 15,
    setup: (sim) => {
      startAt(sim, {
        pos: o.pos,
        altFt: o.alt,
        hdg: o.hdg,
        iasKt: 95,
        weather: { ceilingFt: o.ceiling, visibilitySm: o.vis, windDir: o.wind?.[0] ?? 250, windKt: o.wind?.[1] ?? 8, gustKt: o.wind?.[2] ?? 0, turbulence: o.turb ?? 0.15 },
        setup: (s) => {
          s.ap.altSel = o.alt;
          s.ap.hdgBug = Math.round(o.hdg) || 360;
          s.loadApproach(approachId, transition, o.mode ?? 'activate');
          if (o.gsFail) s.gsFailed = true;
          o.extraSetup?.(s);
        },
        failures: o.failures as never,
      });
      const steps: Step[] = [S.approach(!!o.goAround)];
      if (o.failAfterFaf) {
        const key = o.failAfterFaf;
        steps[0].check = (c) => {
          const fp = c.sim.fp;
          const faf = fp.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
          if (!c.mem.failed && faf >= 0 && fp.active > faf && c.d.aglFt < 1500) {
            c.mem.failed = true;
            c.sim.setFailure(key, true);
          }
          return null;
        };
      }
      if (o.goAround) {
        const ap = sim.fp.approach!;
        const m = ap.missed[ap.missed.length - 1];
        const hold: HoldDef = { fix: { ident: m.fix.ident, lat: m.fix.lat, lon: m.fix.lon }, inbound: m.hold!.inbound, turn: m.hold!.turn, legMin: 1, altFt: m.altMin ?? 3000 };
        steps.push(S.missedHold(1, hold));
        return { steps, acs: true, allowanceSec: 30, hold };
      }
      return { steps, acs: true, allowanceSec: 30 };
    },
  };
}

export const EXERCISES: Exercise[] = [
  // ---------------------------------------------------------------- Stage 1
  {
    id: 'bai-sl',
    stage: 'S1',
    title: 'Straight and level',
    summary: 'Hold altitude, heading and airspeed for 3 minutes in light turbulence — the foundation of the scan.',
    objectives: ['Establish a radial scan centred on the attitude indicator', 'Trim for hands-off flight', 'Correct deviations before they grow'],
    standards: ['Altitude ±100 ft', 'Heading ±10°', 'Airspeed ±10 KIAS'],
    briefing: ['Set ~2300 RPM, pitch ~2° nose up for 100 KIAS, then trim (Home/End).', 'Scan: AI → ALT → AI → HSI → AI → ASI.', 'Use small attitude changes: 1° of pitch ≈ 100 fpm.'],
    allowAp: false,
    minutes: 4,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 4000, hdg: 90, iasKt: 100, weather: { turbulence: 0.2, ceilingFt: 2000, cloudTopFt: 8000 } });
      return { steps: [S.maintain(4000, 90, 100, 180)], allowanceSec: 10 };
    },
  },
  {
    id: 'bai-turns',
    stage: 'S1',
    title: 'Standard-rate turns',
    summary: 'Turns to headings at standard rate (3°/s) while holding altitude.',
    objectives: ['Bank for standard rate (≈15°)', 'Lead the roll-out', 'Hold altitude with back pressure in the turn'],
    standards: ['Altitude ±100 ft', 'Roll out ±10°', 'Bank ≤ 30°'],
    briefing: ['Standard rate bank ≈ TAS/10 + 7 → ~15° at 90 KIAS.', 'Lead roll-out by half the bank angle (~8°).', 'Watch the magenta turn-rate trend on the HSI: the white tick = standard rate.'],
    allowAp: false,
    minutes: 5,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 4000, hdg: 360, iasKt: 95 });
      return { steps: [S.turnTo(270, 'L', 4000), S.maintain(4000, 270, 95, 20), S.turnTo(90, 'R', 4000), S.maintain(4000, 90, 95, 20), S.turnTo(360, 'L', 4000)], allowanceSec: 12 };
    },
  },
  {
    id: 'bai-climb',
    stage: 'S1',
    title: 'Constant-airspeed climbs and descents',
    summary: 'Climb at 75 KIAS, level off, then descend at 500 fpm and 90 KIAS.',
    objectives: ['Power + pitch for airspeed in the climb', 'Lead the level-off by 10% of VS', 'Constant-rate descent with power'],
    standards: ['Airspeed ±10 KIAS', 'Heading ±10°', 'Level off ±100 ft'],
    briefing: ['Climb: full power, pitch ~7° for 75 KIAS.', 'Descent: ~1700 RPM, pitch −2° for 500 fpm at 90 KIAS.'],
    allowAp: false,
    minutes: 8,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 3000, hdg: 180, iasKt: 95 });
      return { steps: [S.changeAlt(5000, 75, 180), S.maintain(5000, 180, 95, 30), S.changeAlt(3500, 90, 180, -500), S.maintain(3500, 180, 90, 30)], allowanceSec: 20 };
    },
  },
  {
    id: 'bai-climbturn',
    stage: 'S1',
    title: 'Climbing and descending turns',
    summary: 'Combine a standard-rate turn with a constant-airspeed climb, then a descending turn.',
    objectives: ['Split the scan between bank, pitch and power', 'Complete both changes together'],
    standards: ['Airspeed ±10 KIAS', 'Roll-out ±10°', 'Level-off ±100 ft'],
    briefing: ['Set climb power and attitude first, then roll into the turn.', 'Whichever finishes first (heading or altitude), keep flying the other.'],
    allowAp: false,
    minutes: 8,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 3000, hdg: 90, iasKt: 90 });
      const climbTurn: Step = { ...S.changeAlt(4500, 75, null), text: 'Climbing right turn to heading 270, level at 4500 ft, 75 KIAS', done: (c) => Math.abs(c.sim.indicatedAlt() - 4500) < 50 && Math.abs(((c.d.hdgTrue - 270 + 540) % 360) - 180) < 6 };
      const descTurn: Step = { ...S.changeAlt(3000, 90, null, -500), text: 'Descending left turn to heading 090, level at 3000 ft, 500 fpm', done: (c) => Math.abs(c.sim.indicatedAlt() - 3000) < 50 && Math.abs(((c.d.hdgTrue - 90 + 540) % 360) - 180) < 6 };
      return { steps: [climbTurn, S.maintain(4500, 270, 90, 20), descTurn], allowanceSec: 20 };
    },
  },
  {
    id: 'bai-steep',
    stage: 'S1',
    title: 'Steep turns (45°)',
    summary: 'A 360° steep turn each way at 45° bank holding altitude — an ACS task (IR.III).',
    objectives: ['Coordinate back pressure and power through the turn', 'Roll out on the entry heading'],
    standards: ['Altitude ±100 ft', 'Bank 45° ±5°', 'Roll out ±10°'],
    briefing: ['Roll in smoothly; passing 30° add back pressure and ~100 RPM.', 'Expect ~1.4 G. Lead roll-out by ~20°.'],
    allowAp: false,
    minutes: 6,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 4500, hdg: 360, iasKt: 95, setup: (s) => (s.controls.throttle = 0.72) });
      return { steps: [S.steepTurn('L', 4500), S.maintain(4500, 360, 95, 15, { hdg: 15 }), S.steepTurn('R', 4500)], allowanceSec: 15 };
    },
  },
  {
    id: 'bai-unusual',
    stage: 'S1',
    title: 'Unusual attitude recovery',
    summary: 'Recover from a nose-high/slow and a nose-low/spiralling attitude by reference to instruments.',
    objectives: ['Identify nose-high vs nose-low from the ASI and AI', 'Apply the correct recovery sequence'],
    standards: ['No stall', 'No VNE exceedance', 'Recover without losing more than ~500 ft below entry'],
    briefing: ['Nose high: power FULL, nose down to the horizon, level the wings.', 'Nose low: power IDLE, level the wings FIRST, then ease the nose up.'],
    allowAp: false,
    minutes: 4,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 5000, hdg: 45, iasKt: 90, weather: { ceilingFt: 1500, cloudTopFt: 9000 } });
      setAttitude(sim, 22, -35, 72);
      const second: Step = { ...S.recover(), text: 'Second attitude — RECOVER', onStart: (c) => { setAttitude(c.sim, -18, 55, 125); c.sim.controls.throttle = 0.8; } };
      return { steps: [S.recover(), S.maintain(Math.round(sim.indicatedAlt() / 100) * 100 || 5000, 45, 95, 10, { alt: 600, hdg: 180 }), second], allowanceSec: 5 };
    },
  },
  {
    id: 'bai-slow',
    stage: 'S1',
    title: 'Approach configuration & slow flight',
    summary: 'Configure for the approach: flaps 20, 70 KIAS level, then a 3° descent at 80 KIAS.',
    objectives: ['Power and trim changes with configuration', 'Hold 70 KIAS without stall warning'],
    standards: ['Airspeed ±5 KIAS', 'Altitude ±100 ft', 'No stall warning'],
    briefing: ['Below 85 KIAS (VFE): flaps 10, then 20 (F key).', 'Expect pitch-up with flaps — re-trim.'],
    allowAp: false,
    minutes: 5,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 4000, hdg: 270, iasKt: 95 });
      return { steps: [{ ...S.maintain(4000, 270, 70, 90, { ias: 5 }), text: 'Slow to 70 KIAS, flaps 20, maintain 4000 ft / heading 270 for 90 s', graceSec: 30 }, S.changeAlt(3200, 80, 270, -400)], allowanceSec: 12 };
    },
  },
  // ---------------------------------------------------------------- Stage 2
  {
    id: 'pp-compass',
    stage: 'S2',
    title: 'Partial panel: compass & timed turns',
    summary: 'AHRS has failed. Use the standby attitude and the magnetic compass; time standard-rate turns (3°/s).',
    objectives: ['Fly the standby attitude indicator', 'Use timed turns: 30 s = 90°', 'Understand compass lag/lead (UNOS)'],
    standards: ['Altitude ±100 ft', 'Roll out ±15° (partial panel)', 'Bank ≤ 30°'],
    briefing: ['Start the timer (T) as you roll in. 90° = 30 s at standard rate.', 'Compass: Undershoot North, Overshoot South (northern hemisphere).'],
    allowAp: false,
    minutes: 8,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 4000, hdg: 90, iasKt: 95, weather: { ceilingFt: 1000, cloudTopFt: 9000 }, failures: { ahrs: true } });
      const t = (h: number, dir: 'L' | 'R'): Step => ({ ...S.turnTo(h, dir, 4000), done: (c) => Math.abs(((c.d.hdgTrue - h + 540) % 360) - 180) < 12 && Math.abs(c.d.rollDeg) < 5 });
      return { steps: [S.maintain(4000, 90, 95, 45, { hdg: 15 }), t(180, 'R'), t(360, 'L'), t(270, 'L')], allowanceSec: 20 };
    },
  },
  {
    id: 'pp-unusual',
    stage: 'S2',
    title: 'Partial panel unusual attitudes',
    summary: 'Recover with the primary AHRS failed — standby instruments only.',
    objectives: ['Recover using the standby attitude and ASI/altimeter trends'],
    standards: ['No stall', 'No VNE exceedance'],
    briefing: ['Airspeed increasing + altitude decreasing = nose low. Decreasing + increasing = nose high.'],
    allowAp: false,
    minutes: 4,
    setup: (sim) => {
      startAt(sim, { ...OPEN, altFt: 5500, hdg: 200, iasKt: 90, weather: { ceilingFt: 1000, cloudTopFt: 9000 }, failures: { ahrs: true } });
      setAttitude(sim, -15, 50, 120);
      return { steps: [S.recover()], allowanceSec: 3 };
    },
  },
  // ---------------------------------------------------------------- Stage 3
  {
    id: 'nav-vor-out',
    stage: 'S3',
    title: 'VOR orientation & outbound radial',
    summary: 'Find your radial from ARD, then intercept and track R-090 outbound to 12 DME.',
    objectives: ['Determine position with the VOR (radial/TO-FROM)', 'Intercept at 45°', 'Track with a wind correction angle'],
    standards: ['¾-scale CDI after interception', 'Altitude ±100 ft'],
    briefing: ['Tune 114.20, identify ARD. Rotate the CRS knob until the needle centres with a FROM flag: that is your radial.', 'To intercept R-090 outbound: CRS 090, turn to 045 or 135 toward the needle.'],
    allowAp: true,
    minutes: 10,
    setup: (sim) => {
      const start = destination(ARD, 50, 6);
      startAt(sim, { pos: start, altFt: 3000, hdg: 140, iasKt: 95, weather: { windDir: 360, windKt: 15, ceilingFt: 800 }, setup: (s) => { s.av.nav1.active = 114.2; s.av.obs1 = 90; s.setCdi('NAV1'); s.ap.altSel = 3000; } });
      return { quiz: radialQuiz(sim, 'ARD', ARD, 114.2), steps: [S.trackRadial('ARD', 114.2, 90, 'FROM', 12, 3000)], allowanceSec: 25 };
    },
  },
  {
    id: 'nav-vor-in',
    stage: 'S3',
    title: 'VOR inbound tracking with crosswind',
    summary: 'Track R-200 inbound to ARD with a 20 kt crosswind; bracket to find the wind correction angle.',
    objectives: ['Bracketing technique', 'Hold the WCA', 'Station passage: TO/FROM flip'],
    standards: ['¾-scale CDI after interception', 'Altitude ±100 ft'],
    briefing: ['CRS 020 (TO). Start with 10° correction into the wind, halve it each time you re-centre.'],
    allowAp: true,
    minutes: 10,
    setup: (sim) => {
      startAt(sim, { pos: destination(ARD, 205, 14), altFt: 3500, hdg: 20, iasKt: 95, weather: { windDir: 290, windKt: 20, ceilingFt: 700 }, setup: (s) => (s.ap.altSel = 3500) });
      return { steps: [S.trackRadial('ARD', 114.2, 200, 'TO', 2, 3500)], allowanceSec: 25 };
    },
  },
  {
    id: 'nav-arc',
    stage: 'S3',
    title: 'DME arc',
    summary: 'Fly the 10 DME arc around MSV counter-clockwise from R-100 to R-030, then turn inbound.',
    objectives: ['Turn onto the arc with a lead', 'Keep the bearing pointer on the wingtip', 'Lead the turn inbound (lead radial)'],
    standards: ['Arc ±1 NM', 'Altitude ±100 ft'],
    briefing: ['BRG1 = NAV1 is set for you. On a CCW arc the station is off the LEFT wingtip.', 'Every time the needle falls ~10° behind the wingtip, turn 10° left.'],
    allowAp: false,
    minutes: 10,
    plate: 'MSVL-V21',
    setup: (sim) => {
      const start = destination(MSV, 100, 10);
      startAt(sim, { pos: start, altFt: 4500, hdg: 10, iasKt: 95, weather: { windDir: 270, windKt: 10, ceilingFt: 1200 }, setup: (s) => { s.av.nav1.active = 112.7; s.av.bearing1 = 'NAV1'; s.ap.altSel = 4500; s.av.obs1 = 210; } });
      return { steps: [S.dmeArc({ ...MSV, ident: 'MSV' }, 112.7, 10, 35, 'L', 4500), { ...S.trackRadial('MSV', 112.7, 30, 'TO', 3, 4500), text: 'Turn inbound and track R-030 to MSV (CRS 210)' }], allowanceSec: 30 };
    },
  },
  {
    id: 'nav-ndb',
    stage: 'S3',
    title: 'NDB tracking (QDM)',
    summary: 'Intercept and track 270° inbound to the PA NDB with the ADF bearing pointer and a crosswind.',
    objectives: ['Interpret the ADF needle (relative/magnetic bearing)', 'Intercept a QDM', 'Correct for drift'],
    standards: ['Track ±5°', 'Altitude ±100 ft'],
    briefing: ['BRG1 = ADF. MB = MH + RB. To intercept 270 inbound from the north, fly 225 until the needle points 45° right, then turn to 270.'],
    allowAp: false,
    minutes: 10,
    setup: (sim) => {
      startAt(sim, { pos: destination(destination(PA, 90, 10), 0, 2.5), altFt: 3000, hdg: 225, iasKt: 95, weather: { windDir: 200, windKt: 15, ceilingFt: 1500 }, setup: (s) => (s.ap.altSel = 3000) });
      return { steps: [S.ndbTrack(344, 270, 3000, 0.8, { ...PA, ident: 'PA' })], allowanceSec: 30 };
    },
  },
  {
    id: 'nav-gps',
    stage: 'S3',
    title: 'GPS direct-to and flight-plan sequencing',
    summary: 'Use Direct-To, load an approach, and fly the magenta line through two waypoints.',
    objectives: ['D→ operation', 'CDI scaling ENR / TERM', 'Leg sequencing and turn anticipation'],
    standards: ['¾-scale CDI', 'Altitude ±100 ft'],
    briefing: ['Press D, type TOBEY, Enter. Then Procedures → ILS 27 via TOBEY → Load & activate.'],
    allowAp: true,
    minutes: 10,
    setup: (sim) => {
      startAt(sim, { pos: destination(F('TOBEY'), 20, 14), altFt: 4000, hdg: 200, iasKt: 100, setup: (s) => (s.ap.altSel = 4000) });
      return {
        steps: [
          S.direct('TOBEY', 4000, () => undefined, 2),
          { text: 'Load ILS 27 via TOBEY, activate, fly to KEDDY at 3000', done: (c) => c.sim.fp.approachId === 'PARD-I27' && c.sim.fp.out.toIdent === 'MARLO', check: (c) => (c.sim.fp.out.valid && Math.abs(c.sim.fp.out.dev) > 0.75 ? 'CDI > ¾ scale' : null), graceSec: 40 },
        ],
        allowanceSec: 30,
      };
    },
  },
  // ---------------------------------------------------------------- Stage 4
  holdExercise('hold-direct', 'Holding: direct entry', 'ARD', 270, 'R', 300, 3000, { summary: 'The simplest entry — arriving within the 180° direct sector. Learn the hold geometry and timing.' }),
  holdExercise('hold-teardrop', 'Holding: teardrop entry', 'ARD', 270, 'R', 120, 3000, { summary: 'Arriving from the 70° teardrop sector: outbound 30° toward the holding side, then turn inbound.' }),
  holdExercise('hold-parallel', 'Holding: parallel entry', 'ARD', 270, 'R', 30, 3000, { summary: 'Arriving from the 110° parallel sector: fly outbound parallel on the non-holding side, turn back >180°.' }),
  holdExercise('hold-left', 'Non-standard (left) hold', 'MSV', 210, 'L', 290, 4500, { summary: 'Left turns are mirrored — the sectors flip. Many students get this wrong.' }),
  holdExercise('hold-wind', 'Holding with a strong wind', 'ARD', 270, 'R', 270, 3000, { wind: [360, 25], laps: 3, summary: 'A 25 kt crosswind: triple the drift on the outbound leg, adjust timing to get 1:00 inbound.' }),
  holdExercise('hold-ndb', 'Holding on an NDB', 'PA', 270, 'R', 45, 3000, { wind: [220, 15], summary: 'Hold at the PA NDB using the ADF bearing pointer only (or the GPS overlay).' }),
  holdExercise('hold-fix', 'Holding at an RNAV fix', 'KEDDY', 270, 'L', 170, 4000, { summary: 'Hold at KEDDY, left turns, on the GPS — an ATC-style non-published hold.' }),
  {
    id: 'hold-random',
    stage: 'S4',
    title: 'ATC holding clearance generator',
    summary: 'A random, never-the-same holding clearance: decode it, pick the entry, fly two circuits. Repeat until automatic.',
    objectives: ['Copy & decode an ATC hold clearance', 'Visualise the hold and pick the entry', 'Fly it to standard'],
    standards: ['Correct entry', 'Altitude ±100 ft', 'Inbound 1:00 ±15 s'],
    briefing: ['Draw it: put the fix on top, the inbound course pointing at it, the pattern on the turn side.'],
    allowAp: true,
    minutes: 12,
    setup: (sim) => {
      const fixes = ['ARD', 'MSV', 'PA', 'KEDDY', 'WILLO', 'TOBEY'];
      const fx = fixes[Math.floor(Math.random() * fixes.length)];
      const inbound = Math.round(Math.random() * 35) * 10 || 360;
      const turn: Turn = Math.random() < 0.7 ? 'R' : 'L';
      const crs = Math.round(Math.random() * 35) * 10 || 360;
      const alt = 3000 + Math.round(Math.random() * 3) * 500;
      const ex = holdExercise('hold-random', 'ATC hold', fx, inbound, turn, crs, alt, { wind: [Math.round(Math.random() * 35) * 10, Math.round(Math.random() * 20)] });
      return ex.setup(sim);
    },
  },
  // ---------------------------------------------------------------- Stage 5
  approachExercise('app-ils-ap', 'S5', 'ILS RWY 27 — coupled', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 14), 0, 3.2), alt: 3000, hdg: 240, ceiling: 500, vis: 1, allowAp: true, mode: 'vtf', summary: 'Vectors to final, couple the autopilot in APR. Learn the mode sequence: HDG → LOC armed → LOC → GS.', briefing: ['NAV1 is tuned to I-PRD, CDI on LOC1 after the switch (C key).', 'APR arms LOC & GS; ALT holds 3000 until GS capture.'], extraSetup: (s) => s.setCdi('NAV1') }),
  approachExercise('app-ils-hand', 'S5', 'ILS RWY 27 — hand-flown, full procedure', 'PARD-I27', 'TOBEY', { pos: destination(F('TOBEY'), 30, 8), alt: 4000, hdg: 210, ceiling: 350, vis: 0.75, allowAp: false, wind: [220, 12], summary: 'Fly TOBEY–KEDDY on GPS, switch to LOC before the FAF, hand-fly the glideslope to DA 670.', briefing: ['Switch the CDI to LOC1 before KEDDY.', 'Glideslope: ~450 fpm at 85 kt ground speed. Pitch for the path, power for the speed.'] }),
  approachExercise('app-loc', 'S5', 'LOC RWY 27 — non-precision', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 12), 180, 3), alt: 3000, hdg: 300, ceiling: 800, vis: 1.5, allowAp: false, mode: 'vtf', gsFail: true, summary: 'Glideslope out: descend to 2400 for MARLO, then to MDA 900. Continuous-descent (CDFA) at ~500 fpm.', briefing: ['MDA 900. Do not descend below MDA without the runway environment in sight.', 'MAP at RW27 (6.1 NM from MARLO).'], extraSetup: (s) => { s.setCdi('NAV1'); s.av.minimums = 900; } }),
  approachExercise('app-vor-arc', 'S5', 'VOR/DME RWY 21 via 10 DME arc', 'MSVL-V21', 'TOMAS (10 DME ARC)', { pos: destination(MSV, 120, 16), alt: 4500, hdg: 300, ceiling: 1900, vis: 2, allowAp: true, wind: [230, 14], turb: 0.3, summary: 'IAF TOMAS, 10 DME arc to GALEN, inbound R-030 to MSV, step-down at DOPPS, MDA 1640.', briefing: ['Use BRG1 = NAV1 for the arc; lead the turn inbound at R-035.', 'Step-downs: MSV 3200 · DOPPS 2100 · MDA 1640.'] }),
  approachExercise('app-ndb-pt', 'S5', 'NDB RWY 27 with procedure turn', 'PARD-N27', 'PA (PROC TURN)', { pos: destination(PA, 270, 6), alt: 2500, hdg: 90, ceiling: 1200, vis: 2, allowAp: false, wind: [200, 12], summary: 'Overfly PA, outbound 090, procedure turn 045°/225° north of course within 10 NM, inbound to PA, time to the MAP.', briefing: ['Outbound 2 min after PA, turn left to 045 for 1 min, right to 225, intercept 270 inbound.', 'Start the timer at PA inbound: 3:00 to the MAP at 90 KT.'], extraSetup: (s) => (s.av.bearing1 = 'ADF') }),
  approachExercise('app-rnav-hilpt', 'S5', 'RNAV (GPS) RWY 09 LPV via HILPT', 'PARD-R09', 'WILLO (HILPT)', { pos: destination(F('WILLO'), 260, 8), alt: 3000, hdg: 80, ceiling: 400, vis: 1, allowAp: true, summary: 'Course reversal in the WILLO hold-in-lieu, then the LPV glidepath to DA 670.', briefing: ['The GPS flies the HILPT entry and exits after one circuit.', 'APR arms GP; check LPV annunciation on the HSI.'] }),
  approachExercise('app-lnav-vnav', 'S5', 'RNAV (GPS) RWY 03 LNAV/VNAV, gusty crosswind', 'MSVL-R03', 'TALUS', { pos: destination(F('TALUS'), 140, 8), alt: 4000, hdg: 300, ceiling: 1700, vis: 1.5, allowAp: false, wind: [320, 16, 24], turb: 0.35, summary: 'Hand-fly a baro-VNAV glidepath in gusts. Add half the gust factor to the approach speed.', briefing: ['Vapp 90 + ½ × 8 = 94 KIAS.', 'DA 1500.'] }),
  approachExercise('app-bc', 'S5', 'LOC back course RWY 09', 'PARD-B09', null, { pos: destination(F('WILLO'), 300, 6), alt: 3000, hdg: 120, ceiling: 1100, vis: 1.5, allowAp: true, mode: 'activate', summary: 'Reverse-sensing awareness: with CRS on the front course 270, the HSI still shows the correct picture.', briefing: ['CRS 270. No glideslope. MDA 860.'], extraSetup: (s) => { s.setCdi('NAV1'); s.av.obs1 = 270; } }),
  approachExercise('app-circle', 'S5', 'ILS 27, circle to land RWY 09', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 12), 0, 2), alt: 3000, hdg: 250, ceiling: 1100, vis: 2, allowAp: true, mode: 'vtf', wind: [90, 14], summary: 'Fly the ILS to the circling MDA 1000, break off and circle to land on runway 09 (tailwind on 27).', briefing: ['Circling MDA 1000 (Cat A), remain within 1.3 NM of the runway.', 'Keep the runway in sight; land on 09.'], extraSetup: (s) => { s.setCdi('NAV1'); s.av.minimums = 1000; } }),
  // ---------------------------------------------------------------- Stage 6
  approachExercise('ma-da', 'S6', 'Missed approach at DA and hold', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 12), 0, 2.5), alt: 3000, hdg: 240, ceiling: 120, vis: 0.25, allowAp: true, mode: 'vtf', goAround: true, summary: 'Ceiling below minimums. At DA: go around (G), climb to 3000, direct ARD and enter the hold.', briefing: ['G = TOGA: full power, 7° pitch, flaps 10, missed approach sequenced.', 'Then NAV (and AP) to fly to ARD and the hold entry.'], extraSetup: (s) => s.setCdi('NAV1') }),
  approachExercise('ma-gsfail', 'S6', 'Glideslope failure on final', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 12), 0, 2.5), alt: 3000, hdg: 240, ceiling: 800, vis: 1.5, allowAp: true, mode: 'vtf', summary: 'The glideslope fails after the FAF. Revert to LOC minimums (MDA 900) or go around.', briefing: ['Recognise "GS OUT"/NO GS flag, set MINS 900 (MINS knob/softkey), continue as LOC.'], failAfterFaf: 'gs', extraSetup: (s) => s.setCdi('NAV1') }),
  approachExercise('ma-pp', 'S6', 'Partial-panel ILS', 'PARD-I27', null, { pos: destination(destination(r27.threshold, 90, 12), 0, 2.5), alt: 3000, hdg: 240, ceiling: 600, vis: 1, allowAp: false, mode: 'vtf', failures: { ahrs: true }, summary: 'AHRS failed: fly the ILS on the standby attitude with the CDI and magnetic compass.', briefing: ['Heading info is from the compass only — expect lag. Small corrections.'], extraSetup: (s) => s.setCdi('NAV1') }),
  // ---------------------------------------------------------------- Stage 7
  {
    id: 'ck-profile',
    stage: 'S7',
    title: 'Full IFR profile (checkride)',
    summary: 'Departure, direct ARD, published hold, ILS 27 via ARD, land. Graded against the ACS.',
    objectives: ['Every skill in sequence, as on the practical test'],
    standards: ['ACS: altitude ±100 ft, heading ±10°, airspeed ±10 KIAS, ¾-scale on final, DA discipline'],
    briefing: ['Clearance: "Cleared to PARD, climb runway heading to 3000, then direct ARD, hold as published (inbound 270, right turns), expect ILS 27 via ARD."'],
    plate: 'PARD-I27',
    allowAp: true,
    minutes: 30,
    setup: (sim) => {
      startAt(sim, { pos: destination(r27.threshold, 270, 0.05), altFt: 420, hdg: 270, iasKt: 0, onGround: true, weather: { ceilingFt: 500, visibilitySm: 1, windDir: 250, windKt: 10, turbulence: 0.15 }, setup: (s) => { s.ap.altSel = 3000; s.ap.hdgBug = 270; s.av.nav1.active = 110.3; s.av.nav1.standby = 114.2; } });
      const hold: HoldDef = { fix: { ident: 'ARD', lat: ARD.lat, lon: ARD.lon }, inbound: 270, turn: 'R', legMin: 1, altFt: 3000 };
      return {
        steps: [
          S.takeoff(3000, 270),
          S.direct('ARD', 3000, (c) => c.sim.fp.setHold({ ident: 'ARD', lat: ARD.lat, lon: ARD.lon }, 270, 'R', 1, c.sim.ac.s, 3000), 0.6),
          S.hold(hold, 1),
          { ...S.approach(false), onStart: (c) => { c.sim.loadApproach('PARD-I27', 'ARD', 'activate'); } },
        ],
        hold,
        acs: true,
        allowanceSec: 45,
      };
    },
  },
];

export interface Path {
  id: string;
  title: string;
  desc: string;
  exercises: string[];
}

export const PATHS: Path[] = [
  { id: 'ir', title: 'Instrument Rating — complete syllabus', desc: 'From the first scan to the checkride. Follow it in order.', exercises: EXERCISES.map((e) => e.id) },
  { id: 'holds', title: 'Holding masterclass', desc: 'Entries, sectors, wind, non-standard holds and ATC clearances until they are automatic.', exercises: ['hold-direct', 'hold-teardrop', 'hold-parallel', 'hold-left', 'hold-wind', 'hold-ndb', 'hold-fix', 'hold-random', 'ma-da'] },
  { id: 'classic', title: 'Classic procedures (VOR, NDB, DME arc, PT)', desc: 'The “old-school” skills examiners love: radials, QDM, arcs, procedure turns, timing.', exercises: ['nav-vor-out', 'nav-vor-in', 'nav-arc', 'nav-ndb', 'hold-ndb', 'app-vor-arc', 'app-ndb-pt', 'app-loc', 'app-bc', 'app-circle'] },
  { id: 'approaches', title: 'Approach mastery', desc: 'Every approach type, coupled and hand-flown, in low weather.', exercises: ['app-ils-ap', 'app-ils-hand', 'app-loc', 'app-vor-arc', 'app-ndb-pt', 'app-rnav-hilpt', 'app-lnav-vnav', 'app-bc', 'app-circle', 'ma-da'] },
  { id: 'emerg', title: 'Partial panel & abnormals', desc: 'Failures, standby instruments, unusual attitudes, go-arounds.', exercises: ['bai-unusual', 'pp-compass', 'pp-unusual', 'ma-gsfail', 'ma-pp', 'ma-da'] },
  { id: 'ckp', title: 'Checkride prep (refresher)', desc: 'A short pre-test sequence for IPCs and practical tests.', exercises: ['bai-steep', 'bai-unusual', 'hold-random', 'app-ils-hand', 'app-loc', 'ma-da', 'ck-profile'] },
];

export function exercise(id: string): Exercise {
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown exercise ${id}`);
  return e;
}

