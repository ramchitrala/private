import { describe, expect, it } from "vitest";
import { lintDoc, sentenceCount } from "@/lib/lint";
import type { DocModel } from "@/lib/types";

const doc = (sections: DocModel["sections"]): DocModel => ({ title: "Statement of Purpose — title dashes are not counted", header: [], sections });

describe("lint detectors", () => {
  it("counts em and en dashes in the body", () => {
    const l = lintDoc(doc([{ heading: "", paragraphs: ["The work — slow as it was — paid off in 2021–2022.", "A well-known, long-term plan."] }]));
    expect(l.emDashes).toBe(2);
    expect(l.enDashes).toBe(1);
  });
  it("counts the stock words from the humanizer skill's list, with inflections", () => {
    const l = lintDoc(doc([{ heading: "", paragraphs: ["This pivotal project showcases a robust pipeline. It delves into the data landscape and played a key role. Additionally, it enhanced my skills."] }]));
    const words = Object.fromEntries(l.stockWords.map((w) => [w.word, w.count]));
    expect(words).toMatchObject({ pivotal: 1, showcase: 1, robust: 1, delve: 1, landscape: 1, "key (adjective)": 1, additionally: 1, enhance: 1 });
  });
  it("does not flag ordinary uses", () => {
    const l = lintDoc(doc([{ heading: "", paragraphs: ["The primary key of the table was the member id. I keyed in the data and enjoyed the work."] }]));
    expect(l.stockWords).toEqual([]);
  });
  it("finds 'not just ... but', 'not only ... but' and 'it's not X, it's Y'", () => {
    const l = lintDoc(
      doc([{ heading: "", paragraphs: ["It is not just a question of tools, but of design.", "I learned not only SQL but also how to ask questions.", "It's not a report, it's a system.", "This is not a problem; I solved it."] }]),
    );
    expect(l.contrastPatterns).toHaveLength(3);
  });
  it("finds one-sentence closing paragraphs", () => {
    const l = lintDoc(
      doc([
        { heading: "1. One", paragraphs: ["First sentence. Second sentence.", "That is the real win."] },
        { heading: "2. Two", paragraphs: ["A full paragraph. With two sentences."] },
        { heading: "3. Three", paragraphs: ["Only one sentence here."] },
      ]),
    );
    expect(l.oneSentenceClosers).toEqual(["That is the real win."]);
  });
  it("counts sentences without tripping on abbreviations and decimals", () => {
    expect(sentenceCount("I earned an M.S. in the U.S. with a 3.7 GPA.")).toBe(1);
    expect(sentenceCount("I moved in 2022. Then I started work!")).toBe(2);
  });
  it("counts words overall and per prompt, against per-prompt limits", () => {
    const l = lintDoc(doc([{ heading: "1. Heading words are not counted", paragraphs: ["one two three", "four five"] }, { heading: "2. Next", paragraphs: ["six"] }]), [4, 0]);
    expect(l.wordCount).toBe(6);
    expect(l.perSection).toEqual([
      { heading: "1. Heading words are not counted", words: 5, limit: 4 },
      { heading: "2. Next", words: 1, limit: 0 },
    ]);
  });
});
