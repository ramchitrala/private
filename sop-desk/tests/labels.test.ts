import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BANNED_WORDS, errorFor, isResearchError, stageFor, statementStatus, statementTitle, WRITING_STAGES } from "@/lib/client/labels";
import { emptyProject } from "@/lib/client/store";
import { ROOT } from "./helpers";

/** Every status line the pipeline and the server can send, found by reading the source. */
function allStatusLines(): string[] {
  const files = [
    "src/lib/client/pipeline.ts",
    ...fs.readdirSync(path.join(ROOT, "src/app/api"), { recursive: true }).map((f) => `src/app/api/${f}`).filter((f) => f.endsWith(".ts")),
    "src/lib/server/mock.ts",
    "src/lib/server/anthropic.ts",
  ];
  const lines: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:rt\.status|message:)\s*\(?\s*(["`])((?:(?!\1).)*)\1/g)) lines.push(m[2]);
  }
  return lines;
}

describe("plain stage names", () => {
  it("maps every status line the app emits to a known stage, never to the catch-all", () => {
    const lines = allStatusLines();
    expect(lines.length).toBeGreaterThan(12);
    for (const raw of lines) {
      // Fill template placeholders with sample values.
      const line = raw.replace(/(\w?)\$\{[^}]*\}/g, (_, before: string) => (before ? `${before}s` : "2"));
      const s = stageFor(line);
      if (s === null) {
        expect(line, line).toMatch(/^(Mock mode|Still working)/);
        continue;
      }
      expect(s.key, line).not.toBe("working");
      expect(s.label).not.toMatch(/humanizer|lint|token|verdict|reviewer|round/i);
    }
  });

  it("names stages in plain words", () => {
    expect(stageFor("Searching scu.edu for statement instructions")?.label).toBe("Opening the program page");
    expect(stageFor("Humanizer pass")?.label).toBe("Making it sound natural");
    expect(stageFor("Humanizer pass on the edited text")?.label).toBe("Smoothing the new wording");
    expect(stageFor("Review round 2 of 5")).toMatchObject({ key: "check", detail: "Check 2 of up to 5" });
    expect(stageFor("Review round 2 of 5: applying fix 1 of 2")).toMatchObject({ key: "check", detail: "Fixing 1 of 2 things" });
    expect(stageFor("Over the limit (2 pages, 612 words): trimming to 500 words")).toMatchObject({ key: "check", detail: "Shortening it to fit 500 words" });
    expect(stageFor("Review round 7")).toMatchObject({ key: "check", detail: "" });
    expect(stageFor("Something new from the server")?.label).toBe("Working on it");
    expect(WRITING_STAGES.map((s) => s.label)).toEqual(["Writing your first draft", "Making it sound natural", "Checking it against the instructions", "Preparing your files"]);
  });
});

describe("plain errors", () => {
  it("turns research failures into one plain message", () => {
    for (const code of ["program_page_not_fetched", "url_not_accessible", "search_failed", "no_pages"]) {
      expect(errorFor(code)).toMatchObject({ heading: "We couldn't open that page", kind: "research" });
      expect(isResearchError(code)).toBe(true);
    }
    expect(isResearchError("timeout", "research/gather")).toBe(true);
    // A timeout while reading the pages or asking questions is not "couldn't open the page".
    expect(isResearchError("timeout", "research/extract")).toBe(false);
    expect(isResearchError("timeout", "questions")).toBe(false);
    expect(isResearchError("timeout", "Finding the instructions")).toBe(false);
  });
  it("never shows a raw code in the message", () => {
    for (const code of ["busy", "timeout", "max_tokens", "bad_json", "empty_resume", "too_large", "passcode", "refusal", "no_research", "weird_new_code", "link_aggregator"]) {
      const e = errorFor(code);
      expect(`${e.heading} ${e.body}`).not.toMatch(/_|\b(code|api|json|token)\b/i);
    }
  });
  it("uses only plain words in every message", () => {
    const words = BANNED_WORDS.map((w) => w.toLowerCase());
    for (const code of ["program_page_not_fetched", "busy", "timeout", "network", "empty_resume", "too_large", "passcode", "refusal", "no_draft", "x"]) {
      const e = errorFor(code);
      for (const w of words) expect(`${e.heading} ${e.body}`.toLowerCase()).not.toContain(w);
    }
  });
});

describe("home list statuses", () => {
  it("says what each statement is waiting for", () => {
    const p = emptyProject();
    expect(statementStatus(p)).toBe("Not finished");
    expect(statementTitle(p).program).toBe("New statement");
    p.inputs.programUrl = "https://www.scu.edu/x";
    expect(statementTitle(p).university).toBe("scu.edu");
    p.lastError = { stage: "Finding the instructions", code: "program_page_not_fetched" };
    expect(statementStatus(p)).toBe("Couldn't open the program page");
    p.research = { details: [], items: [] } as never;
    expect(statementStatus(p)).toBe("Waiting for you");
    p.doc = { title: "", header: [], sections: [] };
    expect(statementStatus(p)).toBe("Ready to download");
  });
});
