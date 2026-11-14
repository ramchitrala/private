import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cleanDeep, cleanHidden, cleanText } from "@/lib/clean";
import { ROOT } from "./helpers";

describe("hidden-character cleaner", () => {
  it("cleans the fixture with U+200B after the header lines without changing visible text", () => {
    const dirty = fs.readFileSync(path.join(ROOT, "fixtures", "hidden-chars.txt"), "utf8");
    expect(dirty).toContain("Statement of Purpose​\n");
    expect(dirty).toContain("Maya Okafor​\n");
    const report = cleanHidden(dirty);
    expect(report.text).toBe(
      ["Statement of Purpose", "Maya Okafor", "Program: MS in Information Systems", "University: Fixture University", "", "I built reports in SQL and Python.", "Data analysis at Harborline."].join("\n"),
    );
    expect(report.removed).toBeGreaterThan(0);
    expect(report.spacesNormalized).toBe(2);
  });
  it("removes zero-width characters", () => {
    expect(cleanText("a​b‌c‍d⁠e﻿f")).toBe("abcdef");
  });
  it("removes bidi controls", () => {
    expect(cleanText("a‪b‫c‬d‭e‮f⁦g⁧h⁨i⁩j")).toBe("abcdefghij");
  });
  it("removes tag characters, variation selectors, soft hyphens and private-use characters", () => {
    expect(cleanText("a\u{E0000}b\u{E0061}c\u{E007F}d")).toBe("abcd");
    expect(cleanText("a️b︀c\u{E0100}d")).toBe("abcd");
    expect(cleanText("re­port")).toBe("report");
    expect(cleanText("abc\u{F0000}d\u{10FFFD}e")).toBe("abcde");
  });
  it("turns non-breaking and other unusual spaces into normal spaces", () => {
    expect(cleanText("a b c d　e f")).toBe("a b c d e f");
  });
  it("leaves ordinary text, accents, punctuation and line breaks alone", () => {
    const text = "Zoë García-Müller wrote “2 + 2 = 4” — naïve? 100%.\n\tNext line: 中文, العربية.";
    expect(cleanText(text)).toBe(text);
    expect(cleanHidden(text)).toMatchObject({ removed: 0, spacesNormalized: 0 });
  });
  it("cleans every string inside a document model", () => {
    const doc = { title: "A​", sections: [{ heading: "B﻿", paragraphs: ["C D", "E"] }], n: 3 };
    expect(cleanDeep(doc)).toEqual({ title: "A", sections: [{ heading: "B", paragraphs: ["C D", "E"] }], n: 3 });
  });
});
