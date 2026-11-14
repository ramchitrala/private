import { describe, expect, it } from "vitest";
import { applyExactOnce } from "@/lib/corrections";
import type { DocModel } from "@/lib/types";

const doc: DocModel = {
  title: "Statement of Purpose",
  header: [{ label: "Program", value: "MS in Information Systems" }],
  sections: [
    { heading: "1. Background", paragraphs: ["I wrote data quality checks. Those data quality checks found 2,300 duplicates.", "A team of four analyst use my reports."] },
    { heading: "2. Goals", paragraphs: ["I want to lead a data platform team."] },
  ],
};

describe("exact-once rule for applying corrections", () => {
  it("replaces text that occurs exactly once", () => {
    const r = applyExactOnce(doc, "four analyst use", "four analysts use");
    expect(r.status).toBe("applied");
    if (r.status === "applied") {
      expect(r.doc.sections[0].paragraphs[1]).toBe("A team of four analysts use my reports.");
      expect(r.doc.sections[0].paragraphs[0]).toBe(doc.sections[0].paragraphs[0]);
    }
    // The original is not mutated.
    expect(doc.sections[0].paragraphs[1]).toBe("A team of four analyst use my reports.");
  });
  it("refuses text that occurs more than once, in one paragraph or across the document", () => {
    expect(applyExactOnce(doc, "data quality checks", "validation checks")).toEqual({ status: "ambiguous", count: 2 });
    expect(applyExactOnce(doc, "data", "information")).toMatchObject({ status: "ambiguous" });
  });
  it("refuses text that is not there, including near misses and text spanning paragraphs", () => {
    expect(applyExactOnce(doc, "four analysts use", "x")).toEqual({ status: "not-found", count: 0 });
    expect(applyExactOnce(doc, "Four analyst use", "x").status).toBe("not-found");
    expect(applyExactOnce(doc, "duplicates. A team", "x").status).toBe("not-found");
    expect(applyExactOnce(doc, "", "x").status).toBe("not-found");
  });
  it("treats special replacement patterns literally and deletes with an empty replacement", () => {
    const a = applyExactOnce(doc, "2,300 duplicates", "$& and $1");
    expect(a.status === "applied" && a.doc.sections[0].paragraphs[0]).toContain("found $& and $1.");
    const b = applyExactOnce(doc, "I want to lead a data platform team.", "");
    expect(b.status === "applied" && b.doc.sections[1].paragraphs).toEqual([]);
  });
  it("can correct a heading or the title, and reports a no-op", () => {
    const a = applyExactOnce(doc, "2. Goals", "2. Career goals");
    expect(a.status === "applied" && a.doc.sections[1].heading).toBe("2. Career goals");
    expect(applyExactOnce(doc, "2. Goals", "2. Goals").status).toBe("no-change");
  });
});
