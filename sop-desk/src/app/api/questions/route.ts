import { stageRoute } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { questionsSchema } from "@/lib/server/schemas";
import { QUESTIONS_SYSTEM } from "@/lib/server/prompts";
import { mockDelay, mockQuestions } from "@/lib/server/mock";
import { cleanDeep } from "@/lib/clean";
import { newId } from "@/lib/docmodel";
import { INSTRUCTION_KINDS, type Question } from "@/lib/types";
import type { QuestionsBody } from "@/lib/api-types";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = stageRoute<QuestionsBody>("questions", async (body, ctx) => {
  const instructions = body.items.filter((i) => i.verified && INSTRUCTION_KINDS.includes(i.kind));
  // With no official instructions there is nothing they could be asking for.
  if (!instructions.length) return { questions: [] as Question[] };
  ctx.emit({ type: "status", message: "Checking what the instructions ask for that your facts don't cover" });

  let raw: { questions: { text: string; why: string }[] };
  if (isMock()) {
    await mockDelay(ctx);
    raw = mockQuestions(true);
  } else {
    const facts = body.facts.items.map((f) => `- [${f.category}] ${f.text}`).join("\n");
    const reqs = instructions.map((i, n) => `${n + 1}. (${i.kind}) ${i.text}`).join("\n");
    const res = await callClaude(ctx, {
      effort: getConfig().effort.research,
      system: systemBlocks(QUESTIONS_SYSTEM),
      messages: [{ role: "user", content: `<official_instructions>\n${reqs}\n</official_instructions>\n\n<applicant_facts>\nName: ${body.facts.applicantName}\n${facts}\n</applicant_facts>\n\nList the questions.` }],
      schema: questionsSchema,
    });
    raw = cleanDeep(parseJson<typeof raw>(res.text));
  }
  const questions: Question[] = raw.questions.slice(0, 6).map((q) => ({ id: newId("q"), text: q.text.trim(), why: q.why.trim(), answer: "", skipped: false }));
  return { questions };
});
