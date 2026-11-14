import { describe, expect, it, vi } from "vitest";
import { capEffort } from "@/lib/server/config";
import { callStageAdaptive, lowerEffort } from "@/lib/client/api";

describe("running out of server time", () => {
  it("a cap from the browser can only lower the configured effort", () => {
    expect(capEffort("max", "xhigh")).toBe("xhigh");
    expect(capEffort("high", "xhigh")).toBe("high");
    expect(capEffort("max", undefined)).toBe("max");
    expect(capEffort("max", "turbo")).toBe("max");
  });

  it("steps down one level at a time and stops at medium", () => {
    expect(lowerEffort("max")).toBe("xhigh");
    expect(lowerEffort("xhigh")).toBe("high");
    expect(lowerEffort("high")).toBe("medium");
    expect(lowerEffort("medium")).toBe("");
    expect(lowerEffort("")).toBe("");
  });

  it("retries a step that ran out of time at a lower effort, and remembers it", async () => {
    const sent: unknown[] = [];
    const stream = (lines: object[]) => new Response(lines.map((l) => JSON.stringify(l)).join("\n"), { status: 200 });
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push(body.effortCap ?? null);
      if (!body.effortCap) return stream([{ type: "error", stage: "review", code: "too_slow", message: "slow", effort: "max" }]);
      return stream([{ type: "result", data: { ok: body.effortCap }, usage: {} }]);
    });
    const caps = new Map<string, string>();
    const slower = vi.fn();
    const res = await callStageAdaptive<{ ok: string }>("/api/review", { round: 1 }, { passcode: "p", projectId: "x", caps, onSlower: slower });
    expect(res.data.ok).toBe("xhigh");
    expect(sent).toEqual([null, "xhigh"]);
    expect(caps.get("review")).toBe("xhigh");
    expect(slower).toHaveBeenCalledWith("review", "xhigh");
    // The next review starts at the lower level straight away.
    await callStageAdaptive("/api/review", { round: 2 }, { passcode: "p", projectId: "x", caps });
    expect(sent).toEqual([null, "xhigh", "xhigh"]);
    vi.unstubAllGlobals();
  });

  it("does not retry other failures", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ type: "error", stage: "draft", code: "refusal", message: "no" }), { status: 200 }));
    await expect(callStageAdaptive("/api/draft", {}, { passcode: "p", projectId: "x", caps: new Map() })).rejects.toMatchObject({ code: "refusal" });
    vi.unstubAllGlobals();
  });
});
