import type {
  ChatMessage,
  Correction,
  CorrectionOutcome,
  DocFormat,
  DocModel,
  DocSection,
  EditOutput,
  FactSheet,
  GatherResult,
  Project,
  Question,
  Research,
  ReviewOutput,
  ReviewRound,
  Version,
} from "../types";
import type { AppInfo, EditTask, ReviewBody, WritingContext } from "../api-types";
import { checkProgramLink, parseExtraLinks } from "../domains";
import { buildHeader, docTitle, isUS, resolveFormat, sectionLimits } from "../requirements";
import { bodyToText, bodyWords, cloneDoc, newId, sameDoc, sectionWords } from "../docmodel";
import { applyExactOnce } from "../corrections";
import { lintDoc } from "../lint";
import { cleanText } from "../clean";
import { measurePdf } from "./files";
import { StageFailure } from "./api";

/** What the pipeline needs from the UI: state access, stage calls and status lines. */
export interface Runtime {
  get(): Project;
  set(mutate: (p: Project) => void): void;
  call<T>(path: string, body: unknown, label: string): Promise<T>;
  status(message: string): void;
  info: AppInfo;
}

export function formatFor(p: Project): DocFormat {
  return resolveFormat(p.research);
}

function assemble(p: Project, sections: DocSection[]): DocModel {
  return { title: docTitle(p.research), header: buildHeader(p.facts, p.research, p.inputs), sections };
}

function writingContext(p: Project, retryNote = ""): WritingContext {
  if (!p.facts) throw new StageFailure("draft", "no_facts", "Read the resume first.");
  return {
    facts: p.facts,
    items: p.research?.items ?? [],
    details: p.research?.details ?? [],
    format: formatFor(p),
    title: docTitle(p.research),
    header: buildHeader(p.facts, p.research, p.inputs),
    usSpelling: p.research ? isUS(p.research) : true,
    notes: p.inputs.notes,
    voiceSample: p.inputs.voiceSample,
    retryNote,
  };
}

/* ------------------------------------------------------------------ facts */

export async function runFacts(rt: Runtime): Promise<void> {
  const { inputs } = rt.get();
  const body =
    inputs.resumeKind === "pdf" || inputs.resumeKind === "docx"
      ? { kind: inputs.resumeKind, data: inputs.resumeData }
      : { kind: "text" as const, text: cleanText(inputs.resumeText) };
  if (body.kind === "text" && !body.text?.trim()) throw new StageFailure("facts", "no_resume", "Add your resume first: upload a PDF or DOCX, or paste the text.");
  rt.status("Reading your resume");
  const sheet = await rt.call<FactSheet>("/api/facts", body, "Resume facts");
  rt.set((p) => {
    const mine = p.facts?.items.filter((f) => f.source === "user") ?? [];
    p.facts = { applicantName: sheet.applicantName || p.facts?.applicantName || "", items: [...sheet.items, ...mine] };
  });
}

/* --------------------------------------------------------------- research */

export async function runResearch(rt: Runtime, force = false): Promise<void> {
  const start = rt.get();
  const extra = parseExtraLinks(start.inputs.extraLinks);
  const check = checkProgramLink(start.inputs.programUrl, start.confirmedDomains);
  if (!check.ok) throw new StageFailure("research", `link_${check.reason}`, check.message);

  let gathered = start.gathered;
  if (force || !gathered || gathered.programUrl !== check.url) {
    rt.status(`Searching ${check.domain} for statement instructions`);
    const res = await rt.call<{ gather: GatherResult; domains: string[] }>(
      "/api/research/gather",
      {
        programUrl: check.url,
        extraLinks: extra.urls,
        confirmedDomains: start.confirmedDomains,
        entryTerm: start.inputs.entryTerm,
        concentration: start.inputs.concentration,
      },
      "Research: gather",
    );
    gathered = { programUrl: check.url, gather: res.gather, domains: res.domains };
    rt.set((p) => {
      p.gathered = gathered;
      p.research = null;
    });
  }
  await runExtract(rt, false);
}

