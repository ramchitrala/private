/**
 * Live smoke test: runs the whole pipeline against the real API for three programs,
 * with the made-up resume in fixtures/resume.txt. Needs ANTHROPIC_API_KEY.
 *
 *   npm run smoke            all three
 *   npm run smoke -- a       only (a)
 *
 * Override the links with SMOKE_URL_A, SMOKE_URL_B and SMOKE_URL_C.
 * This spends API credits: each program is a full draft, humanize and review run.
 */
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../src/lib/types";
import { emptyProject } from "../src/lib/client/store";
import { runDraft, runFacts, runQuestions, runResearch, type Runtime } from "../src/lib/client/pipeline";
import { StageFailure } from "../src/lib/client/api";
import { buildFiles } from "../src/lib/client/files";
import { bodyWords } from "../src/lib/docmodel";
import { fileBaseName } from "../src/lib/requirements";

const ROOT = path.join(__dirname, "..");
const PROGRAMS: Record<string, { url: string; expect: string }> = {
  a: { url: process.env.SMOKE_URL_A ?? "https://www.scu.edu/business/ms/ms-information-systems/", expect: "question prompts with a total word range" },
  b: { url: process.env.SMOKE_URL_B ?? "https://www.newhaven.edu/engineering/graduate-programs/cybersecurity/", expect: "format rule: about 1 to 2 pages, double-spaced, 12 pt" },
  c: { url: process.env.SMOKE_URL_C ?? "https://professionalprograms.umbc.edu/data-science/", expect: "no statement instructions: default structure" },
};

const routes: Record<string, () => Promise<{ POST: (req: Request) => Promise<Response> }>> = {
  "/api/facts": () => import("../src/app/api/facts/route"),
  "/api/research/gather": () => import("../src/app/api/research/gather/route"),
  "/api/research/extract": () => import("../src/app/api/research/extract/route"),
  "/api/questions": () => import("../src/app/api/questions/route"),
  "/api/draft": () => import("../src/app/api/draft/route"),
  "/api/humanize": () => import("../src/app/api/humanize/route"),
  "/api/edit": () => import("../src/app/api/edit/route"),
  "/api/review": () => import("../src/app/api/review/route"),
};

function runtime(project: Project): Runtime {
  let current = project;
  return {
    info: { ok: true, mock: false, model: "", maxReviewRounds: Number(process.env.MAX_REVIEW_ROUNDS ?? 5), maxEditReviewRounds: 3 },
    get: () => current,
    set: (mutate) => {
      const next = structuredClone(current);
      mutate(next);
      current = next;
    },
    status: (m) => console.log(`    ${m}`),
    call: async <T,>(pathname: string, body: unknown) => {
      const { POST } = await routes[pathname]();
      const res = await POST(
        new Request(`http://localhost${pathname}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-app-passcode": process.env.APP_PASSCODE!, "x-project-id": current.id },
          body: JSON.stringify(body),
        }),
      );
      const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
      const last = lines[lines.length - 1];
      if (!last || last.type === "error") throw new StageFailure(last?.stage ?? pathname, last?.code ?? "error", last?.message ?? `HTTP ${res.status}`);
      return last.data as T;
    },
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. The live smoke test was not run.");
    process.exit(2);
  }
  process.env.APP_PASSCODE ||= "smoke";
  delete process.env.MOCK_ANTHROPIC;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/fonts/")) return new Response(fs.readFileSync(path.join(ROOT, "public", url)));
    return realFetch(input, init);
  }) as typeof fetch;

  const out = path.join(ROOT, "smoke-output");
  fs.mkdirSync(out, { recursive: true });
  const wanted = process.argv.slice(2).filter((a) => a in PROGRAMS);
  let failures = 0;
  for (const key of wanted.length ? wanted : Object.keys(PROGRAMS)) {
    const { url, expect } = PROGRAMS[key];
    console.log(`\n(${key}) ${url}\n    expecting: ${expect}`);
    const p = emptyProject();
    p.inputs.resumeKind = "text";
    p.inputs.resumeText = fs.readFileSync(path.join(ROOT, "fixtures", "resume.txt"), "utf8"); // made-up applicant
    p.inputs.programUrl = url;
    p.inputs.entryTerm = "Fall 2027";
    const rt = runtime(p);
    try {
      await runFacts(rt);
      await runResearch(rt);
      const r = rt.get().research!;
      console.log(`    status: ${r.status} | ${r.statusLine}`);
      for (const i of r.items) console.log(`      - ${i.kind}: ${i.text}${i.max ? ` (max ${i.max})` : ""}  <${i.sourceUrl}>`);
      if (r.dropped.length) console.log(`      dropped ${r.dropped.length} item(s) whose quotes did not verify`);
      await runQuestions(rt);
      await runDraft(rt);
      const end = rt.get();
      const v = end.versions[end.versions.length - 1];
      const files = await buildFiles(end.doc!, v.format);
      const base = `${key} - ${fileBaseName(end.doc!, end.research)}`;
      fs.writeFileSync(path.join(out, `${base}.pdf`), files.pdf);
      fs.writeFileSync(path.join(out, `${base}.docx`), files.docx);
      console.log(`    result: ${end.passed ? "PASSED review" : "NOT passed"} after ${end.rounds.length} round(s); ${bodyWords(end.doc!)} words, ${files.pageCount} page(s); shape ${v.format.shape}`);
      console.log(`    files: smoke-output/${base}.{pdf,docx}`);
    } catch (e) {
      failures += 1;
      console.error(`    FAILED: ${e instanceof StageFailure ? `${e.stage} (${e.code}): ${e.message}` : e}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

main();
