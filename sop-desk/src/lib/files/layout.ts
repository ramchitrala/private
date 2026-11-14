import type { DocFormat, DocModel } from "../types";
import { SINGLE_LINE_FACTOR } from "../requirements";

/**
 * A small layout engine shared by the PDF builder and the page count check.
 * It is pure: text measurement is injected, so tests can run it without fonts.
 */

export type FontStyle = "regular" | "bold";
export type Measure = (text: string, style: FontStyle, sizePt: number) => number;

export interface Run {
  text: string;
  style: FontStyle;
}

export interface PlacedLine {
  /** Left edge and baseline, in points from the top-left of the page. */
  x: number;
  y: number;
  sizePt: number;
  runs: Run[];
}

export interface Layout {
  pageWidth: number;
  pageHeight: number;
  pages: PlacedLine[][];
  /** The format actually used, after any small spacing adjustment. */
  format: DocFormat;
  adjusted: boolean;
}

const PAGE = { letter: [612, 792], a4: [595.28, 841.89] } as const;

interface Block {
  kind: "title" | "header" | "heading" | "para";
  lines: Run[][];
  sizePt: number;
  lineHeight: number;
  before: number;
  after: number;
  indentFirst: number;
  keepWithNext: boolean;
  sectionIndex: number;
}

function wrap(runs: Run[], sizePt: number, width: number, firstIndent: number, measure: Measure): Run[][] {
  // Split into words that remember their style, then fill lines greedily.
  const words: Run[] = [];
  for (const run of runs) for (const w of run.text.split(/\s+/).filter(Boolean)) words.push({ text: w, style: run.style });
  const lines: Run[][] = [];
  let line: Run[] = [];
  let used = 0;
  const space = (style: FontStyle) => measure(" ", style, sizePt);
  for (const word of words) {
    const w = measure(word.text, word.style, sizePt);
    const avail = width - (lines.length === 0 ? firstIndent : 0);
    if (line.length && used + space(word.style) + w > avail) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? space(word.style) : 0) + w;
    line.push(word);
  }
  if (line.length) lines.push(line);
  // Merge neighbouring words of one style back into single runs.
  return lines.map((l) => {
    const merged: Run[] = [];
    for (const w of l) {
      const last = merged[merged.length - 1];
      if (last && last.style === w.style) last.text += ` ${w.text}`;
      else merged.push({ text: (merged.length ? " " : "") + w.text, style: w.style });
    }
    return merged;
  });
}

function buildBlocks(doc: DocModel, f: DocFormat, width: number, measure: Measure): Block[] {
  const bodyLine = f.sizePt * SINGLE_LINE_FACTOR * f.lineMultiple;
  const blocks: Block[] = [];
  const push = (b: Partial<Block> & Pick<Block, "kind" | "lines" | "sizePt">) =>
    blocks.push({ lineHeight: bodyLine, before: 0, after: 0, indentFirst: 0, keepWithNext: false, sectionIndex: -1, ...b });

  if (doc.title) {
    push({
      kind: "title",
      lines: wrap([{ text: doc.title, style: "bold" }], f.titlePt, width, 0, measure),
      sizePt: f.titlePt,
      lineHeight: f.titlePt * 1.25,
      after: f.sizePt * 0.6,
      keepWithNext: true,
    });
  }
  doc.header.forEach((h, i) => {
    const runs: Run[] = h.label
      ? [{ text: `${h.label}:`, style: "bold" }, { text: h.value, style: "regular" }]
      : [{ text: h.value, style: "bold" }];
    push({
      kind: "header",
      lines: wrap(runs, f.sizePt, width, 0, measure),
      sizePt: f.sizePt,
      lineHeight: f.sizePt * SINGLE_LINE_FACTOR * Math.min(f.lineMultiple, 1.2),
      after: i === doc.header.length - 1 ? f.sizePt * 1.2 : 0,
      keepWithNext: true,
    });
  });
  doc.sections.forEach((s, si) => {
    if (s.heading) {
      push({
        kind: "heading",
        lines: wrap([{ text: s.heading, style: "bold" }], f.headingPt, width, 0, measure),
        sizePt: f.headingPt,
        lineHeight: Math.max(f.headingPt * 1.3, f.locked.spacing ? bodyLine : 0),
        before: f.sizePt * 0.55,
        after: f.locked.spacing ? 0 : f.sizePt * 0.45,
        keepWithNext: true,
        sectionIndex: si,
      });
    }
    s.paragraphs.forEach((p) => {
      const indent = f.firstLineIndentIn * 72;
      push({
        kind: "para",
        lines: wrap([{ text: p, style: "regular" }], f.sizePt, width, indent, measure),
        sizePt: f.sizePt,
        after: f.paraAfterPt,
        indentFirst: indent,
        sectionIndex: si,
      });
    });
  });
  return blocks;
}

interface Paged {
  pages: PlacedLine[][];
  /** Section index of the first block on the last page, and how many lines that page holds. */
  lastPageFirstSection: number;
  lastPageStartsWithHeading: boolean;
  lastPageLines: number;
}

