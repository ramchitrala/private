import type { Runtime } from "@/lib/client/pipeline";
import { continueRun, writeDraft } from "@/lib/client/pipeline";

let last: { id: string; fn: (rt: Runtime) => Promise<void> } | null = null;

/**
 * Write a statement: a fresh draft, then the natural-voice pass, the checks and the files.
 * Retrying or continuing after Stop reuses the same run, so a finished draft is never thrown away.
 */
export function writeStatement(statementId: string, note = ""): (rt: Runtime) => Promise<void> {
  let drafted = false;
  const fn = async (rt: Runtime) => {
    if (!drafted) {
      await writeDraft(rt, note);
      drafted = true;
    }
    await continueRun(rt, note.trim() ? "Retry" : "Draft");
  };
  last = { id: statementId, fn };
  return fn;
}

/** The run to continue after Stop, or a plain continuation when the page was reloaded. */
export function continueWriting(statementId: string): (rt: Runtime) => Promise<void> {
  if (last && last.id === statementId) return last.fn;
  return (rt: Runtime) => continueRun(rt);
}
