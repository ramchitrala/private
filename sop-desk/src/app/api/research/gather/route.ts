import type Anthropic from "@anthropic-ai/sdk";
import { stageRoute, StageError, type StageCtx } from "@/lib/server/stage";
import { callClaude, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { gatherSystem, gatherUser } from "@/lib/server/prompts";
import { mockDelay, mockGather } from "@/lib/server/mock";
import { checkProgramLink, officialDomains, parseExtraLinks } from "@/lib/domains";
import type { GatherBody } from "@/lib/api-types";
import type { GatherResult } from "@/lib/types";
import { readToolBlocks } from "@/lib/server/gather";

export const runtime = "nodejs";
export const maxDuration = 300;

async function gather(body: GatherBody, ctx: StageCtx): Promise<{ gather: GatherResult; domains: string[] }> {
  const extra = parseExtraLinks((body.extraLinks ?? []).join("\n"));
  const check = checkProgramLink(body.programUrl, body.confirmedDomains ?? []);
  if (!check.ok) throw new StageError(`link_${check.reason}`, check.message);
  const domains = officialDomains(check.url, extra.urls);
  ctx.emit({ type: "status", message: `Searching ${domains.join(", ")} for statement instructions` });

  if (isMock()) {
    const g = mockGather(check.url);
    await mockDelay(ctx, { searches: g.searchCount, fetches: g.fetchCount });
    return { gather: g, domains };
  }

  const c = getConfig();
  // Domain limits are enforced by the tools themselves, not left to the prompt.
  const tools: Anthropic.ToolUnion[] = [
    { type: c.tools.webSearch, name: "web_search", max_uses: c.tools.searchMaxUses, allowed_domains: domains },
    { type: c.tools.webFetch, name: "web_fetch", max_uses: c.tools.fetchMaxUses, allowed_domains: domains, max_content_tokens: c.tools.fetchMaxContentTokens },
  ];
  const res = await callClaude(ctx, {
    effort: c.effort.research,
    system: systemBlocks(gatherSystem(domains)),
    // The links are in the user message so that web fetch is allowed to fetch them.
    messages: [{ role: "user", content: gatherUser(check.url, extra.urls, body.entryTerm ?? "", body.concentration ?? "") }],
    tools,
    // The search loop re-reads everything so far on each round; caching makes those re-reads cheap.
    cacheConversation: true,
  });
  return { gather: await readToolBlocks(res.content, check.url, domains), domains };
}

export const POST = stageRoute<GatherBody>("research-gather", gather);
