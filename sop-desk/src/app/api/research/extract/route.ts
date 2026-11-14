import { stageRoute, StageError } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { extractSchema } from "@/lib/server/schemas";
import { EXTRACT_SYSTEM, extractUser } from "@/lib/server/prompts";
import { mockDelay, mockExtract } from "@/lib/server/mock";
import { applyPrecedence, decideStatus, itemsFromExtract, statusLine, verifyAll, type RawExtract } from "@/lib/requirements";
import { cleanDeep, cleanText } from "@/lib/clean";
import type { ExtractBody } from "@/lib/api-types";
import type { GatherResult, Research, SourcePage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const PASTED_URL = "pasted:instructions";

export const POST = stageRoute<ExtractBody>("research-extract", async (body, ctx) => {
  const pasted = cleanText(body.pastedInstructions ?? "").trim();
  const gather: GatherResult = body.gather ?? {
    pages: [],
    queries: [],
    searchCount: 0,
    fetchCount: 0,
    fetchErrors: [],
    searchErrors: [],
    programPageFetched: false,
  };
  const pages: SourcePage[] = [...gather.pages];
  if (pasted) pages.push({ url: PASTED_URL, title: "Instructions you pasted", kind: "pasted", text: pasted, retrievedAt: new Date().toISOString() });
  if (!pages.length) {
    // Nothing was fetched: this is an error to show, never a reason to fall back.
    decideStatus(gather, [], []);
    throw new StageError("no_pages", "No page could be read. Try again, or paste the statement instructions yourself.");
  }

  ctx.emit({ type: "status", message: `Reading ${pages.length} page${pages.length > 1 ? "s" : ""} for statement instructions` });
  let raw: RawExtract;
  if (isMock()) {
    await mockDelay(ctx);
    raw = mockExtract(pages);
  } else {
    // Second call: no tools, JSON output. (JSON output cannot be combined with citations.)
    const res = await callClaude(ctx, {
      effort: getConfig().effort.research,
      system: systemBlocks(EXTRACT_SYSTEM),
      messages: [{ role: "user", content: extractUser(pages, body.programUrl, body.concentration ?? "") }],
      schema: extractSchema,
    });
    raw = cleanDeep(parseJson<RawExtract>(res.text));
  }

  ctx.emit({ type: "status", message: "Checking every quote against the fetched pages" });
  const flat = itemsFromExtract(raw);
  const verified = verifyAll(flat.items, flat.details, pages);
  // Anything found only in the text the user pasted is the user's own entry.
  const tag = <T extends { sourceUrl: string; origin: "official" | "user" }>(x: T): T => (x.sourceUrl === PASTED_URL ? { ...x, origin: "user" as const } : x);
  const items = verified.items.map((i) => (i.sourceUrl === PASTED_URL ? { ...tag(i), level: "user" as const } : i));
  const details = verified.details.map(tag);
  const { kept, overridden } = applyPrecedence(items);
  const dropped = [
    ...verified.dropped,
    ...overridden.map((o) => ({ text: o.text, quote: o.quote, reason: "A more specific instruction of the same kind takes precedence." })),
  ];

  const status = decideStatus(gather, kept, details);
  const research: Research = {
    programUrl: body.programUrl,
    domains: body.domains,
    checkedAt: new Date().toISOString(),
    gather: { ...gather, pages },
    items: kept,
    details,
    dropped,
    country: (raw.country ?? "").trim(),
    status,
    statusLine: statusLine(status, body.domains, kept),
  };
  return research;
});
