// Who is using this device. A student sees no authoring actions (« Créer un cours ici », duplicate, export) until
// they say they teach: « Je suis instructeur » on the Instructeurs page, or by opening « Nouveau cours », the course
// editor or the presenter (UX logic §5, audit §18: visiting Instructeurs alone no longer turns them on). One flag
// per browser, no account.
const KEY = "ifr.teach";

/** true once this browser has opened a teaching place */
export function isTeaching(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
/** a teaching place was opened: the authoring actions show from now on */
export function markTeaching(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode: the actions show for this page only */
  }
}
/** « Je suis instructeur » on the Instructeurs page: on or off */
export function setTeaching(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
