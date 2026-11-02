# IFR Trainer — browser IFR simulator

G1000-style glass cockpit (PFD + MFD with bezel knobs/softkeys), GFC700-class autopilot, every approach type with generated approach plates, joystick support and scored debriefs. Built for flight-school use.

**Approaches:** ILS (CAT I), LOC-only, LOC back course, VOR/DME with step-downs, NDB (ADF), RNAV LPV, RNAV LNAV/VNAV, LNAV, circling minima, published holds and missed approaches.

**Features**
- PFD: attitude with synthetic vision & flight-path marker, speed/altitude tapes with trend vectors, VSI, HSI with CDI/bearing pointers, GS/GP indicator, marker beacon, minimums, AP annunciator, inset map.
- MFD: engine strip, moving map with terrain, flight plan page.
- Out-the-window view with cloud layer, fog and runway lighting (breaking out at minimums).
- Flight plan / GPS: Direct-To, load/activate approach, vectors-to-final, leg sequencing, SUSP at MAP, missed approach, hold steering, ENR/TERM/APR CDI scaling.
- Charts drawer: approach plates & airport diagrams with zoom/pan, night mode and own-ship on the plate.
- Joystick/yoke/HOTAS/gamepad via the Gamepad API with click-to-assign mapping, invert, curves, persisted per device.
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
