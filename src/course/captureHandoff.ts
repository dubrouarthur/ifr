// The round trip of « Capturer un moment pour la diapo » (studio → cockpit → studio), in one small module both sides
// read (no simulator code here: the studio loads it at once).
//
//   captureLink()        index.html?capture=<course>&step=<slide>&scene=<code>&return=<studio URL with &s=<slide>>
//   studioReturnHref()   the studio URL to come back to, always on the slide the capture is for
//   flying / choice      what the tab remembers between the two pages (sessionStorage): the author left for the cockpit
//                        from this slide at this time; « Utiliser pour la diapo » chose this capture for it.
// Storage can be blocked (private browsing, blocked site data): every read and write is guarded, and a choice that
// cannot be kept simply waits in « Vos captures » for the author to pick it there.

export const FLYING_KEY = "ifr.course.flying";
export const CHOICE_KEY = "ifr.capture.choice";
/** a choice older than this is not applied any more (the author came back another way, much later) */
const CHOICE_MAX_MS = 6 * 3600 * 1000;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
const session = (): KV | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

/** The studio URL to come back to, on this slide: `#edit=<course>&s=<step>` (other hashes are left as they are). */
export function studioReturnHref(
  href: string,
  courseId: string,
  stepId?: string,
): string {
  const i = href.indexOf("#");
  const base = i < 0 ? href : href.slice(0, i);
  const hash = i < 0 ? "" : href.slice(i + 1);
  if (hash && !/^edit=/.test(hash)) return href;
  return `${base}#edit=${encodeURIComponent(courseId)}${stepId ? `&s=${encodeURIComponent(stepId)}` : ""}`;
}

/** The cockpit link of a capture for a slide. */
export function captureLink(o: {
  courseId: string;
  stepId?: string;
  sceneCode?: string;
  returnHref: string;
}): string {
  const q = [`capture=${encodeURIComponent(o.courseId)}`];
  if (o.stepId) q.push(`step=${encodeURIComponent(o.stepId)}`);
  if (o.sceneCode) q.push(`scene=${o.sceneCode}`);
  q.push(
    `return=${encodeURIComponent(studioReturnHref(o.returnHref, o.courseId, o.stepId))}`,
  );
  return `index.html?${q.join("&")}`;
}

export interface Flying {
  course: string;
  step?: string;
  /** when the author left for the cockpit (ms): the captures made after it are the new ones */
  at: number;
}
/** the author leaves for the cockpit (false: the tab keeps nothing) */
export function markFlying(f: Flying, kv: KV | null = session()): boolean {
  try {
    kv?.setItem(FLYING_KEY, JSON.stringify(f));
    return !!kv;
  } catch {
    return false;
  }
}
/** back in the studio: the departure for this course, read once (an older plain course id is read too) */
export function takeFlying(
  courseId: string,
  kv: KV | null = session(),
): Flying | null {
  try {
    const raw = kv?.getItem(FLYING_KEY);
    if (!raw) return null;
    let f: Flying | null = null;
    if (raw === courseId) f = { course: courseId, at: 0 };
    else {
      const v = JSON.parse(raw) as Partial<Flying>;
      if (v && v.course === courseId)
        f = {
          course: courseId,
          at: typeof v.at === "number" ? v.at : 0,
          ...(typeof v.step === "string" ? { step: v.step } : {}),
        };
    }
    if (f) kv?.removeItem(FLYING_KEY);
    return f;
  } catch {
    return null;
  }
}

export interface CaptureChoice {
  course: string;
  step?: string;
  /** the tray item chosen */
  item: string;
  at: number;
}
/** « Utiliser pour la diapo » in the cockpit (false: storage blocked, the author picks it in the studio) */
export function setCaptureChoice(
  c: CaptureChoice,
  kv: KV | null = session(),
): boolean {
  try {
    if (!kv) return false;
    kv.setItem(CHOICE_KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}
/** back in the studio: the capture chosen for this course, read once */
export function takeCaptureChoice(
  courseId: string,
  now = Date.now(),
  kv: KV | null = session(),
): CaptureChoice | null {
  try {
    const raw = kv?.getItem(CHOICE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CaptureChoice>;
    if (!v || v.course !== courseId || typeof v.item !== "string") return null;
    kv?.removeItem(CHOICE_KEY);
    if (typeof v.at !== "number" || now - v.at > CHOICE_MAX_MS) return null;
    return {
      course: courseId,
      item: v.item,
      at: v.at,
      ...(typeof v.step === "string" ? { step: v.step } : {}),
    };
  } catch {
    return null;
  }
}
