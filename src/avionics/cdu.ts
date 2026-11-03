// FMC Control Display Unit (Boeing-style): 14 lines × 24 columns, 6 + 6 line-select keys, scratchpad,
// page keys and a MOD → EXEC workflow wired to the simulator's flight plan.
//
// Pages: INIT/REF index, IDENT, POS INIT, PERF INIT, TAKEOFF REF, APPROACH REF, RTE (1 & 2),
// DEP/ARR index, DEP, ARR, LEGS, HOLD, PROG.
import type { Sim } from "../sim/sim";
import { AIRPORTS, APPROACHES, findFix } from "../nav/data";
import { distanceNm, bearingDeg, type LatLon } from "../nav/geo";
import type { Waypoint } from "../nav/flightplan";
import type { Approach } from "../nav/types";

export const COLS = 24;
export type CduColor = "w" | "g" | "c" | "m" | "a" | "k"; // white, green, cyan, magenta, amber, grey (labels)
/** one display line: segments of text with colour and size (small font = labels) */
export interface Seg {
  t: string;
  c?: CduColor;
  small?: boolean;
  at?: number;
  right?: boolean;
  center?: boolean;
}
export type Line = Seg[];
export type CduKey =
  | "INIT REF"
  | "RTE"
  | "CLB"
  | "CRZ"
  | "DES"
  | "MENU"
  | "LEGS"
  | "DEP ARR"
  | "HOLD"
  | "PROG"
  | "EXEC"
  | "N1 LIMIT"
  | "FIX"
  | "PREV PAGE"
  | "NEXT PAGE"
  | "CLR"
  | "DEL"
  | "SP"
  | "/"
  | "+/-"
  | ".";

type Page =
  | "INDEX"
  | "IDENT"
  | "POS"
  | "PERF"
  | "TAKEOFF"
  | "APPROACH"
  | "RTE"
  | "DEPARR"
  | "DEP"
  | "ARR"
  | "LEGS"
  | "HOLD"
  | "PROG"
  | "MENU";

export interface FmcData {
  origin: string;
  dest: string;
  depRwy: string;
  flightNo: string;
  route: { via: string; to: string }[];
  approachId: string | null;
  transition: string | null;
  crzAlt: number | null;
  costIndex: number | null;
  zfw: number | null;
  fuel: number;
  reserves: number;
  v1: number | null;
  vr: number | null;
  v2: number | null;
  vref: number | null;
  activated: boolean;
}

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
const box = (n: number) => "□".repeat(n);
const dash = (n: number) => "-".repeat(n);
const deg = (x: number) =>
  `${String(Math.round(((x % 360) + 360) % 360) || 360).padStart(3, "0")}°`;
const fmtAlt = (a?: number | null) =>
  a == null
    ? "-----"
    : a >= 18000
      ? `FL${Math.round(a / 100)}`
      : String(Math.round(a));
const AIRAC = "2611";

/** shortest procedure label for the ARR page (e.g. ILS28R, RNV19RY) */
export function apLabel(a: Approach): string {
  const t =
    a.type === "RNAV"
      ? "RNV"
      : a.type === "LOCBC"
        ? "B"
        : a.type === "LOC"
          ? "LOC"
          : a.type === "LDA"
            ? "LDA"
            : a.type;
  const sfx = /\b([XYZ])\b/.exec(a.name)?.[1] ?? "";
  return `${t}${a.runway}${sfx ? "-" + sfx : ""}`;
}

export class Cdu {
  page: Page = "IDENT";
  sub = 0; // page number (0-based)
  scratch = "";
  msg = "";
  mod = false; // modification pending → EXEC lit
  private pendingHold: {
    fix: string;
    inbound: number;
    turn: "L" | "R";
    legMin: number;
  } | null = null;
  private pendingDirect: string | null = null;
  private arrSel: { ap: string | null; tr: string | null } = {
    ap: null,
    tr: null,
  };
  data: FmcData;

  constructor(private sim: Sim) {
    this.data = {
      origin: "",
      dest: "",
      depRwy: "",
      flightNo: "",
      route: [],
      approachId: null,
      transition: null,
      crzAlt: null,
      costIndex: null,
      zfw: null,
      fuel: 0,
      reserves: 0,
      v1: null,
      vr: null,
      v2: null,
      vref: null,
      activated: false,
    };
  }

