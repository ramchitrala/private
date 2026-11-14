import type { Project } from "../types";

// Plain-language layer. The pipeline and the server speak in technical status lines and
// error codes; the applicant only ever sees the words in this file.

export type StageKey =
  | "resume"
  | "open-page"
  | "read-instructions"
  | "verify"
  | "questions"
  | "draft"
  | "natural"
  | "check"
  | "files"
  | "change"
  | "smooth"
  | "working";

export interface Stage {
  key: StageKey;
  label: string;
  /** A short second line, such as "Check 2 of up to 5". Empty keeps the previous detail. */
  detail: string;
}

const LABEL: Record<StageKey, string> = {
  resume: "Reading your resume",
  "open-page": "Opening the program page",
  "read-instructions": "Reading the instructions",
  verify: "Checking each instruction against the page",
  questions: "Seeing if we need anything else from you",
  draft: "Writing your first draft",
  natural: "Making it sound natural",
  check: "Checking it against the instructions",
  files: "Preparing your files",
  change: "Making your change",
  smooth: "Smoothing the new wording",
  working: "Working on it",
};

/**
 * Map a status line from the pipeline or the server to a plain stage.
 * Returns null for lines that carry no news for the applicant (they keep the current stage).
 */
export function stageFor(message: string): Stage | null {
  const m = message.trim();
  const stage = (key: StageKey, detail = ""): Stage => ({ key, label: LABEL[key], detail });
  if (!m || /^Mock mode/i.test(m) || /^Still working on a long step/i.test(m)) return null;
  if (/^Reading your resume/i.test(m)) return stage("resume");
  if (/^Searching .* for statement instructions/i.test(m)) return stage("open-page");
  if (/^Reading (the fetched pages|\d+ pages?) for statement instructions/i.test(m)) return stage("read-instructions");
  if (/^Checking every quote/i.test(m)) return stage("verify");
  if (/^Checking what the instructions ask for/i.test(m)) return stage("questions");
  if (/^Writing the draft/i.test(m)) return stage("draft");
  if (/^Humanizer pass on the edited text/i.test(m)) return stage("smooth");
  if (/^Humanizer pass/i.test(m)) return stage("natural");
  let r = m.match(/^Review round (\d+) of (\d+): applying fix (\d+) of (\d+)/i);
  if (r) return stage("check", `Fixing ${r[3]} of ${r[4]} thing${r[4] === "1" ? "" : "s"}`);
  r = m.match(/^Review round (\d+) of (\d+)(?::|$)/i);
  if (r) return stage("check", `Check ${r[1]} of up to ${r[2]}`);
  // The server's own round line counts every round the statement ever had; it adds nothing here.
  if (/^Review round \d+$/i.test(m)) return { ...stage("check"), detail: "" };
  r = m.match(/^Over the limit .*: trimming to (.+)$/i);
  if (r) return stage("check", `Shortening it to fit ${r[1]}`);
  if (/^Over the limit|^Trimming to fit/i.test(m)) return stage("check", "Shortening it to fit the limit");
  if (/^Preparing your files/i.test(m)) return stage("files");
  if (/^Making the change/i.test(m)) return stage("change");
  return stage("working");
}

export const BUSY_LINE = "The writing service is busy. Trying again automatically.";

/** The four stages shown while a statement is written, in order. */
export const WRITING_STAGES: { key: StageKey; label: string }[] = [
  { key: "draft", label: LABEL.draft },
  { key: "natural", label: LABEL.natural },
  { key: "check", label: LABEL.check },
  { key: "files", label: LABEL.files },
];

export interface PlainError {
  heading: string;
  body: string;
  /** Research failures get the paste box and "Use a different link". */
  kind: "research" | "resume-file" | "passcode" | "general";
}

const RESEARCH_CODES = [
  "program_page_not_fetched",
  "url_not_accessible",
  "empty_page",
  "no_pages",
  "search_failed",
  "nothing_to_read",
  "web_fetch",
  "web_search",
  "pause_limit",
];

