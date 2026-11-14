import type { Runtime } from "@/lib/client/pipeline";
import { runQuestions, runResearch } from "@/lib/client/pipeline";
import { checkProgramLink } from "@/lib/domains";

/**
 * Find the instructions, then the optional questions, as one run. A retry picks up where it
 * stopped: research that already succeeded for this link is not repeated, and a page that
 * could not be fetched is always fetched again.
 */
export async function findInstructions(rt: Runtime, force = false): Promise<void> {
  const p = rt.get();
  const check = checkProgramLink(p.inputs.programUrl, p.confirmedDomains);
  const url = check.ok ? check.url : p.inputs.programUrl;
  // Other official pages and the track change what is searched, so a change means searching again.
  const key = researchKey(url, p.inputs.extraLinks, p.inputs.concentration);
  if (force || !p.research || p.research.programUrl !== url || (p.researchKey ?? key) !== key) {
    const g = p.gathered;
    const reusable = !force && !!g && g.programUrl === url && (p.researchKey ?? key) === key && g.gather.programPageFetched && g.gather.searchCount > 0;
    await runResearch(rt, !reusable);
    rt.set((x) => (x.researchKey = key));
  }
  if (rt.get().questions === null) await runQuestions(rt);
}

export function researchKey(url: string, extraLinks: string, concentration: string): string {
  return JSON.stringify([url, extraLinks.trim().split(/\s+/).filter(Boolean).sort(), concentration.trim().toLowerCase()]);
}