/** The extract step alone; with `usePasted` it also reads the instructions the user pasted. */
export async function runExtract(rt: Runtime, usePasted: boolean): Promise<void> {
  const p = rt.get();
  const check = checkProgramLink(p.inputs.programUrl, p.confirmedDomains);
  const programUrl = check.ok ? check.url : p.inputs.programUrl.trim();
  const g = p.gathered && p.gathered.programUrl === programUrl ? p.gathered : null;
  const pasted = usePasted ? p.inputs.pastedInstructions.trim() : "";
  if (!g && !pasted) throw new StageFailure("research", "nothing_to_read", "Paste the statement instructions first.");
  rt.status("Reading the fetched pages for statement instructions");
  const research = await rt.call<Research>(
    "/api/research/extract",
    { programUrl, domains: g?.domains ?? (check.ok ? [check.domain] : []), gather: g?.gather ?? null, pastedInstructions: pasted, concentration: p.inputs.concentration },
    "Research: extract",
  );
  rt.set((x) => {
    // Items the user added by hand survive a re-check.
    const mine = x.research?.items.filter((i) => i.origin === "user" && !i.sourceUrl.startsWith("pasted:")) ?? [];
    x.research = { ...research, items: [...research.items, ...mine] };
    x.questions = null;
    const uni = research.details.find((d) => d.kind === "university")?.value;
    const prog = research.details.find((d) => d.kind === "program")?.value;
    if (uni || prog) x.name = [prog, uni].filter(Boolean).join(", ");
  });
}

/* -------------------------------------------------------------- questions */

export async function runQuestions(rt: Runtime): Promise<void> {
  const p = rt.get();
  if (!p.facts) throw new StageFailure("questions", "no_facts", "Read the resume first.");
  rt.status("Checking what the instructions ask for that your facts don't cover");
  const res = await rt.call<{ questions: Question[] }>("/api/questions", { facts: p.facts, items: p.research?.items ?? [] }, "Questions");
  rt.set((x) => (x.questions = res.questions));
}

/** Answers become user facts. A skipped or empty question adds nothing. */
function foldAnswers(p: Project): void {
  if (!p.facts || !p.questions) return;
  for (const q of p.questions) {
    const id = `ans_${q.id}`;
    p.facts.items = p.facts.items.filter((f) => f.id !== id);
    const answer = cleanText(q.answer).trim();
    if (answer && !q.skipped) p.facts.items.push({ id, category: "other", text: `${q.text} ${answer}`, source: "user" });
  }
}

/* ------------------------------------------------------- draft and review */

export async function runDraft(rt: Runtime, retryNote = ""): Promise<void> {
  // No draft without research: the default structure is used only after the search really ran.
  if (!rt.get().research) throw new StageFailure("draft", "no_research", "Find the requirements first. Nothing is written before the official site has been searched.");
  rt.set(foldAnswers);
  const p = rt.get();
  rt.status("Writing the draft");
  const res = await rt.call<{ sections: DocSection[] }>("/api/draft", { ctx: writingContext(p, retryNote) }, "Draft");
  rt.set((x) => {
    x.preHumanize = assemble(x, res.sections);
    x.doc = null;
    x.prevDoc = null;
    x.rounds = [];
    x.passed = false;
    x.reviewer = null;
    x.pending = null;
  });
  await continueRun(rt, retryNote ? "Retry" : "Draft");
}

/** Pick the run up wherever it stopped: humanize, then the review loop, then save a version. */
export async function continueRun(rt: Runtime, label = "Draft", maxRounds = rt.info.maxReviewRounds): Promise<void> {
  let p = rt.get();
  if (!p.preHumanize && !p.doc) throw new StageFailure("draft", "no_draft", "Write a draft first.");
  if (!p.doc && p.preHumanize) {
    rt.status("Humanizer pass");
    const res = await rt.call<{ sections: DocSection[] }>("/api/humanize", { ctx: writingContext(p), sections: p.preHumanize.sections }, "Humanize");
    rt.set((x) => {
      x.doc = assemble(x, res.sections);
      x.prevDoc = cloneDoc(x.doc);
    });
  }
  await reviewLoop(rt, maxRounds);
  p = rt.get();
  await saveVersion(rt, `${label} ${p.versions.filter((v) => v.label.startsWith(label)).length + 1}`);
}

