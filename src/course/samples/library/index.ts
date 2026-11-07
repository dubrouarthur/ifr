// Ground school — the course library: every author's registry, in one list, in program order. The samples index
// (../index.ts) appends it to SAMPLES, so a registered course is listed, playable (#play=<id>), validated and run
// through the readability guard like every other sample. Authors never edit this file: they edit their own
// registry (reg-a1.ts … reg-a5.ts) and their own course files.
import type { L10n } from "../../types";
import { REG_A1 } from "./reg-a1";
import { REG_A2 } from "./reg-a2";
import { REG_A3 } from "./reg-a3";
import { REG_A4 } from "./reg-a4";
import { REG_A5 } from "./reg-a5";
import {
  LIBRARY_PROGRAMS,
  type LibraryAuthor,
  type LibraryDef,
  type LibraryProgram,
} from "./types";

export { LIBRARY_PROGRAMS, LIBRARY_ID } from "./types";
export type { LibraryAuthor, LibraryDef, LibraryProgram } from "./types";
export { LIBRARY_PLAN, plannedCourse, type PlannedCourse } from "./catalogue";

/** The registries by author (the catalogue test checks each course sits in its planned author's registry). */
export const LIBRARY_REGISTRIES: Readonly<Record<LibraryAuthor, readonly LibraryDef[]>> = {
  A1: REG_A1,
  A2: REG_A2,
  A3: REG_A3,
  A4: REG_A4,
  A5: REG_A5,
};

const programRank = (p: LibraryProgram): number =>
  LIBRARY_PROGRAMS.findIndex((x) => x.id === p);

/** Every registered library course, grouped by program (LAPL/PPL, IR, ATPL, Club), registry order within one. */
export const LIBRARY_COURSES: readonly LibraryDef[] = (
  Object.keys(LIBRARY_REGISTRIES) as LibraryAuthor[]
)
  .flatMap((a) => LIBRARY_REGISTRIES[a].map((d, i) => ({ d, a, i })))
  .sort(
    (x, y) =>
      programRank(x.d.program) - programRank(y.d.program) ||
      x.a.localeCompare(y.a) ||
      x.i - y.i,
  )
  .map((x) => x.d);

/** The program of a library course id, or null (not a library course). */
export function libraryProgramOf(id: string): LibraryProgram | null {
  return LIBRARY_COURSES.find((d) => d.id === id)?.program ?? null;
}

/** The label of a program (FR / EN). */
export function libraryProgramTitle(p: LibraryProgram): L10n {
  return LIBRARY_PROGRAMS.find((x) => x.id === p)!.title;
}
