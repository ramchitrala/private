import type { DocModel, DocSection } from "./types";

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Words in the body: section headings are not counted, paragraphs are. */
export function sectionWords(section: DocSection): number {
  return section.paragraphs.reduce((n, p) => n + countWords(p), 0);
}

export function bodyWords(doc: DocModel): number {
  return doc.sections.reduce((n, s) => n + sectionWords(s), 0);
}

/** Plain text of the whole document, one block per line group. */
export function docToText(doc: DocModel): string {
  const out: string[] = [doc.title, ...doc.header.map((h) => (h.label ? `${h.label}: ${h.value}` : h.value)), ""];
  for (const s of doc.sections) {
    if (s.heading) out.push(s.heading);
    out.push(...s.paragraphs, "");
  }
  return out.join("\n").trim();
}

export function bodyToText(doc: DocModel): string {
  const out: string[] = [];
  for (const s of doc.sections) {
    if (s.heading) out.push(s.heading);
    out.push(...s.paragraphs, "");
  }
  return out.join("\n").trim();
}

export function cloneDoc(doc: DocModel): DocModel {
  return JSON.parse(JSON.stringify(doc)) as DocModel;
}

/** Drop empty paragraphs and trim strings so the model can't leave stray blanks. */
export function tidySections(sections: DocSection[]): DocSection[] {
  return sections
    .map((s) => ({
      heading: (s.heading ?? "").trim(),
      paragraphs: (s.paragraphs ?? []).map((p) => p.replace(/\s*\n+\s*/g, " ").trim()).filter(Boolean),
    }))
    .filter((s) => s.heading || s.paragraphs.length);
}

export function sameDoc(a: DocModel | null, b: DocModel | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let counter = 0;
export function newId(prefix = "id"): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
