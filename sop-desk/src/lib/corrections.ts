import type { DocModel } from "./types";
import { cloneDoc } from "./docmodel";

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

type Slot = { get: () => string; set: (v: string) => void };

function slots(doc: DocModel): Slot[] {
  const out: Slot[] = [{ get: () => doc.title, set: (v) => (doc.title = v) }];
  doc.header.forEach((h) => out.push({ get: () => h.value, set: (v) => (h.value = v) }));
  doc.sections.forEach((s) => {
    out.push({ get: () => s.heading, set: (v) => (s.heading = v) });
    s.paragraphs.forEach((_, i) => out.push({ get: () => s.paragraphs[i], set: (v) => (s.paragraphs[i] = v) }));
  });
  return out;
}

export type ExactResult =
  | { status: "applied"; doc: DocModel }
  | { status: "not-found" | "ambiguous" | "no-change"; count: number };

/**
 * Apply a correction by exact replacement, but only when `currentText` occurs
 * exactly once in the whole document. Anything else is left for the writer.
 */
export function applyExactOnce(doc: DocModel, currentText: string, replacementText: string): ExactResult {
  if (!currentText) return { status: "not-found", count: 0 };
  if (currentText === replacementText) return { status: "no-change", count: 0 };
  const copy = cloneDoc(doc);
  const all = slots(copy);
  const counts = all.map((s) => occurrences(s.get(), currentText));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return { status: "not-found", count: 0 };
  if (total > 1) return { status: "ambiguous", count: total };
  const slot = all[counts.findIndex((c) => c === 1)];
  slot.set(slot.get().replace(currentText, () => replacementText));
  // A replacement that empties a paragraph removes it.
  copy.sections.forEach((s) => (s.paragraphs = s.paragraphs.filter((p) => p.trim())));
  return { status: "applied", doc: copy };
}
