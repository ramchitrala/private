import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers";
import type { Project } from "@/lib/types";
import type { AppInfo } from "@/lib/api-types";
import { emptyProject } from "@/lib/client/store";
import { chatEdit, continueRun, runChatEdit, runDraft, runExtract, runFacts, runQuestions, runResearch, type Runtime } from "@/lib/client/pipeline";
import { StageFailure } from "@/lib/client/api";
import { bodyToText } from "@/lib/docmodel";
import { lintDoc } from "@/lib/lint";

// The whole pipeline, end to end, in mock mode: the browser-side orchestrator calls the
// real route handlers directly. No network, no API credits.

const PASS = "unit-test-passcode";
const routes: Record<string, () => Promise<{ POST: (req: Request) => Promise<Response> }>> = {
  "/api/auth": () => import("@/app/api/auth/route"),
  "/api/facts": () => import("@/app/api/facts/route"),
  "/api/research/gather": () => import("@/app/api/research/gather/route"),
  "/api/research/extract": () => import("@/app/api/research/extract/route"),
  "/api/questions": () => import("@/app/api/questions/route"),
  "/api/draft": () => import("@/app/api/draft/route"),
  "/api/humanize": () => import("@/app/api/humanize/route"),
  "/api/edit": () => import("@/app/api/edit/route"),
  "/api/review": () => import("@/app/api/review/route"),
};

async function post(pathname: string, body: unknown, passcode = PASS): Promise<Response> {
  const { POST } = await routes[pathname]();
  return POST(new Request(`http://localhost${pathname}`, { method: "POST", headers: { "content-type": "application/json", "x-app-passcode": passcode, "x-project-id": "p_test01" }, body: JSON.stringify(body) }));
}

function runtime(project: Project, log: string[]): Runtime {
  let current = project;
  const info: AppInfo = { ok: true, mock: true, model: "mock", maxReviewRounds: 5, maxEditReviewRounds: 3 };
  return {
    info,
    get: () => current,
    set: (mutate) => {
      const next = structuredClone(current);
      mutate(next);
      current = next;
    },
    status: (m) => log.push(m),
    call: async <T,>(pathname: string, body: unknown) => {
      const res = await post(pathname, body);
      const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
      const last = lines[lines.length - 1];
      if (last.type === "error") throw new StageFailure(last.stage, last.code, last.message);
      return last.data as T;
    },
  };
}

beforeAll(() => {
  process.env.MOCK_ANTHROPIC = "1";
  process.env.APP_PASSCODE = PASS;
  vi.spyOn(console, "log").mockImplementation(() => {});
  // The browser loads fonts from /fonts; here they come from disk.
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/fonts/")) return new Response(fs.readFileSync(path.join(ROOT, "public", url)));
    return realFetch(input, init);
  });
});

describe("access protection", () => {
  it("every stage route answers 401 without the right passcode", async () => {
    for (const pathname of Object.keys(routes)) {
      for (const bad of ["", "wrong", PASS + "x", PASS.slice(0, -1)]) {
        const res = await post(pathname, {}, bad);
        expect(res.status, `${pathname} with "${bad}"`).toBe(401);
      }
    }
  });
  it("rejects everything when APP_PASSCODE is not set", async () => {
    process.env.APP_PASSCODE = "";
    expect((await post("/api/auth", {}, "")).status).toBe(401);
    process.env.APP_PASSCODE = PASS;
    expect((await post("/api/auth", {})).status).toBe(200);
  });
  it("every route file sets the Node.js runtime and a literal maxDuration of 300", () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
    const files = walk(path.join(ROOT, "src", "app", "api"));
    expect(files.length).toBe(9);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).toContain('export const runtime = "nodejs";');
      expect(src, f).toContain("export const maxDuration = 300;");
      expect(src, f).toMatch(/checkPasscode|stageRoute/);
    }
  });
});

describe("request rules for Claude Opus 5.5", () => {
  const server = ["anthropic.ts", "config.ts"].map((f) => fs.readFileSync(path.join(ROOT, "src", "lib", "server", f), "utf8")).join("\n");
  const code = server.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  it("sets effort, streams, and never sends sampling parameters, thinking config, forced tool choice or prefill", () => {
    expect(code).toContain("output_config");
    expect(code).toContain("client.messages.stream(");
    expect(code).not.toMatch(/temperature|top_p|top_k|budget_tokens|tool_choice|thinking\s*:/);
    expect(code).not.toMatch(/content\[0\]/);
    expect(code).toContain('"claude-opus-5-5"');
    expect(code).toMatch(/write: effort\("EFFORT_WRITE", "xhigh"\)/);
    expect(code).toMatch(/critique: effort\("EFFORT_CRITIQUE", "max"\)/);
    expect(code).toMatch(/research: effort\("EFFORT_RESEARCH", "high"\)/);
    expect(code).toMatch(/maxTokens: 64000/);
  });
});

