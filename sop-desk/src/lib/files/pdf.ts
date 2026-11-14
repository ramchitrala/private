import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocFormat, DocModel } from "../types";
import type { FontBytes } from "./fonts";
import { layoutDoc, type FontStyle, type Layout } from "./layout";

export interface BuiltPdf {
  bytes: Uint8Array;
  pageCount: number;
  layout: Layout;
}

/**
 * Build the PDF from the document model. The file carries no Info dictionary,
 * no XMP metadata stream and no Producer or Creator string.
 */
export async function buildPdf(doc: DocModel, format: DocFormat, fonts: FontBytes): Promise<BuiltPdf> {
  // updateMetadata: false stops pdf-lib from writing its default Producer, Creator and dates.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const embedded: Record<FontStyle, PDFFont> = {
    regular: await pdf.embedFont(fonts.regular, { subset: true }),
    bold: await pdf.embedFont(fonts.bold, { subset: true }),
  };
  const measure = (text: string, style: FontStyle, size: number) => embedded[style].widthOfTextAtSize(text, size);
  const layout = layoutDoc(doc, format, measure);
  const ink = rgb(0.07, 0.07, 0.07);

  for (const lines of layout.pages) {
    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    for (const line of lines) {
      let x = line.x;
      for (const run of line.runs) {
        page.drawText(run.text, { x, y: layout.pageHeight - line.y, size: line.sizePt, font: embedded[run.style], color: ink });
        x += measure(run.text, run.style, line.sizePt);
      }
    }
  }
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, pageCount: layout.pages.length, layout };
}
