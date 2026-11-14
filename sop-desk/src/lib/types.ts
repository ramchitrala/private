// Shared types for the browser and the API routes.

export type FactCategory =
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "certifications"
  | "awards"
  | "other";

export const FACT_CATEGORIES: FactCategory[] = [
  "education",
  "experience",
  "projects",
  "skills",
  "certifications",
  "awards",
  "other",
];

export interface FactItem {
  id: string;
  category: FactCategory;
  text: string;
  /** "resume" came from extraction. "user" was typed by the applicant and is treated as true. */
  source: "resume" | "user";
}

export interface FactSheet {
  applicantName: string;
  items: FactItem[];
}

export interface SourcePage {
  url: string;
  title: string;
  kind: "html" | "pdf" | "pasted";
  text: string;
  retrievedAt: string;
}

export type ReqLevel = "program" | "department" | "guidance" | "user";

export type ReqKind =
  | "docType"
  | "prompt"
  | "wordLimit"
  | "pageLimit"
  | "font"
  | "fontSize"
  | "spacing"
  | "margins"
  | "fileType"
  | "formatOther"
  | "topic"
  | "avoid"
  | "aiPolicy";

/** Kinds that count as "statement instructions" when deciding the research status. */
export const INSTRUCTION_KINDS: ReqKind[] = [
  "prompt",
  "wordLimit",
  "pageLimit",
  "font",
  "fontSize",
  "spacing",
  "margins",
  "formatOther",
  "topic",
  "avoid",
];

export interface ReqItem {
  id: string;
  kind: ReqKind;
  /** What the school says, in plain words. */
  text: string;
  /** Word or page bounds, 0 when not given. */
  min: number;
  max: number;
  /** Machine-readable value for formatting items, e.g. "12", "double", "1", "Times New Roman". */
  normalized: string;
  quote: string;
  sourceUrl: string;
  level: ReqLevel;
  verified: boolean;
  origin: "official" | "user";
}

export type DetailKind =
  | "university"
  | "program"
  | "school"
  | "country"
  | "concentration"
  | "course"
  | "lab"
  | "facultyArea"
  | "feature";

export interface ProgramDetail {
  id: string;
  kind: DetailKind;
  value: string;
  quote: string;
  sourceUrl: string;
  verified: boolean;
  origin: "official" | "user";
}

export type ResearchStatus = "official" | "program-only" | "none";

export interface GatherResult {
  pages: SourcePage[];
  queries: string[];
  searchCount: number;
  fetchCount: number;
  fetchErrors: { url: string; code: string }[];
  searchErrors: string[];
  programPageFetched: boolean;
}

export interface Research {
  programUrl: string;
  domains: string[];
  checkedAt: string;
  gather: GatherResult;
  items: ReqItem[];
  details: ProgramDetail[];
  dropped: { text: string; quote: string; reason: string }[];
  /** Country of the university as the model read it; used for paper size and spelling only. */
  country: string;
  status: ResearchStatus;
  /** One plain line on what the draft will follow. */
  statusLine: string;
}

export interface Question {
  id: string;
  text: string;
  why: string;
  answer: string;
  skipped: boolean;
}

export interface DocSection {
  heading: string;
  paragraphs: string[];
}

export interface DocModel {
  title: string;
  header: { label: string; value: string }[];
  sections: DocSection[];
}

export type DocShape = "sections" | "questions" | "essay";

export interface DocFormat {
  shape: DocShape;
  page: "letter" | "a4";
  marginIn: number;
  font: "sans" | "serif" | "calibri";
  /** Font name written into the .docx. */
  docxFont: string;
  sizePt: number;
  /** Word-style line spacing multiple: 1 = single, 2 = double. */
  lineMultiple: number;
  paraAfterPt: number;
  firstLineIndentIn: number;
  titlePt: number;
  headingPt: number;
  wordMin: number;
  wordMax: number;
  pageMax: number;
  /** True when the value came from an official rule and must not be adjusted. */
  locked: { size: boolean; spacing: boolean; margins: boolean };
}

export interface LintResult {
  emDashes: number;
  enDashes: number;
  stockWords: { word: string; count: number }[];
  contrastPatterns: string[];
  oneSentenceClosers: string[];
  wordCount: number;
  perSection: { heading: string; words: number; limit: number }[];
}

export type Severity = "MUST_FIX" | "SHOULD_FIX";

export interface Correction {
  id: string;
  severity: Severity;
  category: string;
  currentText: string;
  replacementText: string;
  reason: string;
}

export interface ReviewOutput {
  verdict: "NO_CORRECTIONS" | "CORRECTIONS";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  corrections: Correction[];
}

export interface CorrectionOutcome {
  correction: Correction;
  outcome: "applied-exact" | "applied-writer" | "declined" | "open";
  note: string;
}

export interface ReviewRound {
  round: number;
  verdict: ReviewOutput["verdict"];
  confidence: ReviewOutput["confidence"];
  outcomes: CorrectionOutcome[];
  wordCount: number;
  pageCount: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  searches: number;
  fetches: number;
  stopReason: string;
  durationMs: number;
}

export interface RunDetail extends Usage {
  stage: string;
  at: string;
}

export interface Version {
  id: string;
  label: string;
  createdAt: string;
  doc: DocModel;
  preHumanize: DocModel | null;
  format: DocFormat;
  rounds: ReviewRound[];
  passed: boolean;
  wordCount: number;
  pageCount: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "app";
  text: string;
  at: string;
  /** Text before and after, for the diff. */
  before?: string;
  after?: string;
}

export interface ProjectInputs {
  resumeKind: "pdf" | "docx" | "text" | "";
  resumeName: string;
  /** Base64 for uploaded files. */
  resumeData: string;
  resumeText: string;
  programUrl: string;
  entryTerm: string;
  concentration: string;
  extraLinks: string;
  voiceSample: string;
  notes: string;
  pastedInstructions: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  inputs: ProjectInputs;
  facts: FactSheet | null;
  /** Result of the gather call, kept so the extract step can be retried on its own. */
  gathered: { programUrl: string; gather: GatherResult; domains: string[] } | null;
  research: Research | null;
  questions: Question[] | null;
  /** The draft before the humanizer pass, kept for the reviewer. */
  preHumanize: DocModel | null;
  doc: DocModel | null;
  /** Document as it was before the most recent change, for "Text view" highlights. */
  prevDoc: DocModel | null;
  rounds: ReviewRound[];
  passed: boolean;
  /** Raw reviewer conversation, sent back unchanged to continue it. */
  reviewer: unknown[] | null;
  versions: Version[];
  currentVersionId: string;
  chat: ChatMessage[];
  runs: RunDetail[];
  /** What the next review message should report about the previous round. */
  pending: { applied: string[]; declined: { id: string; reason: string }[]; failed: { id: string; reason: string }[] } | null;
  /** Domains the user confirmed as the university's own. */
  confirmedDomains: string[];
}

/** Events sent over the NDJSON stream from every stage route. */
export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "busy" }
  | { type: "progress"; chars: number }
  | { type: "result"; data: unknown; usage: Usage }
  | { type: "error"; stage: string; code: string; message: string };

export interface WriterOutput {
  sections: DocSection[];
}

export interface EditOutput {
  sections: DocSection[];
  declined: boolean;
  declineReason: string;
  newFacts: string[];
  note: string;
}
