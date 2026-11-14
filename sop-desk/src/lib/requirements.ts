import type {
  DocFormat,
  DocModel,
  FactSheet,
  GatherResult,
  ProgramDetail,
  ProjectInputs,
  ReqItem,
  ReqKind,
  ReqLevel,
  Research,
  ResearchStatus,
  SourcePage,
} from "./types";
import { INSTRUCTION_KINDS } from "./types";
import { verifyQuote } from "./quotes";
import { bodyWords, newId, sectionWords } from "./docmodel";
import { registrableDomain } from "./domains";

/** Shape of the JSON the extract call returns (see server/schemas.ts). */
export interface RawExtract {
  country: string;
  docType: { value: string; quote: string; sourceUrl: string; level: string }[];
  prompts: { text: string; wordMin: number; wordMax: number; quote: string; sourceUrl: string; level: string }[];
  wordLimit: { text: string; min: number; max: number; quote: string; sourceUrl: string; level: string }[];
  pageLimit: { text: string; min: number; max: number; quote: string; sourceUrl: string; level: string }[];
  formatting: { aspect: string; text: string; normalized: string; quote: string; sourceUrl: string; level: string }[];
  topics: { text: string; quote: string; sourceUrl: string; level: string }[];
  avoid: { text: string; quote: string; sourceUrl: string; level: string }[];
  aiPolicy: { text: string; quote: string; sourceUrl: string; level: string }[];
  programDetails: { kind: string; value: string; quote: string; sourceUrl: string }[];
}

const LEVEL_RANK: Record<ReqLevel, number> = { user: 0, program: 1, department: 2, guidance: 3 };

function level(raw: string): ReqLevel {
  const v = raw.toLowerCase();
  return v === "program" || v === "department" || v === "guidance" || v === "user" ? v : "department";
}

const ASPECT_KIND: Record<string, ReqKind> = {
  font: "font",
  size: "fontSize",
  spacing: "spacing",
  margins: "margins",
  filetype: "fileType",
  other: "formatOther",
};

const DETAIL_KINDS = ["university", "program", "school", "concentration", "course", "lab", "facultyArea", "feature"];

