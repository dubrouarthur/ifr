import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
it("dump", () => {
  const out: string[] = [];
  for (const b of CRAFTED_BRIEFINGS) for (const s of b.build().steps) for (const x of s.slide?.blocks ?? []) if (x.kind === "text") out.push(`${x.id} ${x.style} ${JSON.stringify(x.frame)} ${x.text.fr}`);
  writeFileSync("/tmp/claude-0/-home-user-ifr/7c782ba7-cb1c-52b3-8ba9-439f82c75de1/scratchpad/brief4/dump.txt", out.join("\n"));
});
