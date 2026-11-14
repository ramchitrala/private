import fs from "node:fs";
import path from "node:path";
import type { DocModel, GatherResult, SourcePage } from "@/lib/types";
import type { FontBytes } from "@/lib/files/fonts";
import { FONT_FILES } from "@/lib/files/fonts";

export const ROOT = path.join(__dirname, "..");

export function fonts(font: keyof typeof FONT_FILES = "sans"): FontBytes {
  const read = (f: string) => new Uint8Array(fs.readFileSync(path.join(ROOT, "public", "fonts", f)));
  return { regular: read(FONT_FILES[font].regular), bold: read(FONT_FILES[font].bold) };
}

export const SENTENCE = "I cleaned 1.2 million rows of bus arrival data and built a dashboard of delays by route. ";

export function makeDoc(sections: number, sentencesPerParagraph: number, paragraphs = 2, headings = true): DocModel {
  return {
    title: "Statement of Purpose",
    header: [
      { label: "", value: "Maya Okafor" },
      { label: "Program", value: "MS in Information Systems" },
      { label: "University", value: "Fixture University" },
    ],
    sections: Array.from({ length: sections }, (_, i) => ({
      heading: headings ? `${i + 1}. Section heading` : "",
      paragraphs: Array.from({ length: paragraphs }, () => SENTENCE.repeat(sentencesPerParagraph).trim()),
    })),
  };
}

export function page(url: string, text: string): SourcePage {
  return { url, title: "", kind: "html", text, retrievedAt: "2026-01-01T00:00:00Z" };
}

export function gathered(over: Partial<GatherResult> = {}): GatherResult {
  return { pages: [], queries: ["statement of purpose"], searchCount: 2, fetchCount: 1, fetchErrors: [], searchErrors: [], programPageFetched: true, ...over };
}