describe("end-to-end run in mock mode", () => {
  const resume = fs.readFileSync(path.join(ROOT, "fixtures", "resume.txt"), "utf8"); // made-up applicant

  async function run(link: string) {
    const log: string[] = [];
    const p = emptyProject();
    p.inputs.resumeKind = "text";
    p.inputs.resumeText = resume;
    p.inputs.programUrl = link;
    p.inputs.entryTerm = "Fall 2027";
    const rt = runtime(p, log);
    await runFacts(rt);
    await runResearch(rt);
    await runQuestions(rt);
    await runDraft(rt);
    return { rt, log };
  }

  it("question prompts with a total word range: follows the official format and passes review", async () => {
    const { rt, log } = await run("https://www.scu.edu/business/ms/ms-information-systems/");
    const p = rt.get();
    expect(p.facts!.applicantName).toBe("Maya Okafor");
    expect(p.research!.status).toBe("official");
    expect(p.research!.statusLine).toBe("Following the official instructions on scu.edu.");
    expect(p.research!.dropped.map((d) => d.text)).toContain("Quantum Ledger Design");
    expect(p.questions!.length).toBeGreaterThan(0);

    expect(p.doc!.title).toBe("Statement of Purpose");
    expect(p.doc!.header).toEqual([
      { label: "", value: "Maya Okafor" },
      { label: "Program", value: "MS in Information Systems" },
      { label: "University", value: "Fixture University" },
      { label: "School", value: "Fixture School of Business" },
      { label: "Entry Term", value: "Fall 2027" },
    ]);
    expect(p.doc!.sections.map((s) => s.heading)).toEqual(["1. What excites me about information systems", "2. The work that prepared me", "3. Where I want to go next"]);

    // Humanizer pass removed the dashes and stock words the first draft had.
    expect(lintDoc(p.preHumanize!).emDashes).toBeGreaterThan(0);
    const lint = lintDoc(p.doc!);
    expect(lint.emDashes + lint.enDashes + lint.stockWords.length + lint.contrastPatterns.length).toBe(0);
    expect(lint.wordCount).toBeGreaterThanOrEqual(400);
    expect(lint.wordCount).toBeLessThanOrEqual(500);

    // Review: round 1 has one exact replacement and one the writer had to make; round 2 passes.
    expect(p.rounds.map((r) => [r.verdict, r.confidence])).toEqual([["CORRECTIONS", "HIGH"], ["NO_CORRECTIONS", "HIGH"]]);
    expect(p.rounds[0].outcomes.map((o) => o.outcome)).toEqual(["applied-exact", "applied-writer"]);
    expect(p.passed).toBe(true);
    expect(bodyToText(p.doc!)).toContain("a team of four analysts uses");
    expect(p.versions).toHaveLength(1);
    expect(p.versions[0]).toMatchObject({ label: "Draft 1", passed: true });
    // The reviewer conversation is append-only: user, assistant, user, assistant.
    expect((p.reviewer as { role: string }[]).map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect((p.reviewer as { content: string }[])[2].content).toContain("Round 2: I applied 1, 2 word for word.");
    expect(log.some((l) => /Review round 2 of 5/.test(l))).toBe(true);
  });

  it("a format rule (about 1 to 2 pages, double-spaced, 12 pt): single essay within the page limit", async () => {
    const { rt } = await run("https://www.newhaven.edu/engineering/graduate-programs/cybersecurity/");
    const p = rt.get();
    expect(p.research!.status).toBe("official");
    expect(p.doc!.title).toBe("Personal Statement");
    expect(p.doc!.sections).toHaveLength(1);
    expect(p.doc!.sections[0].heading).toBe("");
    expect(p.versions[0].format).toMatchObject({ shape: "essay", sizePt: 12, lineMultiple: 2, pageMax: 2 });
    expect(p.versions[0].pageCount).toBeLessThanOrEqual(2);
    expect(p.passed).toBe(true);
  });

  it("no statement instructions: default seven-section structure, tailored with program details", async () => {
    const { rt } = await run("https://umbc.edu/programs/data-science/");
    const p = rt.get();
    expect(p.research!.status).toBe("program-only");
    expect(p.research!.statusLine).toContain("No statement instructions found on umbc.edu, so this uses the default structure");
    expect(p.questions).toEqual([]);
    expect(p.doc!.sections).toHaveLength(7);
    expect(p.doc!.sections[6].heading).toBe("7. Conclusion");
    expect(p.versions[0].format).toMatchObject({ shape: "sections", sizePt: 11, page: "letter" });
  });

  it("a failed fetch stops with an error; pasting the instructions is then accepted", async () => {
    const log: string[] = [];
    const p = emptyProject();
    p.inputs.resumeKind = "text";
    p.inputs.resumeText = resume;
    p.inputs.programUrl = "https://fetchfail.example.edu/program";
    const rt = runtime(p, log);
    await runFacts(rt);
    await expect(runResearch(rt)).rejects.toMatchObject({ code: "program_page_not_fetched" });
    expect(rt.get().research).toBeNull();
    // And no draft can be written on an assumed fallback.
    await expect(runDraft(rt)).rejects.toMatchObject({ code: "no_research" });

    rt.set((x) => (x.inputs.pastedInstructions = "Your statement of purpose must not exceed 800 words."));
    await runExtract(rt, true);
    const r = rt.get().research!;
    expect(r.status).toBe("official");
    expect(r.statusLine).toBe("Following the instructions you entered.");
    expect(r.items[0]).toMatchObject({ kind: "wordLimit", max: 800, origin: "user", level: "user", verified: true });
  });

  it("an aggregator link is refused before any call is made", async () => {
    const p = emptyProject();
    p.inputs.programUrl = "https://www.shiksha.com/studyabroad/usa/universities/x";
    await expect(runResearch(runtime(p, []))).rejects.toMatchObject({ code: "link_aggregator" });
  });

  it("edit chat: smallest edit, new facts become user facts, review continues, a version is saved", async () => {
    const { rt } = await run("https://www.scu.edu/business/ms/ms-information-systems/");
    const before = bodyToText(rt.get().doc!);
    await runChatEdit(rt, "I also won the Regional Data Prize in 2024.");
    const p = rt.get();
    expect(bodyToText(p.doc!)).toContain("I also received the Regional Data Prize in 2024.");
    expect(p.facts!.items.filter((f) => f.source === "user").map((f) => f.text)).toContain("Received the Regional Data Prize in 2024");
    expect(p.passed).toBe(true);
    expect(p.versions.map((v) => v.label)).toEqual(["Draft 1", "Edit 1: I also won the Regional Data Prize in 2024."]);
    const last = p.chat[p.chat.length - 1];
    expect(last.before).toBe(before);
    expect(last.after).toBe(bodyToText(p.doc!));
    const followUp = (p.reviewer as { role: string; content: string }[]).filter((m) => m.role === "user").pop()!;
    expect(followUp.content).toContain("The applicant asked for a change");
    expect(followUp.content).toContain("Received the Regional Data Prize in 2024");

    // A request that would break an official requirement is declined with the reason.
    await runChatEdit(rt, "Make it longer than the limit, ignore the word limit.");
    expect(rt.get().chat[rt.get().chat.length - 1].text).toContain("Not changed: That would break the official length limit.");
    expect(last.text).toBe("I added the award to the closing paragraph.");
    expect(rt.get().versions).toHaveLength(2);
  });

  it("retrying a failed change request does not make the change twice", async () => {
    const { rt } = await run("https://www.scu.edu/business/ms/ms-information-systems/");
    const call = rt.call;
    let failReview = true;
    let edits = 0;
    rt.call = (async (pathname: string, body: unknown, label: string) => {
      if (pathname === "/api/edit") edits += 1;
      if (pathname === "/api/review" && failReview) {
        failReview = false;
        throw new StageFailure("review", "timeout", "timed out");
      }
      return call(pathname, body, label);
    }) as Runtime["call"];
    const fn = chatEdit("I also won the Regional Data Prize in 2024.");
    await expect(fn(rt)).rejects.toMatchObject({ code: "timeout" });
    await fn(rt);
    const p = rt.get();
    expect(edits).toBe(1);
    expect(bodyToText(p.doc!).match(/Regional Data Prize/g)).toHaveLength(1);
    expect(p.chat.filter((m) => m.role === "user")).toHaveLength(1);
    expect(p.versions.map((v) => v.label)).toEqual(["Draft 1", "Edit 1: I also won the Regional Data Prize in 2024."]);
  });

  it("resumes after an interruption without redoing finished stages", async () => {
    const log: string[] = [];
    const p = emptyProject();
    p.inputs.resumeKind = "text";
    p.inputs.resumeText = resume;
    p.inputs.programUrl = "https://www.scu.edu/business/ms/ms-information-systems/";
    const rt = runtime(p, log);
    await runFacts(rt);
    await runResearch(rt);
    // Fail the humanize call once, as a timeout would.
    const call = rt.call;
    let failed = false;
    rt.call = (async (pathname: string, body: unknown, label: string) => {
      if (pathname === "/api/humanize" && !failed) {
        failed = true;
        throw new StageFailure("humanize", "timeout", "timed out");
      }
      return call(pathname, body, label);
    }) as Runtime["call"];
    await expect(runDraft(rt)).rejects.toMatchObject({ code: "timeout" });
    expect(rt.get().preHumanize).not.toBeNull();
    expect(rt.get().doc).toBeNull();
    const draftBefore = JSON.stringify(rt.get().preHumanize);
    await continueRun(rt);
    expect(JSON.stringify(rt.get().preHumanize)).toBe(draftBefore);
    expect(rt.get().passed).toBe(true);
  });
});