function overLimits(doc: DocModel, format: DocFormat, limits: number[], pageCount: number): string {
  const words = bodyWords(doc);
  if (format.pageMax && pageCount > format.pageMax) {
    return `It runs to ${pageCount} pages in the built PDF and the limit is ${format.pageMax}. Cut roughly ${Math.max(30, Math.round(words * (1 - format.pageMax / pageCount) + 25))} words.`;
  }
  if (format.wordMax && words > format.wordMax) return `It is ${words} words and the limit is ${format.wordMax}. Cut at least ${words - format.wordMax} words.`;
  const i = doc.sections.findIndex((s, n) => limits[n] > 0 && sectionWords(s) > limits[n]);
  if (i !== -1) return `Section ${i + 1} is ${sectionWords(doc.sections[i])} words and its limit is ${limits[i]}. Cut that section to fit.`;
  return "";
}

/**
 * Measure the PDF and, while the text is over an official limit, have the writer trim it.
 * The type size and spacing are never reduced to make it fit.
 */
async function ensureFits(rt: Runtime): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    const p = rt.get();
    const format = formatFor(p);
    const official = p.research?.status === "official";
    const built = await measurePdf(p.doc!, format);
    const problem = official ? overLimits(p.doc!, format, sectionLimits(p.research, format), built.pageCount) : "";
    if (!problem || attempt >= 3) return built.pageCount;
    rt.status(`Over the limit (${built.pageCount} page${built.pageCount > 1 ? "s" : ""}, ${bodyWords(p.doc!)} words): trimming`);
    const res = await rt.call<EditOutput>("/api/edit", { ctx: writingContext(p), sections: p.doc!.sections, task: { mode: "trim", problem } satisfies EditTask }, "Trim to fit");
    if (JSON.stringify(res.sections) === JSON.stringify(p.doc!.sections)) return built.pageCount;
    rt.set((x) => (x.doc = assemble(x, res.sections)));
  }
}

/** A correction may be declined only for a stated reason: here, breaking an official limit. */
function breaksLimit(p: Project, before: DocModel, after: DocModel): string {
  if (p.research?.status !== "official") return "";
  const format = formatFor(p);
  const limits = sectionLimits(p.research, format);
  if (format.wordMax && bodyWords(after) > format.wordMax && bodyWords(after) > bodyWords(before)) {
    return `it would put the text at ${bodyWords(after)} words, over the official limit of ${format.wordMax}.`;
  }
  const i = after.sections.findIndex((s, n) => limits[n] > 0 && sectionWords(s) > limits[n] && sectionWords(s) > (before.sections[n] ? sectionWords(before.sections[n]) : 0));
  if (i !== -1) return `it would put section ${i + 1} over its official limit of ${limits[i]} words.`;
  return "";
}

async function applyCorrection(rt: Runtime, c: Correction): Promise<CorrectionOutcome> {
  const p = rt.get();
  const doc = p.doc!;
  const exact = applyExactOnce(doc, c.currentText, c.replacementText);
  if (exact.status === "applied") {
    const why = breaksLimit(p, doc, exact.doc);
    if (why) return { correction: c, outcome: "declined", note: why };
    rt.set((x) => (x.doc = exact.doc));
    return { correction: c, outcome: "applied-exact", note: "Replaced word for word." };
  }
  if (exact.status === "no-change") return { correction: c, outcome: "open", note: "The replacement is the same as the current text." };
  // Not found exactly once: ask the writer to make this one change with the smallest edit.
  const res = await rt.call<EditOutput>(
    "/api/edit",
    { ctx: writingContext(p), sections: doc.sections, task: { mode: "correction", currentText: c.currentText, replacementText: c.replacementText, reason: c.reason } satisfies EditTask },
    `Apply correction ${c.id}`,
  );
  if (res.declined) return { correction: c, outcome: "declined", note: res.declineReason || "it conflicts with an official requirement." };
  const next = assemble(p, res.sections);
  if (sameDoc(next, doc)) return { correction: c, outcome: "open", note: "the passage could not be found in the current text." };
  const why = breaksLimit(p, doc, next);
  if (why) return { correction: c, outcome: "declined", note: why };
  rt.set((x) => (x.doc = next));
  return {
    correction: c,
    outcome: "applied-writer",
    note: exact.status === "ambiguous" ? `The text appears ${exact.count} times, so the writer made the change.` : "The text was not found word for word, so the writer made the change.",
  };
}

