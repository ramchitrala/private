import { stageRoute } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { editSchema } from "@/lib/server/schemas";
import { editSystem, editUser } from "@/lib/server/prompts";
import { mockDelay, mockEdit } from "@/lib/server/mock";
import { cleanDeep } from "@/lib/clean";
import { tidySections } from "@/lib/docmodel";
import type { EditBody } from "@/lib/api-types";
import type { EditOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = stageRoute<EditBody>(
  (body) => `edit-${body.task?.mode ?? "chat"}`,
  async (body, ctx) => {
    ctx.emit({ type: "status", message: body.task.mode === "trim" ? "Trimming to fit the limit" : "Making the change" });
    let out: EditOutput;
    if (isMock()) {
      await mockDelay(ctx);
      out = mockEdit(body.sections, body.task);
    } else {
      const res = await callClaude(ctx, {
        effort: getConfig().effort.write,
        system: systemBlocks(editSystem(body.ctx)),
        messages: [{ role: "user", content: editUser(body.ctx, body.sections, body.task) }],
        schema: editSchema,
      });
      out = parseJson<EditOutput>(res.text);
    }
    const cleaned = cleanDeep(out);
    return { ...cleaned, sections: cleaned.declined ? body.sections : tidySections(cleaned.sections) } satisfies EditOutput;
  },
);
