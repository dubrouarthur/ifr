// scratch probe (removed before hand-off): validation + readability issues of the crafted briefings
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
import { validateCourse } from "../src/course/validate";
import { resolveTheme } from "../src/course/canvas/themes";
import {
  slideReadability,
  readIssueText,
} from "../src/course/canvas/readability";
it("probe", () => {
  const out: string[] = [];
  for (const b of CRAFTED_BRIEFINGS) {
    const c = b.build();
    for (const i of validateCourse(c))
      out.push(`${b.id} ${i.level} ${i.code} ${i.path} ${i.message.en}`);
    const theme = resolveTheme(c.theme, c.brand);
    for (const lang of ["fr", "en"] as const)
      for (const s of c.steps)
        if (s.slide)
          for (const i of slideReadability(s.slide, { theme, lang }))
            out.push(
              `${lang} ${s.id} ${i.kind} ${i.blockId} ${i.otherId ?? ""} ${readIssueText(i, "en").en}`,
            );
  }
  writeFileSync(
    "/tmp/claude-0/-home-user-ifr/7c782ba7-cb1c-52b3-8ba9-439f82c75de1/scratchpad/brief4/val.txt",
    out.join("\n"),
  );
});
