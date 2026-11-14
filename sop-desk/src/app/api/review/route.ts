import type Anthropic from "@anthropic-ai/sdk";
import { stageRoute, StageError } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { reviewSchema } from "@/lib/server/schemas";
import { reviewFirstUser, reviewNextUser, reviewSystem } from "@/lib/server/prompts";
import { mockDelay, mockReview } from "@/lib/server/mock";
import { bodyToText } from "@/lib/docmodel";
import type { ReviewBody } from "@/lib/api-types";
import type { ReviewOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One review round per call. The reviewer is its own conversation: it never sees the
 * writer's prompts. Earlier turns are sent back exactly as they were received (thinking
 * blocks included) and each round only appends, with the same system prompt.
 */
export const POST = stageRoute<ReviewBody>(
  (body) => `review#${body.round ?? 1}`,
  async (body, ctx) => {
    const history = (body.conversation ?? []) as Anthropic.MessageParam[];
    const text = history.length === 0 || !body.next ? (body.first ? reviewFirstUser(body.first) : "") : reviewNextUser(body.next);
    if (!text) throw new StageError("bad_request", "The review request is missing its inputs.");
    const userTurn: Anthropic.MessageParam = { role: "user", content: text };
    ctx.emit({ type: "status", message: `Review round ${body.round}` });

    let review: ReviewOutput;
    let assistantTurns: Anthropic.MessageParam[];
    if (isMock()) {
      await mockDelay(ctx);
      const doc = body.next?.doc ?? body.first?.doc;
      review = mockReview(history.length === 0 ? 1 : 2, doc ? bodyToText(doc) : "", !!body.next?.userRequest);
      assistantTurns = [{ role: "assistant", content: [{ type: "text", text: JSON.stringify(review) }] }];
    } else {
      const res = await callClaude(ctx, {
        effort: getConfig().effort.critique,
        // The reviewer's instructions and the humanizer reference are a long fixed prefix: cache them,
        // and cache the conversation so each round only pays for what was appended.
        system: systemBlocks(reviewSystem(), true),
        messages: [...history, userTurn],
        schema: reviewSchema,
        cacheConversation: true,
      });
      review = parseJson<ReviewOutput>(res.text);
      assistantTurns = res.assistantTurns;
    }
    // Enum casing is not guaranteed by structured outputs; normalize it.
    review.verdict = String(review.verdict).toUpperCase() === "NO_CORRECTIONS" ? "NO_CORRECTIONS" : "CORRECTIONS";
    const conf = String(review.confidence).toUpperCase();
    review.confidence = conf === "HIGH" || conf === "MEDIUM" ? conf : "LOW";
    review.corrections = (review.corrections ?? []).map((c, i) => ({
      ...c,
      id: String(c.id || i + 1),
      severity: String(c.severity).toUpperCase() === "MUST_FIX" ? "MUST_FIX" : "SHOULD_FIX",
    }));
    if (review.verdict === "NO_CORRECTIONS") review.corrections = [];
    else if (!review.corrections.length) review.confidence = "LOW"; // says corrections but lists none: not a pass
    return { review, conversation: [...history, userTurn, ...assistantTurns] };
  },
);
