# IFR Trainer — browser IFR simulator

G1000-style glass cockpit (PFD + MFD with bezel knobs/softkeys), GFC700-class autopilot, every approach type with generated approach plates, joystick support and scored debriefs. Built for flight-school use.

**Approaches (9 procedures, 2 airports):** ILS 27 (CAT I/II minima) and ILS 03, LOC-only, **LDA/DME** (offset localizer), LOC back course, VOR/DME with 10 DME arc, NDB with barbed procedure turn, RNAV LPV with hold-in-lieu, LNAV/VNAV, circling minima, published holds and missed approaches.

**IFR flights:** gate-to-gate cross-country flights with CRAFT clearance, departure, route, approach clearance and landing; localizer/LDA/radial interception drills.

**Three cockpits** — G1000 glass (PFD/MFD, GFC 700), classic **steam gauges** (six-pack, wet compass, CDI with GS, RMI/ADF, KX155 / KR87 / KN62 / KAP 140 / KT76 stack, GPS), and an **airliner** layout (Boeing-style PFD with FMA, tapes and ILS scales, map-mode ND, MCP).

**Flight Center** — every flight in one place, classified by type (Approaches · Procedures · IFR flights · Instrument basics · Abnormal · Checkride · Free flight) with sub-types, search, level/airport/autopilot filters, a briefing pane with the plate, and cockpit choice.

**IFR circuit builder (pro-simulator IOS style)** — the instructor composes a circuit: start on a runway or airborne (fix / bearing / distance / altitude / heading / speed), then any sequence of route fixes, ATC altitude changes, holds (fix, inbound course, turns, leg time, altitude, number of circuits) and approaches (transition or vectors; missed approach to continue, or full-stop landing). Add weather and **scheduled failures** (after N minutes or at the start of leg #), autopilot policy, training/checkride mode and the cockpit. Live map preview, validation, save to the library, duplicate, export/import JSON, and **share as a link** (`#circuit=…`). Each circuit is flown with ATC phraseology and graded step by step + ACS. Four school presets included.

**For flight schools**
- **Learning paths** — Instrument Rating syllabus (7 stages, 32 graded exercises), Holding masterclass, Classic procedures (VOR/NDB/DME arc/PT), Approach mastery, Partial panel & abnormals, Checkride prep. Progress is tracked per exercise.
- **Exercises** with briefing, objectives, ACS-style standards, approach plate, knowledge check (e.g. *which hold entry?*), live step-by-step HUD with tolerance alerts, and a graded result.
- **Holding** — AIM 5-3-8 entries (70° line: direct 180°, parallel 110°, teardrop 70°) flown by the GPS/AP with real entry legs; evaluator grades entry flown vs correct entry, 1:00 inbound timing, protected airspace, altitude. ATC hold-clearance generator and a rapid-fire **hold-entry drill**.
- **Classic procedures** — DME arcs, barbed procedure turns (45°/180°), hold-in-lieu of PT, VOR radial intercepts/tracking, NDB QDM tracking, timed approaches, circling.
- **Checkride mode** — FAA Instrument ACS pass/fail (¾-scale, DA/MDA with visual references, missed approach, ±10 kt…), hand-flown option, random failures.
- **Instructor station** — failure injection (GS, NAV1, GPS, AP, AHRS, air data, engine), reposition (IAF/IF/final/runway), freeze, ATC vectors, weather, live ACS monitor.
- **Records** — printable reports (PDF), attempt history per student with CSV export.

**Features**
- PFD: attitude with synthetic vision & flight-path marker, speed/altitude tapes with trend vectors, VSI, HSI with CDI/bearing pointers, GS/GP indicator, marker beacon, minimums, AP annunciator, inset map.
- MFD: engine strip, moving map with terrain, flight plan page.
- Out-the-window view with cloud layer, fog and runway lighting (breaking out at minimums).
- Flight plan / GPS: Direct-To, load/activate approach, vectors-to-final, leg sequencing, SUSP at MAP, missed approach, hold steering, ENR/TERM/APR CDI scaling.
- Charts drawer: approach plates & airport diagrams with zoom/pan, night mode and own-ship on the plate.
- Joystick/yoke/HOTAS/gamepad via the Gamepad API with click-to-assign mapping, invert, curves, persisted per device.
- Cockpit audio: engine, stall horn, outer marker, AP disconnect, altitude alerter, "minimums" callout.
- Debrief: score & grade, lateral/vertical tracking, floors, stabilized approach, touchdown, ground track and vertical profile, timeline, JSON export.

> The Ardent Islands region, navaids and procedures are **fictional**. Not for real-world navigation.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # flight model, nav, autopilot, plates, scenarios
npm run build    # typecheck + production build to dist/
```

## Deploy on Vercel

Import the repository in Vercel — `vercel.json` sets the Vite framework, `npm run build` and the `dist` output. Or with the CLI: `npx vercel --prod`.

Deep link a scenario: `/?scenario=ils27-vtf&wx=mins`.

Keyboard: `J` learn · `I` instructor · `K` charts · `G` go-around · `?` all shortcuts.