function int(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Turn the raw extraction into flat items. Nothing is verified yet. */
export function itemsFromExtract(raw: RawExtract, origin: "official" | "user" = "official"): { items: ReqItem[]; details: ProgramDetail[] } {
  const items: ReqItem[] = [];
  const add = (kind: ReqKind, r: { text: string; quote: string; sourceUrl: string; level: string }, extra: Partial<ReqItem> = {}) => {
    if (!r.text?.trim()) return;
    items.push({
      id: newId("req"),
      kind,
      text: r.text.trim(),
      min: 0,
      max: 0,
      normalized: "",
      quote: (r.quote ?? "").trim(),
      sourceUrl: (r.sourceUrl ?? "").trim(),
      level: origin === "user" ? "user" : level(r.level),
      verified: false,
      origin,
      ...extra,
    });
  };
  (raw.docType ?? []).forEach((r) => add("docType", { ...r, text: r.value }));
  (raw.prompts ?? []).forEach((r) => add("prompt", r, { min: int(r.wordMin), max: int(r.wordMax) }));
  (raw.wordLimit ?? []).forEach((r) => add("wordLimit", r, { min: int(r.min), max: int(r.max) }));
  (raw.pageLimit ?? []).forEach((r) => add("pageLimit", r, { min: int(r.min), max: int(r.max) }));
  (raw.formatting ?? []).forEach((r) =>
    add(ASPECT_KIND[(r.aspect ?? "").toLowerCase()] ?? "formatOther", r, { normalized: (r.normalized ?? "").trim() }),
  );
  (raw.topics ?? []).forEach((r) => add("topic", r));
  (raw.avoid ?? []).forEach((r) => add("avoid", r));
  (raw.aiPolicy ?? []).forEach((r) => add("aiPolicy", r));

  const details: ProgramDetail[] = (raw.programDetails ?? [])
    .filter((d) => d.value?.trim() && DETAIL_KINDS.includes(d.kind))
    .map((d) => ({
      id: newId("det"),
      kind: d.kind as ProgramDetail["kind"],
      value: d.value.trim(),
      quote: (d.quote ?? "").trim(),
      sourceUrl: (d.sourceUrl ?? "").trim(),
      verified: false,
      origin,
    }));
  return { items, details };
}

export interface Verified {
  items: ReqItem[];
  details: ProgramDetail[];
  dropped: Research["dropped"];
}

/** Check every quote against the fetched text. Items whose quote fails are dropped and reported. */
export function verifyAll(items: ReqItem[], details: ProgramDetail[], pages: SourcePage[]): Verified {
  const dropped: Research["dropped"] = [];
  const keptItems: ReqItem[] = [];
  for (const item of items) {
    const check = verifyQuote(item.quote, item.sourceUrl, pages);
    if (check.verified) keptItems.push({ ...item, verified: true, sourceUrl: check.sourceUrl });
    else dropped.push({ text: item.text, quote: item.quote, reason: check.reason });
  }
  const keptDetails: ProgramDetail[] = [];
  for (const d of details) {
    const check = verifyQuote(d.quote, d.sourceUrl, pages);
    // A detail must also be named in its own quote, so a real quote can't carry an invented name.
    const named = check.verified && d.quote.toLowerCase().includes(d.value.toLowerCase().slice(0, 12));
    if (check.verified && (named || d.kind === "feature" || d.kind === "facultyArea")) {
      keptDetails.push({ ...d, verified: true, sourceUrl: check.sourceUrl });
    } else {
      dropped.push({ text: d.value, quote: d.quote, reason: check.verified ? "The quote does not name this detail." : check.reason });
    }
  }
  return { items: keptItems, details: keptDetails, dropped };
}

/**
 * Precedence, applied per kind of requirement: program-specific instructions win over
 * department or graduate-school instructions, which win over general writing guidance.
 * Items the user typed win over everything.
 */
export function applyPrecedence(items: ReqItem[]): { kept: ReqItem[]; overridden: ReqItem[] } {
  const exclusive: ReqKind[] = ["docType", "prompt", "wordLimit", "pageLimit", "font", "fontSize", "spacing", "margins", "fileType"];
  const kept: ReqItem[] = [];
  const overridden: ReqItem[] = [];
  for (const item of items) {
    if (!exclusive.includes(item.kind)) {
      kept.push(item);
      continue;
    }
    const best = Math.min(...items.filter((i) => i.kind === item.kind).map((i) => LEVEL_RANK[i.level]));
    (LEVEL_RANK[item.level] === best ? kept : overridden).push(item);
  }
  // Single-valued kinds keep the first item at the winning level.
  const single: ReqKind[] = ["docType", "wordLimit", "pageLimit", "font", "fontSize", "spacing", "margins"];
  const seen = new Set<ReqKind>();
  const final: ReqItem[] = [];
  for (const item of kept) {
    if (single.includes(item.kind)) {
      if (seen.has(item.kind)) {
        overridden.push(item);
        continue;
      }
      seen.add(item.kind);
    }
    final.push(item);
  }
  return { kept: final, overridden };
}

export class ResearchError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Fallback gate. The default structure is allowed only after the research really ran:
 * the program page was fetched and at least one search completed. A failed fetch,
 * a blocked site or a search error is an error the user must see, never a silent fallback.
 */
export function decideStatus(gather: GatherResult, items: ReqItem[], details: ProgramDetail[]): ResearchStatus {
  const hasInstructions = items.some((i) => i.verified && INSTRUCTION_KINDS.includes(i.kind));
  if (hasInstructions) return "official";
  if (!gather.programPageFetched) {
    const err = gather.fetchErrors[0];
    throw new ResearchError(
      "program_page_not_fetched",
      `The program page could not be fetched${err ? ` (${err.code})` : ""}. Nothing was assumed. Try again, or paste the statement instructions yourself.`,
    );
  }
  if (gather.searchCount === 0 || gather.searchErrors.length >= Math.max(1, gather.searchCount)) {
    throw new ResearchError(
      "search_failed",
      "The search for statement instructions did not complete, so I can't say none exist. Try again, or paste the instructions yourself.",
    );
  }
  return details.some((d) => d.verified) ? "program-only" : "none";
}

export function statusLine(status: ResearchStatus, domains: string[], items: ReqItem[]): string {
  const where = domains[0] ?? "the university's site";
  if (status === "official") {
    return items.some((i) => i.origin === "official")
      ? `Following the official instructions on ${where}.`
      : "Following the instructions you entered.";
  }
  if (status === "program-only") return `No statement instructions found on ${where}, so this uses the default structure, tailored with the program details.`;
  return `No statement instructions found on ${where}, so this uses the default structure.`;
}

export function detailValue(details: ProgramDetail[], kind: ProgramDetail["kind"]): string {
  return details.find((d) => d.kind === kind && d.verified)?.value ?? "";
}

/** US programs get US Letter and US spelling; everything else gets A4. */
export function isUS(research: Pick<Research, "programUrl" | "country">): boolean {
  const c = (research.country ?? "").trim().toLowerCase();
  if (c) return ["us", "usa", "united states", "united states of america"].includes(c);
  const d = registrableDomain(research.programUrl) ?? "";
  return d.endsWith(".edu") || d.endsWith(".us");
}

function fontFamily(name: string): { font: DocFormat["font"]; docxFont: string } | null {
  const n = name.toLowerCase();
  if (/times|serif(?!.*sans)|garamond|georgia|cambria/.test(n) && !/sans/.test(n)) return { font: "serif", docxFont: "Times New Roman" };
  if (/calibri|carlito/.test(n)) return { font: "calibri", docxFont: "Calibri" };
  if (/arial|helvetica|sans/.test(n)) return { font: "sans", docxFont: "Arial" };
  return null;
}

function spacingMultiple(normalized: string, text: string): number {
  const v = `${normalized} ${text}`.toLowerCase();
  if (/double|\b2(\.0)?\b/.test(v)) return 2;
  if (/1\.5|one[- ]and[- ]a[- ]half/.test(v)) return 1.5;
  if (/single|\b1(\.0)?\b/.test(v)) return 1;
  return 0;
}

function firstNumber(...sources: string[]): number {
  for (const s of sources) {
    const m = s.match(/\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return 0;
}

/** Single spacing in Word is about 1.15 x the font size; the default look uses a 1.33 line height. */
export const SINGLE_LINE_FACTOR = 1.15;
const DEFAULT_LINE_MULTIPLE = 1.33 / SINGLE_LINE_FACTOR;

/**
 * Work out the layout. Official formatting wins; everything else comes from the
 * default look (section 5 of the brief).
 */
export function resolveFormat(research: Research | null): DocFormat {
  const items = research ? research.items.filter((i) => i.verified) : [];
  const status = research?.status ?? "none";
  const find = (kind: ReqKind) => items.find((i) => i.kind === kind);
  const prompts = items.filter((i) => i.kind === "prompt");

  const format: DocFormat = {
    shape: status !== "official" ? "sections" : prompts.length ? "questions" : "essay",
    page: research && !isUS(research) ? "a4" : "letter",
    marginIn: 1,
    font: "sans",
    docxFont: "Arial",
    sizePt: 11,
    lineMultiple: DEFAULT_LINE_MULTIPLE,
    paraAfterPt: 11,
    firstLineIndentIn: 0,
    titlePt: 22,
    headingPt: 13,
    wordMin: 900,
    wordMax: 1200,
    pageMax: 0,
    locked: { size: false, spacing: false, margins: false },
  };

  if (status === "official") {
    // Official limits replace the default length; with none given the default range is a guide only.
    const wl = find("wordLimit");
    const promptMax = prompts.reduce((n, p) => n + p.max, 0);
    if (wl && (wl.min || wl.max)) {
      format.wordMin = wl.min;
      format.wordMax = wl.max;
    } else if (prompts.length && prompts.every((p) => p.max > 0)) {
      format.wordMin = 0;
      format.wordMax = promptMax;
    } else {
      format.wordMin = 0;
      format.wordMax = 0;
    }
    const pl = find("pageLimit");
    if (pl && (pl.max || pl.min)) format.pageMax = pl.max || pl.min;
  }

  const font = find("font");
  const family = font ? fontFamily(`${font.normalized} ${font.text}`) : null;
  if (family) Object.assign(format, family);

  const size = find("fontSize");
  const sizePt = size ? firstNumber(size.normalized, size.text) : 0;
  if (sizePt >= 8 && sizePt <= 16) {
    format.sizePt = sizePt;
    format.locked.size = true;
  }

  const spacing = find("spacing");
  const multiple = spacing ? spacingMultiple(spacing.normalized, spacing.text) : 0;
  if (multiple) {
    format.lineMultiple = multiple;
    format.locked.spacing = true;
  }

  const margins = find("margins");
  const marginIn = margins ? firstNumber(margins.normalized, margins.text) : 0;
  if (marginIn >= 0.5 && marginIn <= 2) {
    format.marginIn = marginIn;
    format.locked.margins = true;
  }

  if (format.shape === "essay") {
    // A single essay: no section headings. Double-spaced essays use first-line indents and no gaps.
    if (format.lineMultiple >= 1.5) {
      format.firstLineIndentIn = 0.5;
      format.paraAfterPt = 0;
    } else {
      format.paraAfterPt = format.sizePt;
    }
    format.titlePt = Math.max(format.sizePt + 4, 16);
  } else {
    format.paraAfterPt = format.lineMultiple >= 1.5 ? 0 : format.sizePt;
    if (format.lineMultiple >= 1.5) format.firstLineIndentIn = 0.5;
    format.headingPt = Math.max(13, format.sizePt + 1);
  }
  return format;
}

export function docTitle(research: Research | null): string {
  const t = research?.items.find((i) => i.kind === "docType" && i.verified)?.text.trim();
  if (!t) return "Statement of Purpose";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The header block is built from verified names and the applicant's own inputs, never by the model. */
export function buildHeader(facts: FactSheet | null, research: Research | null, inputs: ProjectInputs): DocModel["header"] {
  const details = research?.details ?? [];
  const header: DocModel["header"] = [];
  if (facts?.applicantName.trim()) header.push({ label: "", value: facts.applicantName.trim() });
  const program = detailValue(details, "program");
  if (program) header.push({ label: "Program", value: program });
  if (inputs.concentration.trim()) header.push({ label: "Concentration", value: inputs.concentration.trim() });
  const university = detailValue(details, "university");
  if (university) header.push({ label: "University", value: university });
  const school = detailValue(details, "school");
  if (school) header.push({ label: "School", value: school });
  if (inputs.entryTerm.trim()) header.push({ label: "Entry Term", value: inputs.entryTerm.trim() });
  return header;
}

export function universityName(research: Research | null): string {
  return detailValue(research?.details ?? [], "university") || research?.domains[0] || "University";
}

export function fileBaseName(doc: DocModel, research: Research | null): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
  return `${clean(doc.title || "Statement of Purpose")} - ${clean(universityName(research))}`;
}

/** Per-section word limits for the "questions" shape: section i answers prompt i. */
export function sectionLimits(research: Research | null, format: DocFormat): number[] {
  if (format.shape !== "questions" || !research) return [];
  return research.items.filter((i) => i.kind === "prompt" && i.verified).map((p) => p.max);
}

export interface ChecklistRow {
  item: ReqItem;
  /** true = met, false = not met, null = judged by the reviewer. */
  met: boolean | null;
  note: string;
}

export function checklist(research: Research | null, doc: DocModel | null, format: DocFormat, pageCount: number, passed: boolean): ChecklistRow[] {
  if (!research) return [];
  const prompts = research.items.filter((i) => i.kind === "prompt" && i.verified);
  const words = doc ? bodyWords(doc) : 0;
  return research.items
    .filter((i) => i.verified)
    .map((item): ChecklistRow => {
      if (!doc) return { item, met: null, note: "No draft yet" };
      switch (item.kind) {
        case "docType":
          return { item, met: doc.title.toLowerCase() === item.text.toLowerCase(), note: `Title: ${doc.title}` };
        case "prompt": {
          const s = doc.sections[prompts.indexOf(item)];
          const w = s ? sectionWords(s) : 0;
          if (!s || !w) return { item, met: false, note: "Not answered yet" };
          if (item.max && w > item.max) return { item, met: false, note: `${w} words, limit ${item.max}` };
          return { item, met: passed ? true : null, note: item.max ? `${w} of ${item.max} words` : `${w} words` };
        }
        case "wordLimit": {
          const ok = (!item.max || words <= item.max) && (!item.min || words >= item.min);
          return { item, met: ok, note: `${words} words` };
        }
        case "pageLimit":
          return { item, met: pageCount > 0 ? (!item.max || pageCount <= item.max) && (!item.min || pageCount >= Math.min(item.min, item.max || item.min)) : null, note: `${pageCount || "?"} pages` };
        case "fontSize":
          return { item, met: format.locked.size, note: `${format.sizePt} pt` };
        case "spacing":
          return { item, met: format.locked.spacing, note: format.lineMultiple === 2 ? "Double" : format.lineMultiple === 1 ? "Single" : `${format.lineMultiple}` };
        case "margins":
          return { item, met: format.locked.margins, note: `${format.marginIn} in` };
        case "font":
          return { item, met: fontFamily(`${item.normalized} ${item.text}`) !== null, note: format.docxFont };
        case "fileType":
          return { item, met: /pdf|doc|word/i.test(`${item.normalized} ${item.text}`) ? true : null, note: ".docx and .pdf" };
        default:
          return { item, met: passed ? true : null, note: passed ? "Checked in review" : "Checked by the reviewer" };
      }
    });
}
