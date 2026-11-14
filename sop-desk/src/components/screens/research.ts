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
  if (force || !p.research || p.research.programUrl !== url) {
    const g = p.gathered;
    const reusable = !force && !!g && g.programUrl === url && g.gather.programPageFetched && g.gather.searchCount > 0;
    await runResearch(rt, !reusable);
  }
  if (rt.get().questions === null) await runQuestions(rt);
}
