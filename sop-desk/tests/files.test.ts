import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument, PDFName } from "pdf-lib";
import { buildPdf } from "@/lib/files/pdf";
import { buildDocx } from "@/lib/files/docx";
import { layoutDoc, type Measure } from "@/lib/files/layout";
import { resolveFormat } from "@/lib/requirements";
import type { DocFormat } from "@/lib/types";
import { fonts, makeDoc, SENTENCE } from "./helpers";

const base = resolveFormat(null);
const essay: DocFormat = { ...base, shape: "essay", sizePt: 12, lineMultiple: 2, lineExactPt: 0, paraAfterPt: 0, firstLineIndentIn: 0.5, pageMax: 2, font: "serif", docxFont: "Times New Roman", locked: { size: true, spacing: true, margins: false } };

/** Names in the zip's central directory, read from the raw bytes. */
function zipEntryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  for (let i = 0; i + 46 <= bytes.length; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      const len = view.getUint16(i + 28, true);
      names.push(new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + len)));
    }
  }
  return names;
}

describe("DOCX metadata", () => {
  it("has empty core, app and custom properties and no directory entries", async () => {
    const bytes = await buildDocx(makeDoc(3, 4), base);
    const names = zipEntryNames(bytes);
    expect(names).toContain("word/document.xml");
    expect(names.filter((n) => n.endsWith("/"))).toEqual([]);

    const zip = await JSZip.loadAsync(bytes);
    expect(Object.values(zip.files).filter((f) => f.dir)).toEqual([]);
    for (const part of ["docProps/core.xml", "docProps/app.xml", "docProps/custom.xml"]) {
      const xml = await zip.file(part)!.async("string");
      // A single self-closing root element: no child properties at all.
      expect(xml.replace(/^<\?xml[^>]*\?>/, "")).toMatch(/^<[\w:]+( [^<>]*)?\/>$/);
      expect(xml).not.toMatch(/creator|lastModifiedBy|dcterms|created|modified|title>|Company|Application|AppVersion|Template|TotalTime/);
    }
    // No entry carries a real timestamp.
    for (const f of Object.values(zip.files)) expect(f.date.getUTCFullYear()).toBe(1980);
  });
  it("carries no author or software names anywhere in the package", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(makeDoc(2, 3), base));
    for (const f of Object.values(zip.files)) {
      const text = await f.async("string");
      expect(text, f.name).not.toMatch(/Un-named|docx\.js|dolan|python-docx|Microsoft Office Word|claude|anthropic/i);
    }
  });
  it("writes the text, font and spacing from the document model", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(makeDoc(1, 2, 1, false), essay));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Maya Okafor");
    expect(xml).toContain("Times New Roman");
    expect(xml).toMatch(/w:line="480"/); // double spacing
    expect(xml).toMatch(/w:sz w:val="24"/); // 12 pt
    expect(xml).toMatch(/w:firstLine="720"/); // 0.5 inch indent
  });
});

describe("default format", () => {
  it("writes the Word file with the default format's exact settings", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(makeDoc(7, 3), base));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Arial");
    expect(xml).toMatch(/w:line="292" w:lineRule="exact"/); // exactly 14.6 pt
    expect(xml).toMatch(/w:after="220"/); // 11 pt after paragraphs
    expect(xml).toMatch(/w:sz w:val="46"/); // 23 pt title
    expect(xml).toMatch(/w:after="320" w:before="280"/); // 14 pt above, 16 pt below the title
    expect(xml).toMatch(/w:sz w:val="26"/); // 13 pt headings
    expect(xml).toMatch(/w:after="200" w:before="300"/); // 15 pt above, 10 pt below headings
    expect(xml).toMatch(/w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  });
  it("puts about 1,200 words on three pages", async () => {
    // Seven sections with the default paragraph counts, about 1,200 words in all.
    const counts = [1, 1, 2, 3, 1, 3, 1];
    // Ordinary statement prose (about 4.7 letters a word).
    const prose = SENTENCE.trim().split(/\s+/);
    const words = (n: number) => Array.from({ length: n }, (_, i) => prose[i % prose.length]).join(" ") + ".";
    const doc = makeDoc(7, 1, 1);
    const perSection = [105, 165, 200, 320, 55, 260, 95];
    doc.sections = doc.sections.map((s, i) => ({ heading: s.heading, paragraphs: Array.from({ length: counts[i] }, () => words(Math.round(perSection[i] / counts[i]))) }));
    const pdf = await buildPdf(doc, base, fonts());
    expect(pdf.pageCount).toBe(3);
  });
});

describe("PDF metadata", () => {
  it("has no /Info, no /Metadata and no Producer or Creator", async () => {
    const { bytes } = await buildPdf(makeDoc(3, 4), base, fonts());
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).not.toMatch(/\/Info\b/);
    expect(raw).not.toMatch(/\/Metadata\b/);
    expect(raw).not.toMatch(/Producer|Creator|CreationDate|ModDate|\/Author|\/Title|xmpmeta|pdf-lib/);

    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(parsed.context.trailerInfo.Info).toBeUndefined();
    expect(parsed.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
  });
  it("embeds the open-license fonts and the text", async () => {
    const { bytes } = await buildPdf(makeDoc(1, 2), base, fonts());
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toMatch(/LiberationSans/);
    expect(raw).not.toMatch(/Helvetica|Arial/);
  });
});