  /** pre-fill from the current flight (called when a flight starts) */
  syncFromSim() {
    const s = this.sim;
    const ap = s.fp.approach;
    const near = [...AIRPORTS].sort(
      (a, b) => distanceNm(a, s.ac.s) - distanceNm(b, s.ac.s),
    )[0];
    this.data.origin =
      s.ac.s.onGround && near
        ? near.icao
        : this.data.origin || near?.icao || "";
    if (ap) {
      this.data.dest = ap.airport;
      this.data.approachId = ap.id;
    }
    this.data.fuel = Math.round(s.ac.s.fuelGal * 6);
    this.data.activated = s.fp.wpts.length > 1;
  }

  // ---------------------------------------------------------------- input
  type(ch: string) {
    if (this.msg) this.msg = "";
    if (this.scratch === "DELETE") this.scratch = "";
    if (this.scratch.length < COLS) this.scratch += ch.toUpperCase();
  }

  press(k: CduKey) {
    if (k === "CLR") {
      if (this.msg) this.msg = "";
      else this.scratch = this.scratch.slice(0, -1);
      return;
    }
    if (k === "DEL") return void (this.scratch = this.scratch ? "" : "DELETE");
    if (k === "SP") return this.type(" ");
    if (k === "/" || k === ".") return this.type(k);
    if (k === "+/-")
      return void (this.scratch = this.scratch.startsWith("-")
        ? this.scratch.slice(1)
        : "-" + this.scratch);
    if (k === "EXEC") return this.exec();
    if (k === "NEXT PAGE")
      return void (this.sub = Math.min(this.pages() - 1, this.sub + 1));
    if (k === "PREV PAGE") return void (this.sub = Math.max(0, this.sub - 1));
    const go: Partial<Record<CduKey, Page>> = {
      "INIT REF": "INDEX",
      RTE: "RTE",
      LEGS: "LEGS",
      "DEP ARR": "DEPARR",
      HOLD: "HOLD",
      PROG: "PROG",
      MENU: "MENU",
      "N1 LIMIT": "PERF",
      CLB: "PERF",
      CRZ: "PERF",
      DES: "PERF",
      FIX: "LEGS",
    };
    const p = go[k];
    if (p) {
      this.page = p;
      this.sub = 0;
    }
  }

  private take(): string {
    const v = this.scratch.trim();
    this.scratch = "";
    return v;
  }
  private err(m: string) {
    this.msg = m;
  }

  /** line-select key: side L/R, row 1..6 */
  lsk(side: "L" | "R", row: number) {
    const sp = this.scratch.trim();
    const d = this.data;
    switch (this.page) {
      case "INDEX": {
        const L: Page[] = ["IDENT", "POS", "PERF", "TAKEOFF", "APPROACH"];
        if (side === "L" && L[row - 1]) this.page = L[row - 1];
        if (side === "R" && row === 1) this.page = "RTE";
        break;
      }
      case "IDENT":
        if (side === "L" && row === 6) this.page = "INDEX";
        if (side === "R" && row === 6) this.page = "POS";
        break;
      case "POS":
        if (side === "L" && row === 2 && sp) {
          if (!AIRPORTS.some((a) => a.icao === sp))
            return this.err("NOT IN DATA BASE");
          d.origin = this.take();
        }
        if (side === "R" && row === 6) this.page = "RTE";
        if (side === "L" && row === 6) this.page = "INDEX";
        break;
      case "PERF": {
        const n = Number(sp.replace(/^FL/, ""));
        if (side === "L" && row === 1 && sp) d.zfw = Number(this.take());
        if (side === "L" && row === 2 && sp) d.fuel = Number(this.take());
        if (side === "L" && row === 3 && sp) d.reserves = Number(this.take());
        if (side === "R" && row === 1 && sp) {
          if (!n) return this.err("INVALID ENTRY");
          d.crzAlt = sp.startsWith("FL") ? n * 100 : n < 1000 ? n * 100 : n;
          this.take();
        }
        if (side === "R" && row === 2 && sp) d.costIndex = Number(this.take());
        if (side === "L" && row === 6) this.page = "INDEX";
        if (side === "R" && row === 6) this.page = "TAKEOFF";
        break;
      }
      case "TAKEOFF": {
        const v = Number(sp);
        if (side === "R" && row >= 1 && row <= 3 && sp) {
          if (!v || v < 40 || v > 200) return this.err("INVALID ENTRY");
          this.take();
          if (row === 1) d.v1 = v;
          if (row === 2) d.vr = v;
          if (row === 3) d.v2 = v;
        }
        if (side === "L" && row === 6) this.page = "INDEX";
        break;
      }
      case "APPROACH":
        if (side === "R" && row === 1 && sp) d.vref = Number(this.take());
        if (side === "R" && row === 1 && !sp)
          this.scratch = String(this.vrefCalc());
        if (side === "L" && row === 6) this.page = "INDEX";
        break;
      case "RTE":
        return this.lskRte(side, row);
      case "DEPARR":
        if (side === "L" && row === 1) {
          this.page = "DEP";
          this.sub = 0;
        }
        if (side === "R" && row === 2) {
          this.page = "ARR";
          this.sub = 0;
        }
        if (side === "R" && row === 1) {
          this.page = "ARR";
          this.sub = 0;
        }
        break;
      case "DEP": {
        const apt = AIRPORTS.find((a) => a.icao === d.origin);
        const rws = apt?.runways.map((r) => r.id) ?? [];
        const i = this.sub * 5 + row - 1;
        if (side === "R" && row <= 5 && rws[i]) {
          d.depRwy = rws[i];
          this.mod = true;
        }
        if (side === "L" && row === 6) this.page = "DEPARR";
        if (side === "R" && row === 6) this.page = "RTE";
        break;
      }
      case "ARR":
        return this.lskArr(side, row);
      case "LEGS":
        return this.lskLegs(side, row);
      case "HOLD":
        return this.lskHold(side, row);
      case "PROG":
        break;
      case "MENU":
        if (side === "L" && row === 1) this.page = "IDENT";
        break;
    }
  }