/**
 * The critique loop. Each round is one call that continues the same reviewer conversation.
 * The draft passes only on NO_CORRECTIONS with HIGH confidence.
 */
export async function reviewLoop(rt: Runtime, maxRounds: number, chat?: { request: string; newFacts: string[] }): Promise<void> {
  for (let n = 1; n <= maxRounds; n++) {
    if (rt.get().passed) return;
    const pageCount = await ensureFits(rt);
    const p = rt.get();
    const doc = p.doc!;
    const format = formatFor(p);
    const lint = lintDoc(doc, sectionLimits(p.research, format));
    const round = p.rounds.length + 1;
    rt.status(`Review round ${n} of ${maxRounds}`);

    const body: ReviewBody = { round, conversation: p.reviewer };
    if (!p.reviewer?.length) {
      body.first = { facts: p.facts!, items: p.research?.items ?? [], details: p.research?.details ?? [], format, notes: p.inputs.notes, preHumanize: p.preHumanize, doc, lint, pageCount };
    } else {
      const pending = p.pending ?? { applied: [], declined: [], failed: [] };
      body.next = { round, ...pending, doc, lint, pageCount, format, ...(chat && n === 1 ? { userRequest: chat.request, newFacts: chat.newFacts } : {}) };
    }
    const res = await rt.call<{ review: ReviewOutput; conversation: unknown[] }>("/api/review", body, `Review round ${round}`);
    rt.set((x) => {
      x.reviewer = res.conversation;
      x.pending = null;
    });

    const { review } = res;
    const outcomes: CorrectionOutcome[] = [];
    if (review.verdict === "CORRECTIONS") {
      for (const c of review.corrections) {
        rt.status(`Review round ${n} of ${maxRounds}: applying fix ${outcomes.length + 1} of ${review.corrections.length}`);
        outcomes.push(await applyCorrection(rt, c));
      }
    }
    const applied = outcomes.filter((o) => o.outcome.startsWith("applied"));
    const record: ReviewRound = { round, verdict: review.verdict, confidence: review.confidence, outcomes, wordCount: lint.wordCount, pageCount };
    rt.set((x) => {
      x.rounds = [...x.rounds, record];
      x.passed = review.verdict === "NO_CORRECTIONS" && review.confidence === "HIGH";
      x.pending = {
        applied: applied.map((o) => o.correction.id),
        declined: outcomes.filter((o) => o.outcome === "declined").map((o) => ({ id: o.correction.id, reason: o.note })),
        failed: outcomes.filter((o) => o.outcome === "open").map((o) => ({ id: o.correction.id, reason: o.note })),
      };
    });
    rt.status(
      review.verdict === "NO_CORRECTIONS"
        ? `Review round ${n} of ${maxRounds}: no corrections (${review.confidence.toLowerCase()} confidence)`
        : `Review round ${n} of ${maxRounds}: ${applied.length} fix${applied.length === 1 ? "" : "es"} applied`,
    );
  }
}

/** Corrections still open after the loop stopped without a pass. */
export function openCorrections(p: Project): CorrectionOutcome[] {
  if (p.passed || !p.rounds.length) return [];
  return p.rounds[p.rounds.length - 1].outcomes.filter((o) => o.outcome === "declined" || o.outcome === "open");
}