/**
 * Turn a stage failure code into words for the applicant. `stage` is the step that failed
 * (for example "research/gather"). The raw code stays under "Technical details".
 */
export function errorFor(code: string, stage = ""): PlainError {
  if (code.startsWith("link_")) {
    return { heading: "That link can't be used", body: "Use the program's page on the university's own website.", kind: "general" };
  }
  // Only a fetch or search that failed means the page couldn't be opened. A timeout counts only when it
  // happened while fetching (the failing step is "research/gather"), not while reading or asking questions.
  if (RESEARCH_CODES.includes(code) || (/^research[/-]gather/i.test(stage) && ["timeout", "stream", "http"].includes(code))) {
    return {
      heading: "We couldn't open that page",
      body: "Some university sites block automatic visits. Nothing was guessed, and your details are saved.",
      kind: "research",
    };
  }
  switch (code) {
    case "busy":
      return { heading: "The writing service is too busy right now", body: "Wait a minute, then retry. Your finished work is saved.", kind: "general" };
    case "timeout":
    case "stream":
    case "http":
    case "max_tokens":
    case "model_context_window_exceeded":
    case "bad_json":
      return { heading: "This step didn't finish", body: "Your finished work is saved. Retry this step to pick up where it stopped.", kind: "general" };
    case "network":
      return { heading: "We couldn't reach SOP Desk", body: "Check your internet connection, then retry. Your finished work is saved.", kind: "general" };
    case "empty_resume":
    case "pdf_text_extraction_failed":
    case "no_resume":
      return { heading: "We couldn't read text from that file", body: "It may be a scanned image. Paste the text of your resume instead, or try a different file.", kind: "resume-file" };
    case "too_large":
      return { heading: "That file is over 3 MB", body: "Try a smaller file, or paste the text instead.", kind: "resume-file" };
    case "passcode":
      return { heading: "Your passcode was not accepted", body: "Enter it again.", kind: "passcode" };
    case "refusal":
      return { heading: "This step was declined", body: "Nothing was changed. Try again, or change what you asked for.", kind: "general" };
    case "structure_changed":
    case "current_text":
    case "no_draft":
    case "no_facts":
    case "no_research":
      return { heading: "Something changed while this was running", body: "Retry this step.", kind: "general" };
    default:
      return { heading: "Something went wrong in this step", body: "Your finished work is saved.", kind: "general" };
  }
}

export function isResearchError(code: string, stage = ""): boolean {
  return errorFor(code, stage).kind === "research";
}

/* ------------------------------------------------------------ home list */

export type StatementStatus = "Ready to download" | "Waiting for you" | "Not finished" | "Couldn't open the program page";

export function statementStatus(p: Project): StatementStatus {
  if (p.doc) return "Ready to download";
  if (p.lastError && isResearchError(p.lastError.code, p.lastError.stage) && !p.research) return "Couldn't open the program page";
  if (p.research && !p.preHumanize) return "Waiting for you";
  return "Not finished";
}

export function statementTitle(p: Project): { program: string; university: string } {
  const program = p.research?.details.find((d) => d.kind === "program" && d.verified)?.value ?? "";
  const university = p.research?.details.find((d) => d.kind === "university" && d.verified)?.value ?? "";
  let site = "";
  try {
    site = p.inputs.programUrl.trim() ? new URL(/^https?:/i.test(p.inputs.programUrl) ? p.inputs.programUrl : `https://${p.inputs.programUrl}`).hostname.replace(/^www\./, "") : "";
  } catch {
    site = "";
  }
  return { program: program || "New statement", university: university || site };
}

/* -------------------------------------------------------------- formatting */

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${shortDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Words that must never appear in the main path (outside "Show details" and "Technical details"). */
export const BANNED_WORDS = [
  "project",
  "facts",
  "requirements",
  "humanizer",
  "verdict",
  "reviewer",
  "lint",
  "style flags",
  "tokens",
  "fixtures",
  "registrable",
  "Passed review",
  "Not passed",
  "Not met",
  "Must fix",
];