  private lskRte(side: "L" | "R", row: number) {
    const d = this.data;
    const sp = this.scratch.trim();
    if (this.sub === 0) {
      if (side === "L" && row === 1 && sp) {
        if (!AIRPORTS.some((a) => a.icao === sp))
          return this.err("NOT IN DATA BASE");
        d.origin = this.take();
        this.mod = true;
      }
      if (side === "R" && row === 1 && sp) {
        if (!AIRPORTS.some((a) => a.icao === sp))
          return this.err("NOT IN DATA BASE");
        d.dest = this.take();
        this.mod = true;
      }
      if (side === "L" && row === 2 && sp) {
        const apt = AIRPORTS.find((a) => a.icao === d.origin);
        const id = sp.replace(/^RW/, "");
        if (!apt?.runways.some((r) => r.id === id))
          return this.err("NOT IN DATA BASE");
        d.depRwy = id;
        this.take();
        this.mod = true;
      }
      if (side === "R" && row === 2 && sp) d.flightNo = this.take();
      if (side === "R" && row === 6) {
        if (!d.origin || !d.dest) return this.err("ROUTE INCOMPLETE");
        this.mod = true;
        this.msg = "";
      }
      return;
    }
    // page 2..: VIA / TO
    const i = (this.sub - 1) * 5 + row - 1;
    if (row > 5) return;
    if (sp === "DELETE") {
      d.route.splice(i, 1);
      this.scratch = "";
      this.mod = true;
      return;
    }
    if (!sp) return;
    if (side === "R" || side === "L") {
      const to =
        side === "R" ? sp : sp === "DIRECT" || sp === "DCT" ? null : sp;
      if (side === "L" && to) {
        // airway names are accepted as DIRECT (airway database not loaded)
        this.take();
        if (!d.route[i]) d.route[i] = { via: "DIRECT", to: "" };
        d.route[i].via = "DIRECT";
        this.mod = true;
        return;
      }
      if (!findFix(sp)) return this.err("NOT IN DATA BASE");
      this.take();
      if (i < d.route.length) d.route[i] = { via: "DIRECT", to: sp };
      else d.route.push({ via: "DIRECT", to: sp });
      this.mod = true;
    }
  }

