// Who is using this device. A student sees no authoring actions (« Créer un cours ici », duplicate, export, share)
// until they open a teaching place: the Instructeurs page, « Nouveau cours », the course editor or the presenter
// (UX logic §5: « Instructors also see … »). One flag per browser, no account.
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
