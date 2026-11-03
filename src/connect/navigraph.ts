// Navigraph integration (official SDK, loaded on demand): device-flow sign-in and the Charts API, so a
// subscriber sees the real Jeppesen/Navigraph charts in the EFB, with own-ship on georeferenced plates.
//
// Credentials: a Navigraph developer client (https://developers.navigraph.com). Either baked in at build
// time (VITE_NAVIGRAPH_CLIENT_ID / VITE_NAVIGRAPH_CLIENT_SECRET) or entered in Connections.
import { store } from "../ui/dom";

export interface NgChart {
  id: string;
  name: string;
  index_number: string;
  category: "APT" | "REF" | "ARR" | "DEP" | "APP";
  width: number;
  height: number;
  is_georeferenced: boolean;
  bounding_boxes: {
    planview: {
      pixels: { x1: number; y1: number; x2: number; y2: number };
      latlng: { lng1: number; lat1: number; lng2: number; lat2: number };
    };
  } | null;
  procedures: string[];
  runways: string[];
}
export interface NgUser {
  preferred_username?: string;
  name?: string;
  subscriptions?: string[];
}
export type NgStatus =
  | "unconfigured"
  | "signed-out"
  | "pending"
  | "signed-in"
  | "error";

interface Cfg {
  clientId: string;
  clientSecret: string;
}
const env = (
  import.meta as unknown as { env: Record<string, string | undefined> }
).env;

export function navigraphConfig(): Cfg | null {
  const s = store.get<Cfg | null>("ifr.navigraph.cfg", null);
  const id = s?.clientId || env.VITE_NAVIGRAPH_CLIENT_ID;
  const secret = s?.clientSecret || env.VITE_NAVIGRAPH_CLIENT_SECRET;
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}
export function setNavigraphConfig(c: Cfg | null) {
  store.set("ifr.navigraph.cfg", c);
  api = null;
}

type Api = {
  auth: {
    signInWithDeviceFlow: (
      cb: (p: {
        verification_uri_complete: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
      }) => void,
    ) => Promise<NgUser>;
    signOut: () => Promise<void>;
    getUser: (verify?: boolean) => Promise<NgUser | null> | NgUser | null;
    onAuthStateChanged: (
      cb: (u: NgUser | null) => void,
      initial?: boolean,
    ) => () => void;
  };
  charts: {
    getChartsIndex: (p: { icao: string }) => Promise<NgChart[] | null>;
    getChartImage: (p: {
      chart: NgChart;
      theme?: "light" | "dark";
    }) => Promise<Blob | null>;
  };
};
let api: Api | null = null;
let user: NgUser | null = null;
const listeners = new Set<(s: NgStatus, u: NgUser | null) => void>();
let status: NgStatus = navigraphConfig() ? "signed-out" : "unconfigured";

function emit(s: NgStatus) {
  status = s;
  for (const l of listeners) l(s, user);
}
export function onNavigraph(
  cb: (s: NgStatus, u: NgUser | null) => void,
): () => void {
  listeners.add(cb);
  cb(status, user);
  return () => listeners.delete(cb);
}
export const navigraphStatus = () => status;
export const navigraphUser = () => user;

async function getApi(): Promise<Api | null> {
  if (api) return api;
  const cfg = navigraphConfig();
  if (!cfg) {
    emit("unconfigured");
    return null;
  }
  const [{ initializeApp, Scope }, authMod, chartsMod] = await Promise.all([
    import("navigraph/app"),
    import("navigraph/auth"),
    import("navigraph/charts"),
  ]);
  initializeApp({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    scopes: [Scope.CHARTS],
  });
  api = {
    auth: authMod.getAuth() as unknown as Api["auth"],
    charts: chartsMod.getChartsAPI() as unknown as Api["charts"],
  };
  api.auth.onAuthStateChanged((u) => {
    user = u;
    emit(u ? "signed-in" : "signed-out");
  }, true);
  return api;
}

/** Device-flow sign-in: `onCode` receives the URL + code to show (QR / link). */
export async function navigraphSignIn(
  onCode: (p: { url: string; code: string }) => void,
): Promise<void> {
  const a = await getApi();
  if (!a) return;
  emit("pending");
  try {
    user = await a.auth.signInWithDeviceFlow((p) =>
      onCode({ url: p.verification_uri_complete, code: p.user_code }),
    );
    emit("signed-in");
  } catch (e) {
    console.warn("Navigraph sign-in failed", e);
    emit("error");
  }
}
export async function navigraphSignOut() {
  const a = await getApi();
  await a?.auth.signOut();
  user = null;
  emit("signed-out");
}
/** restore a previous session silently (refresh token kept by the SDK) */
export async function navigraphRestore() {
  if (!navigraphConfig()) return;
  await getApi();
}

export async function navigraphCharts(icao: string): Promise<NgChart[]> {
  const a = await getApi();
  if (!a || status !== "signed-in") return [];
  return (await a.charts.getChartsIndex({ icao })) ?? [];
}
const imgCache = new Map<string, string>();
export async function navigraphChartImage(
  chart: NgChart,
  dark = false,
): Promise<string | null> {
  const k = `${chart.id}|${dark}`;
  if (imgCache.has(k)) return imgCache.get(k)!;
  const a = await getApi();
  if (!a) return null;
  const blob = await a.charts.getChartImage({
    chart,
    theme: dark ? "dark" : "light",
  });
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  imgCache.set(k, url);
  return url;
}

/** pixel position of a real-world point on a georeferenced chart's plan view (null if outside / not georeferenced) */
export function chartPixel(
  chart: NgChart,
  lat: number,
  lon: number,
): { x: number; y: number } | null {
  const bb = chart.bounding_boxes?.planview;
  if (!chart.is_georeferenced || !bb) return null;
  const { pixels: p, latlng: g } = bb;
  const x = p.x1 + ((lon - g.lng1) / (g.lng2 - g.lng1)) * (p.x2 - p.x1);
  const y = p.y1 + ((lat - g.lat1) / (g.lat2 - g.lat1)) * (p.y2 - p.y1);
  return { x, y };
}