  private arrApproaches(): Approach[] {
    return APPROACHES.filter((a) => a.airport === this.data.dest);
  }
  private lskArr(side: "L" | "R", row: number) {
    const aps = this.arrApproaches();
    if (side === "L" && row === 6) return void (this.page = "DEPARR");
    if (side === "R" && row === 6) return void (this.page = "RTE");
    if (side === "R" && row <= 5) {
      const a = aps[this.sub * 5 + row - 1];
      if (!a) return;
      this.arrSel = { ap: a.id, tr: null };
      this.data.approachId = a.id;
      this.data.transition = null;
      this.mod = true;
    }
    if (side === "L" && row <= 5 && this.arrSel.ap) {
      const a = aps.find((x) => x.id === this.arrSel.ap);
      const tr = a?.transitions[row - 1];
      if (tr) {
        this.arrSel.tr = tr.name;
        this.data.transition = tr.name;
        this.mod = true;
      }
    }
  }

  private lskLegs(side: "L" | "R", row: number) {
    const fp = this.sim.fp;
    const i = fp.active + this.sub * 5 + row - 1;
    const sp = this.scratch.trim();
    if (row === 6) return;
    if (side === "L") {
      if (!sp) {
        // copy the waypoint ident to the scratchpad
        const w = fp.wpts[i];
        if (w) this.scratch = w.ident;
        return;
      }
      if (row === 1 && this.sub === 0) {
        if (!findFix(sp)) return this.err("NOT IN DATA BASE");
        this.pendingDirect = this.take();
        this.mod = true;
        return;
      }
      return this.err("INVALID ENTRY");
    }
    // right: altitude constraint
    const w = fp.wpts[i];
    if (!w || !sp) return;
    const v = sp.replace(/[AB]$/, "").replace(/^FL/, "");
    const n = Number(v.split("/").pop());
    if (!n) return this.err("INVALID ENTRY");
    w.altMin = sp.startsWith("FL") || n < 1000 ? n * 100 : n;
    this.take();
  }

  private lskHold(side: "L" | "R", row: number) {
    const sp = this.scratch.trim();
    if (!this.pendingHold) {
      if (side === "L" && row === 6 && sp) {
        if (!findFix(sp)) return this.err("NOT IN DATA BASE");
        const f = findFix(sp)!;
        const fp = this.sim.fp;
        const prev = fp.wpts[fp.active - 1] ?? this.sim.ac.s;
        this.pendingHold = {
          fix: this.take(),
          inbound: Math.round(bearingDeg(prev, f)),
          turn: "R",
          legMin: 1,
        };
        this.mod = true;
      }
      return;
    }
    const h = this.pendingHold;
    if (side === "L" && row === 3 && sp) {
      const m = /^(\d{1,3})?(?:\/?([LR]))?$/.exec(sp.replace("°", ""));
      if (!m) return this.err("INVALID ENTRY");
      if (m[1]) h.inbound = Number(m[1]) % 360;
      if (m[2]) h.turn = m[2] as "L" | "R";
      this.take();
    }
    if (side === "L" && row === 4 && sp) {
      const n = Number(sp);
      if (!n || n > 5) return this.err("INVALID ENTRY");
      h.legMin = n;
      this.take();
    }
  }

  // ---------------------------------------------------------------- EXEC
  private exec() {
    if (!this.mod) return;
    const s = this.sim;
    const d = this.data;
    if (this.pendingDirect) {
      s.directTo(this.pendingDirect);
      this.pendingDirect = null;
    } else if (this.pendingHold) {
      const h = this.pendingHold;
      const f = findFix(h.fix)!;
      s.fp.setHold(
        { ident: f.ident, lat: f.lat, lon: f.lon },
        h.inbound,
        h.turn,
        h.legMin,
        s.ac.s,
        Math.round(s.indicatedAlt() / 100) * 100,
      );
      this.pendingHold = null;
      this.page = "LEGS";
    } else {
      // route: PPOS → route fixes → arrival
      const pts: Waypoint[] = [
        { ident: "PPOS", lat: s.ac.s.lat, lon: s.ac.s.lon },
      ];
      for (const r of d.route) {
        const f = findFix(r.to);
        if (f)
          pts.push({
            ident: f.ident,
            lat: f.lat,
            lon: f.lon,
            altMin: d.crzAlt ?? undefined,
          });
      }
      if (pts.length > 1) s.fp.setEnroute(pts);
      if (d.approachId)
        s.loadApproach(
          d.approachId,
          d.transition,
          pts.length > 1 ? "load" : "activate",
        );
      d.activated = true;
    }
    this.mod = false;
  }