function paginate(blocks: Block[], f: DocFormat, pageHeight: number): Paged {
  const margin = f.marginIn * 72;
  const bottom = pageHeight - margin;
  const pages: PlacedLine[][] = [[]];
  let y = margin;
  let pendingAfter = 0;
  let lastFirst = { section: -1, heading: false };

  const newPage = (b: Block) => {
    pages.push([]);
    y = margin;
    pendingAfter = 0;
    lastFirst = { section: b.sectionIndex, heading: b.kind === "heading" };
  };
  const place = (b: Block, line: Run[], isFirstLine: boolean) => {
    // Baseline sits about 80% of the way down the line box.
    const baseline = y + (b.lineHeight - b.sizePt * SINGLE_LINE_FACTOR) / 2 + b.sizePt * 0.92;
    pages[pages.length - 1].push({ x: margin + (isFirstLine ? b.indentFirst : 0), y: baseline, sizePt: b.sizePt, runs: line });
    y += b.lineHeight;
  };
  /** Lines of the block that must stay with the start of the block (no widows or orphans). */
  const minStart = (b: Block) => (b.kind === "para" ? (b.lines.length <= 3 ? b.lines.length : 2) : b.lines.length);

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const atTop = pages[pages.length - 1].length === 0;
    const gap = atTop ? 0 : Math.max(pendingAfter, b.before);

    // Room needed to start this block here: its own first lines, plus, when it must
    // stay with what follows (title, header, heading), the start of the next blocks.
    let need = gap + minStart(b) * b.lineHeight;
    if (b.keepWithNext) {
      let prev = b;
      for (let j = i + 1; j < blocks.length; j++) {
        const nb = blocks[j];
        need += Math.max(prev.after, nb.before) + minStart(nb) * nb.lineHeight;
        if (!nb.keepWithNext) break;
        prev = nb;
      }
    }
    if (!atTop && y + need > bottom + 0.01) newPage(b);
    else y += gap;
    if (i === 0) lastFirst = { section: b.sectionIndex, heading: b.kind === "heading" };

    let idx = 0;
    while (idx < b.lines.length) {
      const remaining = b.lines.length - idx;
      const fit = Math.floor((bottom - y + 0.01) / b.lineHeight);
      if (fit >= remaining) {
        for (; idx < b.lines.length; idx++) place(b, b.lines[idx], idx === 0);
        break;
      }
      // Split: keep at least two lines on each side.
      let take = Math.min(fit, remaining - 2);
      if (b.kind !== "para" || take < 2) take = 0;
      const pageEmpty = pages[pages.length - 1].length === 0;
      if (take === 0 && pageEmpty) take = Math.max(1, Math.min(fit, remaining)); // taller than a page: must make progress
      for (let k = 0; k < take; k++, idx++) place(b, b.lines[idx], idx === 0);
      if (idx < b.lines.length) newPage(b);
    }
    pendingAfter = b.after;
  }
  return {
    pages,
    lastPageFirstSection: lastFirst.section,
    lastPageStartsWithHeading: lastFirst.heading,
    lastPageLines: pages[pages.length - 1].length,
  };
}

/** Small spacing adjustments, tried in order. Locked (official) values are never touched. */
function tighten(f: DocFormat, level: number): DocFormat {
  if (level === 0) return f;
  const after = [1, 0.8, 0.65, 0.5][level] ?? 0.5;
  const line = f.locked.spacing ? 1 : ([1, 1, 0.985, 0.97][level] ?? 0.97);
  return { ...f, paraAfterPt: Math.round(f.paraAfterPt * after * 100) / 100, lineMultiple: f.lineMultiple * line };
}

export function layoutDoc(doc: DocModel, format: DocFormat, measure: Measure): Layout {
  const [pageWidth, pageHeight] = PAGE[format.page];
  const width = pageWidth - 2 * format.marginIn * 72;
  const run = (f: DocFormat) => paginate(buildBlocks(doc, f, width, measure), f, pageHeight);

  const base = run(format);
  const lastSection = doc.sections.length - 1;
  const finalSectionAlone =
    base.pages.length > 1 && base.lastPageStartsWithHeading && base.lastPageFirstSection === lastSection && lastSection > 0;
  const sparseLastPage = base.pages.length > 1 && base.lastPageLines <= 3;
  const overLimit = format.pageMax > 0 && base.pages.length > format.pageMax;

  if (finalSectionAlone || sparseLastPage || overLimit) {
    for (let level = 1; level <= 3; level++) {
      const f = tighten(format, level);
      if (f.paraAfterPt === format.paraAfterPt && f.lineMultiple === format.lineMultiple) break;
      const attempt = run(f);
      if (attempt.pages.length < base.pages.length) {
        return { pageWidth, pageHeight, pages: attempt.pages, format: f, adjusted: true };
      }
    }
  }
  return { pageWidth, pageHeight, pages: base.pages, format, adjusted: false };
}
