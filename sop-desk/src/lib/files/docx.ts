import { AlignmentType, Document, LineRuleType, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import type { DocFormat, DocModel } from "../types";

const TWIPS_PER_INCH = 1440;
const PAGE_TWIPS = { letter: [12240, 15840], a4: [11906, 16838] } as const;
const FIXED_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));

const EMPTY_PROPS: Record<string, string> = {
  "docProps/core.xml":
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>',
  "docProps/app.xml":
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
  "docProps/custom.xml":
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>',
};

/**
 * Rebuild the .docx zip: property parts are replaced with empty ones (no author,
 * last-modified-by, title, company, application or dates), entry timestamps are
 * fixed, and no directory entries are written.
 */
export async function scrubDocx(input: Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(input, typeof input === "string" ? { base64: true } : undefined);
  const out = new JSZip();
  const names = Object.keys(source.files).filter((n) => !source.files[n].dir);
  for (const name of names) {
    const data = name in EMPTY_PROPS ? EMPTY_PROPS[name] : await source.files[name].async("uint8array");
    out.file(name, data, { createFolders: false, date: FIXED_DATE });
  }
  return out.generateAsync({ type: "uint8array", compression: "DEFLATE", platform: "DOS" });
}

/** Build the Word file from the same document model and format as the PDF. */
export async function buildDocx(doc: DocModel, format: DocFormat): Promise<Uint8Array> {
  const half = (pt: number) => Math.round(pt * 2);
  const tw = (pt: number) => Math.round(pt * 20);
  const line = Math.round(format.lineMultiple * 240);
  const font = format.docxFont;
  const run = (text: string, sizePt: number, bold = false) => new TextRun({ text, bold, size: half(sizePt), font });
  const children: Paragraph[] = [];

  if (doc.title) {
    children.push(
      new Paragraph({
        children: [run(doc.title, format.titlePt, true)],
        alignment: AlignmentType.LEFT,
        keepNext: true,
        spacing: { after: tw(format.sizePt * 0.6), line: 300, lineRule: LineRuleType.AUTO },
      }),
    );
  }
  doc.header.forEach((h, i) => {
    children.push(
      new Paragraph({
        children: h.label ? [run(`${h.label}: `, format.sizePt, true), run(h.value, format.sizePt)] : [run(h.value, format.sizePt, true)],
        keepNext: true,
        spacing: {
          after: i === doc.header.length - 1 ? tw(format.sizePt * 1.2) : 0,
          line: Math.round(Math.min(format.lineMultiple, 1.2) * 240),
          lineRule: LineRuleType.AUTO,
        },
      }),
    );
  });
  for (const section of doc.sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          children: [run(section.heading, format.headingPt, true)],
          keepNext: true,
          keepLines: true,
          spacing: {
            before: tw(format.sizePt * 0.55),
            after: format.locked.spacing ? 0 : tw(format.sizePt * 0.45),
            line: format.locked.spacing ? line : 300,
            lineRule: LineRuleType.AUTO,
          },
        }),
      );
    }
    for (const p of section.paragraphs) {
      children.push(
        new Paragraph({
          children: [run(p, format.sizePt)],
          widowControl: true,
          indent: format.firstLineIndentIn ? { firstLine: Math.round(format.firstLineIndentIn * TWIPS_PER_INCH) } : undefined,
          spacing: { after: tw(format.paraAfterPt), line, lineRule: LineRuleType.AUTO },
        }),
      );
    }
  }

  const [width, height] = PAGE_TWIPS[format.page];
  const margin = Math.round(format.marginIn * TWIPS_PER_INCH);
  const file = new Document({
    creator: "",
    title: "",
    description: "",
    lastModifiedBy: "",
    styles: { default: { document: { run: { font, size: half(format.sizePt) } } } },
    sections: [
      {
        properties: { page: { size: { width, height }, margin: { top: margin, bottom: margin, left: margin, right: margin } } },
        children,
      },
    ],
  });
  return scrubDocx(await Packer.toBase64String(file));
}
