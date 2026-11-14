/**
 * Model settings for every stage, in one place.
 *
 * Claude Opus 5.5 always thinks adaptively, so no `thinking` field is sent and depth is
 * set with `output_config.effort` only. No sampling parameters, no prefill, no forced
 * tool choice. `max_tokens` covers thinking plus text.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** The lower of two effort levels (a cap from the browser can only lower the configured level). */
export function capEffort(effort: Effort, cap: unknown): Effort {
  const c = EFFORTS.indexOf(cap as Effort);
  return c === -1 ? effort : EFFORTS[Math.min(EFFORTS.indexOf(effort), c)];
}

function effort(name: string, fallback: Effort): Effort {
  const v = (process.env[name] ?? "").trim().toLowerCase() as Effort;
  return EFFORTS.includes(v) ? v : fallback;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function getConfig() {
  const timeLimitMs = int("STAGE_TIME_LIMIT_S", process.env.VERCEL ? 300 : 0, 0, 800) * 1000;
  return {
    model: (process.env.MODEL_ID ?? "").trim() || "claude-opus-5-5",
    effort: {
      /** Draft, humanize, apply edits. */
      write: effort("EFFORT_WRITE", "xhigh"),
      /**
       * Review (critique loop). In live runs a first review at "max" always needed more than the
       * 300 s Hobby limit, so with that limit the default is "xhigh"; "max" where steps may run longer.
       */
      critique: effort("EFFORT_CRITIQUE", timeLimitMs > 0 && timeLimitMs <= 300_000 ? "xhigh" : "max"),
      /** Resume facts, official-requirements research, questions. */
      research: effort("EFFORT_RESEARCH", "high"),
    },
    maxReviewRounds: int("MAX_REVIEW_ROUNDS", 5, 1, 12),
    /**
     * How long one step may run, in ms (the route's maxDuration). On Vercel it defaults to 300 s, the
     * Hobby limit; set STAGE_TIME_LIMIT_S=800 on Pro. A step stops cleanly 20 s before the limit.
     */
    timeLimitMs,
    /** Rounds allowed after each "Ask for a change" request. */
    maxEditReviewRounds: 3,
    maxTokens: 64000,
    /** How many times a paused server-tool turn is continued before giving up. */
    maxContinuations: 4,
    /** SDK retries for 429, 529 and other retryable errors. */
    maxRetries: 4,
    tools: {
      // Basic versions: Claude calls them directly, so every fetched page comes back
      // in full in the response and its text can be checked against quotes.
      webSearch: "web_search_20250305" as const,
      webFetch: "web_fetch_20250910" as const,
      // Every page read is sent back on each later search round, so keep pages short and rounds few.
      searchMaxUses: 6,
      fetchMaxUses: 6,
      fetchMaxContentTokens: 12000,
    },
  };
}

export function isMock(): boolean {
  return process.env.MOCK_ANTHROPIC === "1";
}
