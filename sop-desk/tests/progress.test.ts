import { describe, expect, it } from "vitest";
import { endStep, fraction, newProgress, percent, startStep, stepForPath, writing } from "@/lib/client/progress";

describe("progress bar", () => {
  it("moves only with real work: finished steps and the answer being written", () => {
    let p = newProgress("write", 5, 500);
    expect(percent(p)).toBe(0);
    p = startStep(p, "draft");
    // While Claude thinks, nothing is written yet, so the bar holds still.
    expect(percent(p)).toBe(0);
    p = writing(p, 1600);
    const halfDraft = percent(p);
    expect(halfDraft).toBeGreaterThan(0);
    p = endStep(p);
    expect(percent(p)).toBeGreaterThan(halfDraft);
    p = startStep(p, "humanize");
    p = endStep(p);
    p = startStep(p, "review");
    p = endStep(p, { reviewAskedForChanges: true });
    const afterFirstCheck = percent(p);
    // A fix made by the writer is an extra step, and the bar never goes back.
    p = startStep(p, "edit");
    expect(percent(p)).toBeGreaterThanOrEqual(afterFirstCheck);
    p = endStep(p);
    p = startStep(p, "review");
    p = endStep(p, { reviewAskedForChanges: false });
    p = startStep(p, "files");
    p = endStep(p);
    expect(percent(p)).toBe(100);
  });

  it("never goes backwards when more checks turn out to be needed", () => {
    let p = newProgress("write", 5, 500);
    const seen: number[] = [];
    for (const key of ["draft", "humanize"] as const) {
      p = startStep(p, key);
      p = writing(p, 5000);
      p = endStep(p);
      seen.push(percent(p));
    }
    for (let round = 0; round < 4; round++) {
      p = startStep(p, "review");
      seen.push(percent(p));
      p = endStep(p, { reviewAskedForChanges: true });
      seen.push(percent(p));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(fraction(p)).toBeLessThan(1);
  });

  it("counts steps that were not needed as done (continuing after Stop, or a check only)", () => {
    let p = newProgress("write", 5, 500);
    p = startStep(p, "humanize");
    expect(percent(p)).toBeGreaterThan(20);
    p = endStep(p);
    p = startStep(p, "files");
    p = endStep(p);
    expect(percent(p)).toBe(100);
  });

  it("knows which step each call is", () => {
    expect(stepForPath("/api/research/gather")).toBe("gather");
    expect(stepForPath("/api/review")).toBe("review");
    expect(stepForPath("/api/auth")).toBeNull();
  });
});
