import type { DocModel, LintResult } from "./types";
import { bodyWords, sectionWords } from "./docmodel";

/**
 * Stock words from section 12 of the vendored humanizer skill ("Overused AI words").
 * Each entry is a label and a pattern that covers its inflections.
 */
const STOCK_WORDS: [string, RegExp][] = [
  ["actually", /\bactually\b/gi],
  ["additionally", /\badditionally\b/gi],
  ["align with", /\balign(?:s|ed|ing)?\s+with\b/gi],
  ["bolstered", /\bbolster(?:s|ed|ing)?\b/gi],
  ["crucial", /\bcrucial(?:ly)?\b/gi],
  ["deep dive", /\bdeep[- ]dive\b/gi],
  ["delve", /\bdelv(?:e|es|ed|ing)\b/gi],
  ["enduring", /\benduring\b/gi],
  ["enhance", /\benhanc(?:e|es|ed|ing|ement|ements)\b/gi],
  ["garner", /\bgarner(?:s|ed|ing)?\b/gi],
  ["highlight", /\bhighlight(?:s|ed|ing)?\b/gi],
  ["interplay", /\binterplay\b/gi],
  ["intricate", /\bintrica(?:te|tely|cy|cies)\b/gi],
  ["key (adjective)", /\b(?:a|the|several|many|few|one|two|three|is|are|was|were|played?|plays|playing)\s+key\s+(?!to\b|for\b|in\b|on\b|of\b)[a-z]+/gi],
  ["landscape", /\blandscapes?\b/gi],
  ["meticulous", /\bmeticulous(?:ly)?\b/gi],
  ["pivotal", /\bpivotal\b/gi],
  ["quietly", /\bquietly\b/gi],
  ["robust", /\brobust(?:ly|ness)?\b/gi],
  ["showcase", /\bshowcas(?:e|es|ed|ing)\b/gi],
  ["tapestry", /\btapestr(?:y|ies)\b/gi],
  ["testament", /\btestament\b/gi],
  ["underscore", /\bunderscor(?:e|es|ed|ing)\b/gi],
  ["valuable", /\b(?:in)?valuable\b/gi],
  ["vibrant", /\bvibrant\b/gi],
];

const CONTRAST_PATTERNS: RegExp[] = [
  /\bnot\s+(?:just|only|merely|simply)\b[^.!?]{0,160}?\bbut\b/gi,
  /\b(?:it|this|that)(?:'s|’s| is| was)\s+not\s+[^.!?,;]{1,80}[,;]\s*(?:it|this|that)(?:'s|’s| is| was)\b/gi,
  /\b(?:it|this|that)\s+(?:isn't|isn’t|wasn't|wasn’t)\s+[^.!?,;]{1,80}[,;]\s*(?:it|this|that)(?:'s|’s| is| was)\b/gi,
];

/** Count sentence ends; abbreviations such as "U.S." or "M.S." are not sentence ends. */
export function sentenceCount(paragraph: string): number {
  const text = paragraph
    .trim()
    .replace(/\b(?:[A-Za-z]\.){2,}/g, "X")
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|vs|etc|e\.g|i\.e|No|St)\./gi, "X");
  const ends = text.match(/[.!?]+(?=["')\]]*(?:\s|$))/g);
  return Math.max(1, ends ? ends.length : 0);
}

function countAll(text: string, re: RegExp): string[] {
  re.lastIndex = 0;
  return text.match(re) ?? [];
}

/** Per-section word limits, keyed by section index (0 when there is none). */
export function lintDoc(doc: DocModel, sectionLimits: number[] = []): LintResult {
  const paragraphs = doc.sections.flatMap((s) => s.paragraphs);
  const body = [...doc.sections.map((s) => s.heading), ...paragraphs].join("\n");

  const stockWords = STOCK_WORDS.map(([word, re]) => ({ word, count: countAll(body, re).length })).filter((w) => w.count > 0);
  const contrastPatterns = CONTRAST_PATTERNS.flatMap((re) => paragraphs.flatMap((p) => countAll(p, re))).map((m) => m.trim());

  // A one-sentence paragraph that closes a section (or the document) after other paragraphs.
  const oneSentenceClosers: string[] = [];
  doc.sections.forEach((s, i) => {
    const last = s.paragraphs[s.paragraphs.length - 1];
    if (!last) return;
    const hasCompany = s.paragraphs.length > 1 || (!s.heading && i > 0);
    if (hasCompany && sentenceCount(last) === 1) oneSentenceClosers.push(last);
  });
  if (doc.sections.length === 1 && doc.sections[0].paragraphs.length === 1) oneSentenceClosers.length = 0;

  return {
    emDashes: countAll(body, /—/g).length,
    enDashes: countAll(body, /–/g).length,
    stockWords,
    contrastPatterns,
    oneSentenceClosers,
    wordCount: bodyWords(doc),
    perSection: doc.sections.map((s, i) => ({ heading: s.heading, words: sectionWords(s), limit: sectionLimits[i] ?? 0 })),
  };
}

export function lintIssueCount(l: LintResult): number {
  return l.emDashes + l.enDashes + l.stockWords.reduce((n, w) => n + w.count, 0) + l.contrastPatterns.length + l.oneSentenceClosers.length;
}
