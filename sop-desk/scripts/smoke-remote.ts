/**
 * Live test against a deployed SOP Desk: drives the same browser-side pipeline the app uses,
 * calling the deployed API routes over HTTPS. The made-up resume in fixtures/resume.txt is used.
 *
 *   SOP_DESK_URL=https://sop-desk.vercel.app SOP_DESK_PASSCODE=... npm run smoke:remote -- a
 *
 * This spends API credits on the deployment's key. Results go to smoke-output/.
 */
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../src/lib/types";
import { emptyProject } from "../src/lib/client/store";
import { formatFor, runDraft, runFacts, runQuestions, runResearch, type Runtime } from "../src/lib/client/pipeline";
import { callStage, StageFailure } from "../src/lib/client/api";
import { buildFiles } from "../src/lib/client/files";
import { bodyWords, docToText } from "../src/lib/docmodel";
import { fileBaseName, sectionLimits } from "../src/lib/requirements";
import { lintDoc } from "../src/lib/lint";

const ROOT = path.join(__dirname, "..");
const BASE = (process.env.SOP_DESK_URL ?? "https://sop-desk.vercel.app").replace(/\/$/, "");
const PROGRAMS: Record<string, string> = {
  a: process.env.SMOKE_URL_A ?? "https://www.scu.edu/business/ms/ms-information-systems/",
  b: process.env.SMOKE_URL_B ?? "https://www.newhaven.edu/engineering/graduate-programs/cybersecurity/",
  c: process.env.SMOKE_URL_C ?? "https://professionalprograms.umbc.edu/data-science/",
};

function runtime(project: Project, log: (s: string) => void): Runtime {
  let current = project;
  return {
    info: { ok: true, mock: false, model: "", maxReviewRounds: 5, maxEditReviewRounds: 3 },
    get: () => current,
    set: (mutate) => {
      const next = structuredClone(current);
      mutate(next);
      current = next;
    },
    status: (m) => log(`  · ${m}`),
    call: async <T,>(pathname: string, body: unknown) => {
      const started = Date.now();
      let thoughts = 0;
      const { data, usage } = await callStage<T>(`${BASE}${pathname}`, body, {
        passcode: process.env.SOP_DESK_PASSCODE ?? "via-proxy",
        projectId: current.id,
        onActivity: (t) => log(`    > ${t}`),
        onThought: (_t, start) => start && (thoughts += 1),
      });
      log(
        `    ${pathname.padEnd(22)} ${((Date.now() - started) / 1000).toFixed(0)}s  in ${usage.inputTokens}  out ${usage.outputTokens}  web ${usage.searches}/${usage.fetches}  thoughts ${thoughts}  stop ${usage.stopReason}`,
      );
      return data;
    },
  };
}

async function main() {
  const fetchLocal = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/fonts/")) return new Response(fs.readFileSync(path.join(ROOT, "public", url)));
    if (url.startsWith(BASE) && !process.env.SOP_DESK_PASSCODE) {
      // Behind a credential-injecting proxy: send a placeholder bearer token that the proxy replaces.
      const headers = new Headers(init?.headers);
      headers.set("authorization", "Bearer proxy-injected");
      return fetchLocal(input, { ...init, headers });
    }
    return fetchLocal(input, init);
  }) as typeof fetch;

  const out = path.join(ROOT, "smoke-output");
  fs.mkdirSync(out, { recursive: true });
  const keys = process.argv.slice(2).filter((k) => k in PROGRAMS);
  let failures = 0;
  for (const key of keys.length ? keys : Object.keys(PROGRAMS)) {
    const lines: string[] = [];
    const log = (s: string) => {
      lines.push(s);
      console.log(s);
    };
    log(`\n(${key}) ${PROGRAMS[key]}`);
    const p = emptyProject();
    p.inputs.resumeKind = "text";
    p.inputs.resumeText = fs.readFileSync(path.join(ROOT, "fixtures", "resume.txt"), "utf8"); // made-up applicant
    p.inputs.programUrl = PROGRAMS[key];
    p.inputs.entryTerm = "Fall 2027";
    const rt = runtime(p, log);
    try {
      await runFacts(rt);
      log(`  facts: ${rt.get().facts?.items.length} details for ${rt.get().facts?.applicantName}`);
      await runResearch(rt);
      const r = rt.get().research!;
      log(`  status: ${r.status} | ${r.statusLine}`);
      for (const i of r.items) log(`    - ${i.kind}: ${i.text}${i.max ? ` (max ${i.max})` : ""}`);
      log(`    program details: ${r.details.map((d) => `${d.kind}=${d.value}`).join("; ")}`);
      if (r.dropped.length) log(`    dropped (quote not on page): ${r.dropped.map((d) => d.text).join("; ")}`);
      await runQuestions(rt);
      log(`  questions: ${(rt.get().questions ?? []).map((q) => q.text).join(" | ") || "none"} (left unanswered)`);
      await runDraft(rt);
      const end = rt.get();
      const format = formatFor(end);
      const files = await buildFiles(end.doc!, format);
      const lint = lintDoc(end.doc!, sectionLimits(end.research, format));
      const base = `${key} - ${fileBaseName(end.doc!, end.research)}`;
      fs.writeFileSync(path.join(out, `${base}.pdf`), files.pdf);
      fs.writeFileSync(path.join(out, `${base}.docx`), files.docx);
      fs.writeFileSync(path.join(out, `${base}.txt`), docToText(end.doc!));
      log(`  rounds: ${end.rounds.map((x) => `${x.verdict}/${x.confidence}(${x.outcomes.length})`).join(" → ")}`);
      log(`  result: ${end.passed ? "PASSED" : "NOT passed"}; ${bodyWords(end.doc!)} words; ${files.pageCount} page(s); shape ${format.shape}; dashes ${lint.emDashes + lint.enDashes}; stock words ${lint.stockWords.length}`);
      log(`  headings: ${end.doc!.sections.map((s) => s.heading || "(none)").join(" | ")}`);
    } catch (e) {
      failures += 1;
      log(`  FAILED: ${e instanceof StageFailure ? `${e.stage} (${e.code}): ${e.message}` : String(e)}`);
    }
    fs.writeFileSync(path.join(out, `${key}-log.txt`), lines.join("\n"));
  }
  process.exit(failures ? 1 : 0);
}

main();
