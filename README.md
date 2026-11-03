# IFR Trainer — browser IFR simulator

G1000-style glass cockpit (PFD + MFD with bezel knobs/softkeys), GFC700-class autopilot, every approach type with generated approach plates, joystick support and scored debriefs. Built for flight-school use.

**Approaches (9 procedures, 2 airports):** ILS 27 (CAT I/II minima) and ILS 03, LOC-only, **LDA/DME** (offset localizer), LOC back course, VOR/DME with 10 DME arc, NDB with barbed procedure turn, RNAV LPV with hold-in-lieu, LNAV/VNAV, circling minima, published holds and missed approaches.

**IFR flights:** gate-to-gate cross-country flights with CRAFT clearance, departure, route, approach clearance and landing; localizer/LDA/radial interception drills.

**3D outside view (WebGL)** — the Ardent Islands with terrain relief, coastline and sea, towns and forests; runways with full markings (threshold bars, numbers, TDZ, aiming points, centreline), taxiways, aprons, tower and hangars; **ALSF-II / MALSR approach lights with sequenced flashers**, edge / threshold / end / TDZ / centreline lights, REIL strobes and **PAPI driven by your actual glide angle**; sky dome with sun, overcast base and tops, visibility fog and the break-out at minimums; **day, dusk and night**; mouse look-around.

**Connectivity**
- **EFB live link** — the aircraft appears in ForeFlight, Garmin Pilot, SkyDemon, FltPlan Go, Avare… The page streams telemetry to a tiny local bridge which re-broadcasts **GDL 90** (UDP 4000: heartbeat, ownship, geometric altitude, ForeFlight ID) and **XGPS/XATT** (UDP 49002), like X-Plane does:
  ```bash
  node tools/efb-bridge.mjs            # or --target 192.168.1.255 to aim at your Wi-Fi broadcast address
  ```
  Then Menu → Connections → Connect (`ws://localhost:8765`). No dependencies (Node 18+); downloadable from the app.
- **Exports** — flight plan as Garmin `.fpl` (ForeFlight/Garmin Pilot import), X-Plane `.fms`, MSFS `.pln`, GPX route; flown track as GPX (CloudAhoy/ForeFlight), KML 3D (Google Earth) and CSV.
- **School webhook** — POST every debrief as JSON (student, scenario, ACS result, score, failed tasks, events) to FlightLogger / Flight Schedule Pro via Zapier or Make, an LMS or a sheet.
- **Chart services** — links to Navigraph Charts, FAA d-TPP, SIA and SimBrief. A built-in Navigraph integration needs a Navigraph developer client ID (OAuth) and is not enabled.

**Debrief replay** — replay the flight in the cockpit (instruments + 3D view) with a timeline, event markers and 1×/4×/16× speed.

**Wind & weather model** — surface wind with a logarithmic boundary layer, **winds aloft by layer** (auto veer-and-strengthen profile or custom 3000/6000/9000 ft layers with per-layer turbulence), **gust surges** with direction swing (gusts change your airspeed by inertia), Dryden-style turbulence (more near the ground in strong wind), low-level wind shear, weathervaning on the ground. Weather station with runway head/crosswind calculator against the C172's 15 kt demonstrated crosswind, wind at 3000 ft, and a generated **ATIS**. PFD wind box shows head/tail and crosswind components; drift angle on the situation bar.

**Clarity** — situation bar (phase · next fix & constraint · altitude vs selected · wind with components and drift · minimums · IMC/VMC), a coach that only shows what to do now, a first-launch **guided tour**, and **Explain mode (F1)** that labels and explains every instrument in all three cockpits.

**Professional controls** — concentric dual encoders (knurled outer ring = coarse, inner knob = fine, push), live value read-outs, CRS/BARO dual knob, backlit bezel keys and physical softkeys under the G1000 screens. Settings: cockpit, time of day, graphics quality, **Pro mode** (no coach or info pop-ups), sound, SVT.

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

## Real-world data & pro tools

* **Real world** (Plan a flight → Real world): 6,900+ airports worldwide (OurAirports, public domain) and, for the
  United States, the FAA CIFP (ARINC 424, public domain): runways, ILS/LOC, 32k waypoints and 8,000+ instrument
  approaches with transitions and missed approaches. Real terrain from Terrarium elevation tiles. The region is
  rotated to magnetic north so published courses match the instruments. Minimums are derived (CIFP has none).
  Rebuild the data each AIRAC cycle: `node tools/navdata/build.mjs <ourairports-csv-dir> <FAACIFP18>`.
* **FMC CDU** (F3): RTE, DEP/ARR, LEGS (direct-to, constraints), HOLD, PROG, INIT/REF pages with MOD/EXEC.
* **EFB** (K): charts, airport data, navlog, METAR/TAF & winds aloft, checklists, CRAFT clearance pad.
* **Navigraph**: sign in (device flow) to read your Navigraph charts in the EFB with own-ship on georeferenced
  plates. Needs a Navigraph developer client: set `VITE_NAVIGRAPH_CLIENT_ID` / `VITE_NAVIGRAPH_CLIENT_SECRET`
  at build time or enter them in Connections.
* **ATC radio** with voice (radio phraseology), **aural callouts** (synthesised CC0 voice) and a chronometer.
* `node tools/ui-audit.cjs <outDir>` clicks every button and window and reports clipping/occlusion issues.

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
