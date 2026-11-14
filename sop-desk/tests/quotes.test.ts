import { describe, expect, it } from "vitest";
import { normalizeForMatch, verifyQuote } from "@/lib/quotes";
import { applyPrecedence, itemsFromExtract, verifyAll, type RawExtract } from "@/lib/requirements";
import { page } from "./helpers";

const PAGE = page(
  "https://www.unh.edu/apply",
  "How to apply.\n\nYour statement should be approximately 1–2 pages,\n   double-spaced, in 12 point font. Tell us “why this program” — and don’t restate your resume.",
);

describe("quote verification", () => {
  it("normalizes whitespace, quote marks and dashes", () => {
    expect(normalizeForMatch("  “Hello” —  it’s\n fine ")).toBe('"hello" - it\'s fine');
  });
  it("verifies a quote that differs only in whitespace, quotes and dashes", () => {
    const r = verifyQuote('approximately 1-2 pages, double-spaced, in 12 point font. Tell us "why this program" - and don\'t restate your resume.', PAGE.url, [PAGE]);
    expect(r.verified).toBe(true);
  });
  it("rejects a paraphrase, a stitched quote and an invented one", () => {
    expect(verifyQuote("The statement should be about one to two pages", PAGE.url, [PAGE]).verified).toBe(false);
    expect(verifyQuote("How to apply. Tell us why this program", PAGE.url, [PAGE]).verified).toBe(false);
    expect(verifyQuote("Maximum 500 words in Times New Roman", PAGE.url, [PAGE]).verified).toBe(false);
  });
  it("rejects quotes too short to mean anything, and everything when no page was fetched", () => {
    expect(verifyQuote("pages", PAGE.url, [PAGE]).verified).toBe(false);
    expect(verifyQuote("approximately 1-2 pages, double-spaced", PAGE.url, []).verified).toBe(false);
  });
  it("finds the quote on another fetched page and corrects the source", () => {
    const other = page("https://www.unh.edu/program", "Program overview with nothing about statements.");
    const r = verifyQuote("double-spaced, in 12 point font", other.url, [other, PAGE]);
    expect(r).toMatchObject({ verified: true, sourceUrl: PAGE.url });
  });
});

describe("requirements built from an extraction", () => {
  const raw: RawExtract = {
    country: "US",
    docType: [{ value: "Personal Statement", quote: "How to apply.", sourceUrl: PAGE.url, level: "program" }],
    prompts: [],
    wordLimit: [{ text: "500 words", min: 0, max: 500, quote: "no more than 500 words in total", sourceUrl: PAGE.url, level: "program" }],
    pageLimit: [
      { text: "1-2 pages", min: 1, max: 2, quote: "approximately 1-2 pages", sourceUrl: PAGE.url, level: "department" },
      { text: "3 pages", min: 0, max: 3, quote: "double-spaced, in 12 point font", sourceUrl: PAGE.url, level: "guidance" },
    ],
    formatting: [{ aspect: "size", text: "12 point font", normalized: "12", quote: "in 12 point font", sourceUrl: PAGE.url, level: "department" }],
    topics: [],
    avoid: [{ text: "Don't restate your resume", quote: "don't restate your resume", sourceUrl: PAGE.url, level: "department" }],
    aiPolicy: [],
    programDetails: [
      { kind: "course", value: "Quantum Ledger Design", quote: "Students take Quantum Ledger Design", sourceUrl: PAGE.url },
      { kind: "course", value: "Network Defense", quote: "double-spaced, in 12 point font", sourceUrl: PAGE.url },
    ],
  };
  it("drops every item whose quote does not verify and reports it", () => {
    const flat = itemsFromExtract(raw);
    const v = verifyAll(flat.items, flat.details, [PAGE]);
    expect(v.items.map((i) => i.kind)).toEqual(["docType", "pageLimit", "pageLimit", "fontSize", "avoid"]);
    expect(v.items.every((i) => i.verified)).toBe(true);
    // The invented word limit, the invented course, and the course whose real quote does not name it.
    expect(v.dropped.map((d) => d.text)).toEqual(["500 words", "Quantum Ledger Design", "Network Defense"]);
    expect(v.details).toHaveLength(0);
  });
  it("lets program or department instructions win over general guidance of the same kind", () => {
    const flat = itemsFromExtract(raw);
    const v = verifyAll(flat.items, flat.details, [PAGE]);
    const { kept, overridden } = applyPrecedence(v.items);
    expect(kept.filter((i) => i.kind === "pageLimit").map((i) => i.text)).toEqual(["1-2 pages"]);
    expect(overridden.map((i) => i.text)).toEqual(["3 pages"]);
  });
});