describe("PDF page count against a page limit", () => {
  it("fits a short essay within the limit", async () => {
    const pdf = await buildPdf(makeDoc(1, 5, 4, false), essay, fonts("serif"));
    expect(pdf.pageCount).toBeLessThanOrEqual(essay.pageMax);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(pdf.pageCount);
  });
  it("reports an essay that runs over the limit, and never shrinks the type to hide it", async () => {
    const pdf = await buildPdf(makeDoc(1, 9, 6, false), essay, fonts("serif"));
    expect(pdf.pageCount).toBeGreaterThan(essay.pageMax);
    expect(pdf.layout.format.sizePt).toBe(12);
    expect(pdf.layout.format.lineMultiple).toBe(2);
    expect(pdf.layout.format.marginIn).toBe(essay.marginIn);
  });
  it("uses the required size on every body line", async () => {
    const pdf = await buildPdf(makeDoc(1, 5, 4, false), essay, fonts("serif"));
    const body = pdf.layout.pages.flat().filter((l) => l.kind === "para");
    expect(new Set(body.map((l) => l.sizePt))).toEqual(new Set([12]));
  });
});

describe("layout rules", () => {
  // A fixed-width stand-in for font metrics keeps these checks independent of the fonts.
  const measure: Measure = (text, style, size) => text.length * size * (style === "bold" ? 0.56 : 0.5);

  it("never ends a page with a heading and leaves no single-line widows or orphans", () => {
    for (let sentences = 1; sentences <= 9; sentences++) {
      for (const paragraphs of [1, 2, 3]) {
        for (const format of [base, { ...base, sizePt: 12, lineMultiple: 2, paraAfterPt: 0, locked: { size: true, spacing: true, margins: false } }]) {
          const layout = layoutDoc(makeDoc(7, sentences, paragraphs), format, measure);
          layout.pages.forEach((lines, p) => {
            const last = lines[lines.length - 1];
            const first = lines[0];
            const label = `sentences=${sentences} paragraphs=${paragraphs} page=${p + 1}`;
            if (p < layout.pages.length - 1) {
              expect(last.kind, `${label}: heading at the bottom`).toBe("para");
              // Orphan: a paragraph's first line alone at the bottom of a page.
              if (last.of > 1) expect(last.line, `${label}: orphan`).not.toBe(0);
            }
            // Widow: a paragraph's last line alone at the top of a page.
            if (p > 0 && first.kind === "para" && first.of > 1) expect(first.line, `${label}: widow`).not.toBe(first.of - 1);
            // Everything stays inside the margins.
            for (const l of lines) {
              expect(l.y).toBeGreaterThan(format.marginIn * 72);
              expect(l.y).toBeLessThanOrEqual(layout.pageHeight - format.marginIn * 72 + 0.01);
            }
          });
        }
      }
    }
  });

  it("pulls a final section back from a page of its own with a small spacing change", () => {
    let found = 0;
    // Grow the first section a sentence at a time so the final section lands everywhere on the page.
    for (let filler = 1; filler <= 60; filler++) {
      const doc = makeDoc(7, 4, 1);
      doc.sections[0].paragraphs = [SENTENCE.repeat(filler).trim()];
      const layout = layoutDoc(doc, base, measure);
      if (!layout.adjusted) continue;
      found += 1;
      const loose = layoutDoc(doc, { ...base, locked: { size: true, spacing: true, margins: true }, paraAfterPt: base.paraAfterPt + 0.001 }, measure);
      expect(layout.pages.length).toBeLessThanOrEqual(loose.pages.length);
      // The adjustment only touches paragraph and line spacing, and only slightly.
      expect(layout.format.sizePt).toBe(base.sizePt);
      expect(layout.format.marginIn).toBe(base.marginIn);
      expect(layout.format.paraAfterPt).toBeGreaterThanOrEqual(base.paraAfterPt * 0.5);
      expect(layout.format.lineMultiple).toBeGreaterThanOrEqual(base.lineMultiple * 0.97 - 1e-9);
      // The final section no longer starts the last page.
      const lastPage = layout.pages[layout.pages.length - 1];
      const finalHeading = layout.pages.flat().filter((l) => l.kind === "heading").pop()!;
      expect(lastPage[0] === finalHeading && layout.pages.length > 1).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("does not touch spacing that an official rule fixed", () => {
    const locked: DocFormat = { ...essay, pageMax: 1 };
    const layout = layoutDoc(makeDoc(1, 9, 6, false), locked, measure);
    expect(layout.adjusted).toBe(false);
    expect(layout.format).toEqual(locked);
  });
});
