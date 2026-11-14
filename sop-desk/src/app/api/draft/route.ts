import { stageRoute } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { writerSchema } from "@/lib/server/schemas";
import { draftSystem, draftUser } from "@/lib/server/prompts";
import { mockDelay, mockDraft } from "@/lib/server/mock";
import { cleanDeep } from "@/lib/clean";
import { tidySections } from "@/lib/docmodel";
import type { DraftBody } from "@/lib/api-types";
import type { WriterOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = stageRoute<DraftBody>("draft", async (body, ctx) => {
  ctx.emit({ type: "status", message: "Writing the draft" });
  const user = draftUser(body.ctx);
  let out: WriterOutput;
  if (isMock()) {
    await mockDelay(ctx);
    out = mockDraft(user);
  } else {
    const res = await callClaude(ctx, {
      effort: getConfig().effort.write,
      system: systemBlocks(draftSystem(body.ctx)),
      messages: [{ role: "user", content: user }],
      schema: writerSchema,
    });
    out = parseJson<WriterOutput>(res.text);
  }
  return { sections: tidySections(cleanDeep(out.sections)) };
});
