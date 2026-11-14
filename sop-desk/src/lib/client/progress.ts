// An honest progress bar. A run is a list of steps (one per call to the server, plus building
// the files); each step has a weight and an expected amount of output. The bar moves when a step
// finishes, and within a step only as fast as the answer is actually being written. It never
// moves backwards and never pretends: while Claude is thinking, the bar holds still and the
// reasoning feed shows what is happening instead.

export type StepKey = "facts" | "gather" | "extract" | "questions" | "draft" | "humanize" | "review" | "edit" | "files";

interface Step {
  key: StepKey;
  weight: number;
  /** Characters of output a typical answer has; used to fill the bar while the answer is written. */
  expected: number;
}

const STEP: Record<StepKey, Omit<Step, "key">> = {
  facts: { weight: 2, expected: 2500 },
  gather: { weight: 5, expected: 400 },
  extract: { weight: 3, expected: 3500 },
  questions: { weight: 1, expected: 500 },
  draft: { weight: 5, expected: 9000 },
  humanize: { weight: 4, expected: 9000 },
  review: { weight: 3, expected: 1500 },
  edit: { weight: 2, expected: 9000 },
  files: { weight: 1, expected: 1 },
};

/** Expected length of a whole statement as JSON, set per run from the word limit. */
let docChars = 8000;
const step = (key: StepKey): Step => ({ key, ...STEP[key], ...(key === "draft" || key === "humanize" || key === "edit" ? { expected: docChars } : {}) });

export type PlanKind = "resume" | "research" | "write" | "change" | "other";

/** The steps a run usually takes. Steps that turn out not to be needed are skipped over; extra ones are added. */
export function planFor(kind: PlanKind): Step[] {
  switch (kind) {
    case "resume":
      return [step("facts")];
    case "research":
      return [step("gather"), step("extract"), step("questions")];
    case "write":
      // Most drafts pass on the first or second check.
      return [step("draft"), step("humanize"), step("review"), step("review"), step("files")];
    case "change":
      return [step("edit"), step("humanize"), step("review"), step("files")];
    default:
      return [step("review"), step("files")];
  }
}

/** Which step a call to the server is. */
export function stepForPath(path: string): StepKey | null {
  const p = path.replace(/^\/api\//, "");
  if (p === "facts") return "facts";
  if (p === "research/gather") return "gather";
  if (p === "research/extract") return "extract";
  if (p === "questions") return "questions";
  if (p === "draft") return "draft";
  if (p === "humanize") return "humanize";
  if (p === "review") return "review";
  if (p === "edit") return "edit";
  return null;
}

export interface Progress {
  plan: Step[];
  /** Index of the step under way (or the next one, when none is). */
  cursor: number;
  active: boolean;
  chars: number;
  /** The highest fraction shown so far, so the bar never goes back. */
  shown: number;
  reviewsDone: number;
  maxReviews: number;
}

export function newProgress(kind: PlanKind, maxReviews: number, wordTarget = 1100): Progress {
  // A statement as structured text runs about 6.5 characters per word.
  docChars = Math.max(1500, Math.round(wordTarget * 6.5));
  return { plan: planFor(kind), cursor: 0, active: false, chars: 0, shown: 0, reviewsDone: 0, maxReviews };
}

function settle(p: Progress): Progress {
  return { ...p, shown: Math.max(p.shown, fraction(p)) };
}

/** A step starts. Planned steps before it that never ran are counted as done (they were not needed). */
export function startStep(p: Progress, key: StepKey): Progress {
  const plan = [...p.plan];
  let at = plan.findIndex((s, i) => i >= p.cursor && s.key === key);
  if (at === -1) {
    // Not planned (an extra check, a fix made by the writer): add it here.
    plan.splice(p.cursor, 0, step(key));
    at = p.cursor;
  }
  return settle({ ...p, plan, cursor: at, active: true, chars: 0 });
}

export function writing(p: Progress, chars: number): Progress {
  return p.active ? settle({ ...p, chars: Math.max(p.chars, chars) }) : p;
}

/**
 * A step finished. For a check that asked for changes, one more check is expected
 * (up to the limit), because the loop only ends on a clean check.
 */
export function endStep(p: Progress, outcome?: { reviewAskedForChanges?: boolean }): Progress {
  if (!p.active) return p;
  const plan = [...p.plan];
  const current = plan[p.cursor];
  let reviewsDone = p.reviewsDone;
  if (current?.key === "review") {
    reviewsDone += 1;
    const moreChecksPlanned = plan.slice(p.cursor + 1).some((s) => s.key === "review");
    if (outcome?.reviewAskedForChanges && !moreChecksPlanned && reviewsDone < p.maxReviews) {
      const files = plan.findIndex((s, i) => i > p.cursor && s.key === "files");
      plan.splice(files === -1 ? plan.length : files, 0, step("review"));
    }
  }
  return settle({ ...p, plan, cursor: p.cursor + 1, active: false, chars: 0, reviewsDone });
}

export function finish(p: Progress): Progress {
  return { ...p, cursor: p.plan.length, active: false, chars: 0, shown: 1 };
}

/** The share of the work that is really done, from 0 to 1. */
export function fraction(p: Progress): number {
  const total = p.plan.reduce((n, s) => n + s.weight, 0);
  if (!total) return 0;
  const done = p.plan.slice(0, Math.min(p.cursor, p.plan.length)).reduce((n, s) => n + s.weight, 0);
  const current = p.active ? p.plan[p.cursor] : undefined;
  const within = current ? Math.min(0.95, p.chars / current.expected) * current.weight : 0;
  return Math.min(1, (done + within) / total);
}

export function percent(p: Progress): number {
  return Math.round(p.shown * 100);
}
