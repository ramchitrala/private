import { stageRoute, StageError } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { writerSchema } from "@/lib/server/schemas";
import { humanizeSystem, humanizeUser } from "@/lib/server/prompts";
import { mockDelay, mockHumanize } from "@/lib/server/mock";
import { cleanDeep } from "@/lib/clean";
import { tidySections } from "@/lib/docmodel";
import type { HumanizeBody } from "@/lib/api-types";
import type { DocSection, WriterOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** After an edit, only the edited paragraphs may change: put every other one back as it was. */
function restoreUntouched(before: DocSection[], after: DocSection[], only: string[]): DocSection[] {
  if (before.length !== after.length) return after;
  return after.map((s, si) => {
    const b = before[si];
    if (b.paragraphs.length !== s.paragraphs.length) return s;
    return { heading: b.heading, paragraphs: s.paragraphs.map((p, pi) => (only.includes(b.paragraphs[pi]) ? p : b.paragraphs[pi])) };
  });
}

export const POST = stageRoute<HumanizeBody>("humanize", async (body, ctx) => {
  ctx.emit({ type: "status", message: "Humanizer pass" });
  let out: WriterOutput;
  if (isMock()) {
    await mockDelay(ctx);
    out = mockHumanize(body.sections, body.onlyParagraphs);
  } else {
    const res = await callClaude(ctx, {
      effort: getConfig().effort.write,
      // The skill text and the app rules never change, so this prefix is cached.
      system: systemBlocks(humanizeSystem(), true),
      messages: [{ role: "user", content: humanizeUser(body.ctx, body.sections, body.onlyParagraphs) }],
      schema: writerSchema,
    });
    out = parseJson<WriterOutput>(res.text);
  }
  let sections = tidySections(cleanDeep(out.sections));
  // The structure the official instructions require must survive the pass.
  if (sections.length !== body.sections.length) {
    throw new StageError("structure_changed", "The humanizer pass changed the number of sections, so its result was discarded. Try this step again.");
  }
  if (body.onlyParagraphs?.length) sections = restoreUntouched(body.sections, sections, body.onlyParagraphs);
  return { sections };
});