export async function saveVersion(rt: Runtime, label: string): Promise<void> {
  const p = rt.get();
  if (!p.doc) return;
  const format = formatFor(p);
  const built = await measurePdf(p.doc, format);
  const version: Version = {
    id: newId("v"),
    label,
    createdAt: new Date().toISOString(),
    doc: cloneDoc(p.doc),
    preHumanize: p.preHumanize ? cloneDoc(p.preHumanize) : null,
    format: built.layout.format,
    rounds: JSON.parse(JSON.stringify(p.rounds)) as ReviewRound[],
    passed: p.passed,
    wordCount: bodyWords(p.doc),
    pageCount: built.pageCount,
  };
  rt.set((x) => {
    x.versions = [...x.versions, version];
    x.currentVersionId = version.id;
  });
}

export function restoreVersion(rt: Runtime, id: string): void {
  rt.set((x) => {
    const v = x.versions.find((y) => y.id === id);
    if (!v) return;
    x.prevDoc = x.doc ? cloneDoc(x.doc) : null;
    x.doc = cloneDoc(v.doc);
    x.preHumanize = v.preHumanize ? cloneDoc(v.preHumanize) : null;
    x.rounds = JSON.parse(JSON.stringify(v.rounds)) as ReviewRound[];
    x.passed = v.passed;
    x.currentVersionId = v.id;
    // The reviewer conversation belongs to another text now; the next review starts fresh.
    x.reviewer = null;
    x.pending = null;
  });
}

/* -------------------------------------------------------------- edit chat */

export async function runChatEdit(rt: Runtime, request: string): Promise<void> {
  const start = rt.get();
  if (!start.doc) throw new StageFailure("edit", "no_draft", "Write a draft first.");
  const before = cloneDoc(start.doc);
  const say = (m: Omit<ChatMessage, "id" | "at">) => rt.set((x) => (x.chat = [...x.chat, { id: newId("c"), at: new Date().toISOString(), ...m }]));
  say({ role: "user", text: request });

  // 1. The writer makes the smallest edit that does what was asked.
  rt.status("Making the change");
  const res = await rt.call<EditOutput>("/api/edit", { ctx: writingContext(start), sections: before.sections, task: { mode: "chat", request } satisfies EditTask }, "Edit request");
  if (res.declined) {
    say({ role: "app", text: `Not changed: ${res.declineReason || "the request conflicts with an official requirement."}` });
    return;
  }
  const newFacts = res.newFacts.map((f) => cleanText(f).trim()).filter(Boolean);
  rt.set((x) => {
    // Facts stated in chat become user facts, so the reviewer accepts them.
    if (x.facts) for (const text of newFacts) x.facts.items.push({ id: newId("fact"), category: "other", text, source: "user" });
    x.prevDoc = before;
    x.doc = assemble(x, res.sections);
    x.passed = false;
  });
  if (sameDoc(rt.get().doc, before)) {
    say({ role: "app", text: res.note || "Nothing needed to change." });
    return;
  }

  // 2. Humanizer rules, on the edited paragraphs only.
  const old = new Set(before.sections.flatMap((s) => s.paragraphs));
  const changed = res.sections.flatMap((s) => s.paragraphs).filter((para) => !old.has(para));
  if (changed.length) {
    rt.status("Humanizer pass on the edited text");
    const p = rt.get();
    const h = await rt.call<{ sections: DocSection[] }>("/api/humanize", { ctx: writingContext(p), sections: p.doc!.sections, onlyParagraphs: changed }, "Humanize edit");
    rt.set((x) => (x.doc = assemble(x, h.sections)));
  }

  // 3-4. Lint and review (the lint runs inside each review round), capped per edit.
  await reviewLoop(rt, rt.info.maxEditReviewRounds, { request, newFacts });

  // 5. Files are rebuilt from the new version.
  await saveVersion(rt, `Edit ${rt.get().versions.filter((v) => v.label.startsWith("Edit")).length + 1}`);
  const end = rt.get();
  say({
    role: "app",
    text: `${res.note || "Changed."} ${end.passed ? "The review passed." : "The review has not passed yet; see the review log."}`,
    before: bodyToText(before),
    after: bodyToText(end.doc!),
  });
}