  private vrefCalc(): number {
    // simple VREF for the simulated aircraft (flaps 30): 1.3 × Vs0
    return 61;
  }

  pages(): number {
    switch (this.page) {
      case "RTE":
        return 1 + Math.max(1, Math.ceil((this.data.route.length + 1) / 5));
      case "LEGS":
        return Math.max(
          1,
          Math.ceil((this.sim.fp.wpts.length - this.sim.fp.active) / 5),
        );
      case "ARR":
        return Math.max(1, Math.ceil(this.arrApproaches().length / 5));
      case "DEP":
        return Math.max(
          1,
          Math.ceil(
            (AIRPORTS.find((a) => a.icao === this.data.origin)?.runways
              .length ?? 0) / 5,
          ),
        );
      case "PROG":
        return 2;
      default:
        return 1;
    }
  }

  // ---------------------------------------------------------------- display
  /** returns the 14 display lines (title, 6 × [label, data], scratchpad) */
  screen(): Line[] {
    const L: Line[] = Array.from({ length: 14 }, () => []);
    const title = (t: string, act = false) => {
      L[0] = [
        {
          t: `${this.mod && /RTE|LEGS|HOLD|ARR|DEP/.test(this.page) ? "MOD " : act ? "ACT " : ""}${t}`,
          c: "w",
          center: true,
        },
      ];
      const n = this.pages();
      if (n > 1)
        L[0].push({
          t: `${this.sub + 1}/${n}`,
          c: "w",
          right: true,
          small: true,
        });
    };
    const label = (row: number, left: string, right = "", center = "") => {
      const i = row * 2 - 1;
      L[i] = [];
      if (left) L[i].push({ t: left, c: "k", small: true });
      if (center) L[i].push({ t: center, c: "k", small: true, center: true });
      if (right) L[i].push({ t: right, c: "k", small: true, right: true });
    };
    const data = (
      row: number,
      left: Seg | string | null,
      right: Seg | string | null = null,
    ) => {
      const i = row * 2;
      L[i] = [];
      const seg = (x: Seg | string, r: boolean): Seg =>
        typeof x === "string" ? { t: x, c: "w", right: r } : { ...x, right: r };
      if (left) L[i].push(seg(left, false));
      if (right) L[i].push(seg(right, true));
    };
    const d = this.data;
    const s = this.sim;
    const fp = s.fp;
    switch (this.page) {
      case "MENU":
        title("MENU");
        data(1, "<FMC", "");
        label(6, "", "");
        break;
      case "INDEX":
        title("INIT/REF INDEX");
        data(1, "<IDENT", "NAV DATA>");
        data(2, "<POS");
        data(3, "<PERF");
        data(4, "<TAKEOFF");
        data(5, "<APPROACH");
        break;
      case "IDENT":
        title("IDENT");
        label(1, " MODEL", "ENG RATING ");
        data(
          1,
          s.cockpitEyeFt > 10 ? "737-800W" : "C172S G1000",
          s.cockpitEyeFt > 10 ? "26K" : "IO-360",
        );
        label(2, " NAV DATA", "ACTIVE ");
        data(2, `IFR${AIRAC}`, "NOV06DEC03/26");
        label(3, " DRAG/FF");
        data(3, "+0.0/+0.0");
        label(4, " OP PROGRAM");
        data(4, "U13.0 IFRT");
        data(6, "<INDEX", "POS INIT>");
        break;
      case "POS": {
        title("POS INIT");
        const ref = AIRPORTS.find((a) => a.icao === d.origin);
        label(1, "", "LAST POS ");
        data(1, null, { t: this.ll(s.ac.s), c: "w" });
        label(2, " REF AIRPORT");
        data(
          2,
          d.origin ? { t: d.origin, c: "w" } : { t: box(4), c: "w" },
          ref ? { t: this.ll(ref), c: "w" } : null,
        );
        label(3, " GATE");
        data(3, "-----");
        label(4, " UTC", "GPS POS ");
        data(
          4,
          `${new Date().toISOString().slice(11, 16).replace(":", "")}z`,
          this.ll(s.ac.s),
        );
        label(5, "", "SET IRS POS ");
        data(5, null, { t: "°□□□□□ □□□□□°", c: "w" });
        data(6, "<INDEX", "ROUTE>");
        break;
      }
      case "PERF":
        title("PERF INIT");
        label(1, " ZFW", "CRZ ALT ");
        data(
          1,
          d.zfw ? String(d.zfw) : box(5),
          d.crzAlt ? fmtAlt(d.crzAlt) : box(5),
        );
        label(2, " PLAN/FUEL", "COST INDEX ");
        data(
          2,
          `${d.fuel || "--"}`,
          d.costIndex != null ? String(d.costIndex) : box(3),
        );
        label(3, " RESERVES", "TRANS ALT ");
        data(3, d.reserves ? String(d.reserves) : box(4), "18000");
        label(4, " CRZ CG", "CRZ WIND ");
        data(4, "12.0%", "---°/---");
        data(6, "<INDEX", "TAKEOFF>");
        break;
      case "TAKEOFF":
        title("TAKEOFF REF");
        label(1, " FLAPS", "V1 ");
        data(1, "05°", d.v1 ? `${d.v1}` : "---");
        label(2, " THRUST", "VR ");
        data(2, "TO", d.vr ? `${d.vr}` : "---");
        label(3, " CG", "V2 ");
        data(3, "12.0%", d.v2 ? `${d.v2}` : "---");
        label(4, ` RWY ${d.depRwy || "--"}`, "POS ");
        data(4, d.origin || "----", "+0000");
        data(6, "<INDEX", "");
        break;
      case "APPROACH": {
        title("APPROACH REF");
        const ap = APPROACHES.find((a) => a.id === d.approachId);
        label(1, " GROSS WT", "FLAPS   VREF ");
        data(1, "2300", `30°/${d.vref ?? this.vrefCalc()}KT`);
        label(2, ` ${d.dest || "----"}`);
        data(2, ap ? `${ap.name.replace(/ RWY /, " ")}` : "-----");
        label(3, " RWY LENGTH");
        const rw = ap
          ? AIRPORTS.find((a) => a.icao === ap.airport)?.runways.find(
              (r) => r.id === ap.runway,
            )
          : null;
        data(
          3,
          rw
            ? `${rw.lengthFt}FT ${Math.round(rw.lengthFt * 0.3048)}M`
            : "-----",
        );
        label(4, " ILS / CRS");
        data(4, ap?.navaid ? `${ap.navaid}/${deg(ap.finalCourse)}` : "-----");
        data(6, "<INDEX", "");
        break;
      }
      case "RTE": {
        title("RTE 1", d.activated && !this.mod);
        if (this.sub === 0) {
          label(1, " ORIGIN", "DEST ");
          data(1, d.origin || box(4), d.dest || box(4));
          label(2, " RUNWAY", "FLT NO ");
          data(
            2,
            d.depRwy ? `RW${d.depRwy}` : "-----",
            d.flightNo || "--------",
          );
          label(3, " ROUTE", "CO ROUTE ");
          data(3, "<LOAD", "----------");
          data(
            6,
            "<RTE 2",
            this.mod ? "ACTIVATE>" : d.activated ? "PERF INIT>" : "ACTIVATE>",
          );
        } else {
          label(1, " VIA", "TO ");
          const rows = d.route.slice((this.sub - 1) * 5, this.sub * 5);
          for (let i = 0; i < 5; i++) {
            const r = rows[i];
            if (r)
              data(
                i + 1,
                { t: r.via, c: this.mod ? "w" : "c" },
                { t: r.to, c: this.mod ? "w" : "c" },
              );
            else if (i === rows.length) data(i + 1, "-----", "-----");
          }
          data(6, "<RTE 1", "ACTIVATE>");
        }
        break;
      }
      case "DEPARR":
        title("DEP/ARR INDEX");
        label(1, "", "", "ACT RTE 1");
        data(1, `<DEP   ${pad(d.origin || "----", 4)}`, "ARR>");
        data(2, "", `${d.dest || "----"}   ARR>`);
        label(6, "", "", "DEP      OTHER      ARR");
        data(6, "<----", "---->");
        break;
      case "DEP": {
        title(`${d.origin || "----"} DEPARTURES`);
        const apt = AIRPORTS.find((a) => a.icao === d.origin);
        label(1, " SIDS", "RUNWAYS ");
        const rws = apt?.runways.slice(this.sub * 5, this.sub * 5 + 5) ?? [];
        rws.forEach((r, i) =>
          data(i + 1, i === 0 ? { t: "-NONE-", c: "k" } : null, {
            t: `${r.id === d.depRwy ? "<SEL> " : ""}${r.id}`,
            c: r.id === d.depRwy ? "g" : "w",
          }),
        );
        data(6, "<INDEX", "ROUTE>");
        break;
      }
      case "ARR": {
        title(`${d.dest || "----"} ARRIVALS`);
        const aps = this.arrApproaches();
        label(1, " TRANS", "APPROACHES ");
        const sel = aps.find((a) => a.id === d.approachId);
        const list = aps.slice(this.sub * 5, this.sub * 5 + 5);
        for (let i = 0; i < 5; i++) {
          const a = list[i];
          const tr = sel?.transitions[i];
          data(
            i + 1,
            tr
              ? {
                  t: `${tr.name}${tr.name === d.transition ? " <SEL>" : ""}`,
                  c: tr.name === d.transition ? "g" : "w",
                }
              : i === 0 && sel
                ? { t: "-VECTORS-", c: d.transition ? "w" : "g" }
                : null,
            a
              ? {
                  t: `${a.id === d.approachId ? "<SEL> " : ""}${apLabel(a)}`,
                  c: a.id === d.approachId ? "g" : "w",
                }
              : null,
          );
        }
        if (!aps.length) data(1, null, { t: "NO APPROACHES", c: "k" });
        data(6, "<INDEX", "ROUTE>");
        break;
      }
      case "LEGS": {
        title("RTE 1 LEGS", !this.mod && fp.wpts.length > 1);
        if (this.pendingDirect) {
          label(
            1,
            ` ${deg(bearingDeg(s.ac.s, findFix(this.pendingDirect)!))}`,
            `${distanceNm(s.ac.s, findFix(this.pendingDirect)!).toFixed(0)}NM `,
          );
          data(1, { t: this.pendingDirect, c: "w" }, "---/-----");
          break;
        }
        const rows = fp.wpts.slice(
          fp.active + this.sub * 5,
          fp.active + this.sub * 5 + 5,
        );
        if (!rows.length) {
          data(1, { t: "-- NO ROUTE --", c: "k" });
          data(6, "<RTE 1", "");
          break;
        }
        rows.forEach((w, i) => {
          const gi = fp.active + this.sub * 5 + i;
          const prev = gi === fp.active ? s.ac.s : fp.wpts[gi - 1];
          const active = gi === fp.active;
          label(
            i + 1,
            ` ${w.hold ? "HOLD AT" : deg(bearingDeg(prev, w))}`,
            `${distanceNm(prev, w).toFixed(distanceNm(prev, w) < 10 ? 1 : 0)}NM `,
          );
          data(
            i + 1,
            {
              t: `${w.ident}${w.role === "FAF" ? " FAF" : w.role === "MAP" ? " MAP" : ""}`,
              c: active ? "m" : "w",
            },
            {
              t: `${s.cockpitEyeFt > 10 ? "210" : "---"}/${w.altMin ? fmtAlt(w.altMin) : "-----"}`,
              c: active ? "m" : "w",
            },
          );
        });
        label(6, dash(24).replace(/^-+/, ""), "");
        data(6, "<RTE 2 LEGS", "RTE DATA>");
        break;
      }
      case "HOLD": {
        if (!this.pendingHold) {
          title(fp.out.holding ? "ACT RTE 1 HOLD" : "RTE 1 LEGS");
          if (fp.out.holding) {
            const w = fp.wpts[fp.active];
            label(1, " FIX", "SPD/TGT ALT ");
            data(1, w?.ident ?? "", `---/${fmtAlt(w?.altMin)}`);
            label(2, " QUAD/RADIAL", "FIX ETA ");
            data(2, "--/---°", "----z");
            label(3, " INBD CRS/DIR", "EFC TIME ");
            data(
              3,
              `${deg(w?.hold?.inbound ?? 0)}/${w?.hold?.turn ?? "R"} TURN`,
              "----z",
            );
            label(4, " LEG TIME", "HOLD AVAIL ");
            data(4, `${(w?.hold?.legMin ?? 1).toFixed(1)} MIN`, "----");
            data(6, null, { t: "EXIT HOLD>", c: "w" });
          } else {
            label(6, "------- HOLD AT -------");
            data(6, { t: box(5), c: "w" }, "");
          }
        } else {
          const h = this.pendingHold;
          title("MOD RTE 1 HOLD");
          label(1, " FIX", "SPD/TGT ALT ");
          data(
            1,
            h.fix,
            `---/${fmtAlt(Math.round(s.indicatedAlt() / 100) * 100)}`,
          );
          label(2, " QUAD/RADIAL");
          data(2, "--/---°");
          label(3, " INBD CRS/DIR");
          data(3, `${deg(h.inbound)}/${h.turn} TURN`);
          label(4, " LEG TIME");
          data(4, `${h.legMin.toFixed(1)} MIN`);
          label(5, " LEG DIST");
          data(5, "--.-NM");
          data(6, "<ERASE", "");
        }
        break;
      }
      case "PROG": {
        title(`${d.flightNo || "IFRSIM"} PROGRESS`);
        const o = fp.out;
        const w = fp.wpts[fp.active];
        const gs = Math.max(30, s.ac.data.gsKt);
        const eta = (nm: number) => {
          const t = new Date(Date.now() + (nm / gs) * 3600_000);
          return `${t.toISOString().slice(11, 13)}${t.toISOString().slice(14, 16)}z`;
        };
        if (this.sub === 0) {
          label(1, " TO", "DTG   ETA    FUEL ");
          data(
            1,
            w ? { t: w.ident, c: "m" } : "-----",
            o.valid
              ? `${o.distNm.toFixed(0)}  ${eta(o.distNm)}  ${((s.ac.s.fuelGal * 6) / 1000).toFixed(1)}`
              : "",
          );
          const nx = fp.wpts[fp.active + 1];
          label(2, " NEXT");
          data(
            2,
            nx ? nx.ident : "-----",
            nx && w
              ? `${(o.distNm + distanceNm(w, nx)).toFixed(0)}  ${eta(o.distNm + distanceNm(w, nx))}`
              : "",
          );
          label(3, ` DEST`);
          const dest = AIRPORTS.find((a) => a.icao === d.dest);
          data(
            3,
            d.dest || "----",
            dest
              ? `${distanceNm(s.ac.s, dest).toFixed(0)}  ${eta(distanceNm(s.ac.s, dest))}`
              : "",
          );
          label(4, " ALT", "TO T/D ");
          data(4, fmtAlt(s.indicatedAlt()), "----");
          label(5, " XTK ERROR", "DTK  TRK ");
          data(
            5,
            o.valid
              ? `${o.xtkNm >= 0 ? "R" : "L"}${Math.abs(o.xtkNm).toFixed(1)}NM`
              : "-----",
            o.valid ? `${deg(o.dtk)} ${deg(s.ac.data.trackTrue)}` : "",
          );
          data(6, "<POS REPORT", "POS REF>");
        } else {
          const wd = s.ac.data;
          label(1, " H/WIND", "WIND ");
          data(
            1,
            `${wd.headwindKt >= 0 ? "H" : "T"}${Math.abs(Math.round(wd.headwindKt))}KT`,
            `${deg(wd.windDir)}/${Math.round(wd.windKt)}KT`,
          );
          label(2, " X/WIND", "SAT ");
          data(
            2,
            `${wd.crosswindKt >= 0 ? "R" : "L"}${Math.abs(Math.round(wd.crosswindKt))}KT`,
            `${Math.round(wd.oatC)}°C`,
          );
          label(3, " GS", "TAS ");
          data(3, `${Math.round(wd.gsKt)}KT`, `${Math.round(wd.tasKt)}KT`);
          label(4, " FUEL USED", "FUEL QTY ");
          data(
            4,
            `${Math.round((53 - s.ac.s.fuelGal) * 6)}`,
            `${Math.round(s.ac.s.fuelGal * 6)}`,
          );
        }
        break;
      }
    }
    L[13] = this.msg
      ? [{ t: this.msg, c: "w" }]
      : [{ t: this.scratch, c: "w" }];
    return L;
  }

  private ll(p: LatLon): string {
    const la = Math.abs(p.lat),
      lo = Math.abs(p.lon);
    const m = (x: number) => ((x % 1) * 60).toFixed(1).padStart(4, "0");
    return `${p.lat >= 0 ? "N" : "S"}${Math.floor(la)}°${m(la)} ${p.lon >= 0 ? "E" : "W"}${String(Math.floor(lo)).padStart(3, "0")}°${m(lo)}`;
  }
}
