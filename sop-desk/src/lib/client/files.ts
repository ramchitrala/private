import type { DocFormat, DocModel } from "../types";
import { cleanDeep } from "../clean";
import { loadFonts } from "../files/fonts";
import { buildPdf } from "../files/pdf";
import { buildDocx } from "../files/docx";

export interface BuiltFiles {
  pdf: Uint8Array;
  docx: Uint8Array;
  pageCount: number;
  /** The format after any small spacing adjustment; both files use it. */
  format: DocFormat;
  adjusted: boolean;
}

/** Build the PDF only (used to measure pages after each change). */
export async function measurePdf(doc: DocModel, format: DocFormat) {
  const fonts = await loadFonts(format.font);
  return buildPdf(cleanDeep(doc), format, fonts);
}

/** Build both files in the browser from the same document model, so they match. */
export async function buildFiles(doc: DocModel, format: DocFormat): Promise<BuiltFiles> {
  const clean = cleanDeep(doc);
  const pdf = await measurePdf(clean, format);
  const docx = await buildDocx(clean, pdf.layout.format);
  return { pdf: pdf.bytes, docx, pageCount: pdf.pageCount, format: pdf.layout.format, adjusted: pdf.layout.adjusted };
}

export function download(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
