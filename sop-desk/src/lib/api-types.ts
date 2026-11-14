import type { DocFormat, DocModel, DocSection, FactSheet, GatherResult, LintResult, ProgramDetail, ReqItem } from "./types";

// Request bodies for the stage routes, shared by the browser and the server.

export interface WritingContext {
  facts: FactSheet;
  items: ReqItem[];
  details: ProgramDetail[];
  format: DocFormat;
  title: string;
  header: DocModel["header"];
  usSpelling: boolean;
  notes: string;
  voiceSample: string;
  retryNote?: string;
}

export interface FactsBody {
  kind: "pdf" | "docx" | "text";
  /** Base64 file content for pdf and docx. */
  data?: string;
  text?: string;
}

export interface GatherBody {
  programUrl: string;
  extraLinks: string[];
  confirmedDomains: string[];
  entryTerm: string;
  concentration: string;
}

export interface ExtractBody {
  programUrl: string;
  domains: string[];
  /** Null when the automatic research failed and the user pasted the instructions instead. */
  gather: GatherResult | null;
  pastedInstructions: string;
  concentration: string;
}

export interface QuestionsBody {
  facts: FactSheet;
  items: ReqItem[];
}

export interface DraftBody {
  ctx: WritingContext;
}

export interface HumanizeBody {
  ctx: WritingContext;
  sections: DocSection[];
  /** When set, only these paragraphs may change (used after an edit request). */
  onlyParagraphs?: string[];
}

export type EditTask =
  | { mode: "correction"; currentText: string; replacementText: string; reason: string }
  | { mode: "chat"; request: string }
  | { mode: "trim"; problem: string };

export interface EditBody {
  ctx: WritingContext;
  sections: DocSection[];
  task: EditTask;
}

export interface ReviewInputs {
  facts: FactSheet;
  items: ReqItem[];
  details: ProgramDetail[];
  format: DocFormat;
  notes: string;
  preHumanize: DocModel | null;
  doc: DocModel;
  lint: LintResult;
  pageCount: number;
}

export interface ReviewFollowUp {
  round: number;
  applied: string[];
  declined: { id: string; reason: string }[];
  failed: { id: string; reason: string }[];
  /** Set when the applicant asked for a change through the edit chat. */
  userRequest?: string;
  newFacts?: string[];
  doc: DocModel;
  lint: LintResult;
  pageCount: number;
  format: DocFormat;
}

export interface ReviewBody {
  round: number;
  /** The raw reviewer conversation so far; null starts a new one. */
  conversation: unknown[] | null;
  first?: ReviewInputs;
  next?: ReviewFollowUp;
}

export interface AppInfo {
  ok: boolean;
  mock: boolean;
  model: string;
  maxReviewRounds: number;
  maxEditReviewRounds: number;
}
