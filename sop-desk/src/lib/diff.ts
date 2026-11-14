import { diffWordsWithSpace } from "diff";

export interface DiffPart {
  text: string;
  op: "same" | "add" | "del";
}

export function diffText(before: string, after: string): DiffPart[] {
  return diffWordsWithSpace(before, after).map((p) => ({ text: p.value, op: p.added ? "add" : p.removed ? "del" : "same" }));
}

/** Paragraph-level view of the new text, with words that are new marked. */
export function changedWords(before: string, after: string): DiffPart[] {
  return diffText(before, after).filter((p) => p.op !== "del");
}
