import type { DocSection, EditOutput, FactSheet, GatherResult, ReviewOutput, SourcePage, Usage, WriterOutput } from "../types";
import type { RawExtract } from "../requirements";
import type { StageCtx } from "./stage";
import { countWords } from "../docmodel";

// Mock mode (MOCK_ANTHROPIC=1): every stage answers from the fixtures below, so the UI
// and the tests run without API credits. The applicant ("Maya Okafor"), her employers
// and the page texts are invented. They are fixtures, not statements about any real program.

export async function mockDelay(ctx: StageCtx, usage: Partial<Usage> = {}, ms = process.env.VITEST ? 0 : 350): Promise<void> {
  ctx.emit({ type: "status", message: "Mock mode: answering from fixtures" });
  await new Promise((r) => setTimeout(r, ms));
  Object.assign(ctx.usage, { inputTokens: 1200, outputTokens: 800, stopReason: "end_turn", ...usage });
}

export const MOCK_RESUME_TEXT = `Maya Okafor
maya.okafor@example.com | Columbus, OH

EDUCATION
B.S. in Information Technology, Northfield College, Aug 2018 - May 2022. GPA 3.7/4.0. Dean's List, six semesters.

EXPERIENCE
Data Analyst, Harborline Credit Union, Jun 2022 - Present
- Built SQL and Python reports on loan delinquency used by a team of four analysts.
- Automated the monthly member-churn report, cutting preparation time from three days to four hours.
- Wrote data quality checks for the core banking export; flagged 2,300 duplicate member records in 2023.

IT Intern, Northfield College Library, May 2021 - Aug 2021
- Migrated the equipment-loan records from spreadsheets to a PostgreSQL database.

PROJECTS
Transit delay dashboard (2021): cleaned 1.2 million rows of public bus arrival data and built a Tableau dashboard of delays by route.
Capstone (2022): designed a help-desk ticket router with a team of three; it sorted tickets by keyword with 84% accuracy on a test set of 500 tickets.

SKILLS
SQL, Python (pandas), Tableau, PostgreSQL, Excel, Git

CERTIFICATIONS
CompTIA Security+ (2023)

AWARDS
Northfield College Capstone Prize, 2022
`;

export function mockFacts(): { applicantName: string; items: { category: string; text: string }[] } {
  return {
    applicantName: "Maya Okafor",
    items: [
      { category: "education", text: "B.S. in Information Technology, Northfield College, Aug 2018 - May 2022. GPA 3.7/4.0. Dean's List, six semesters." },
      { category: "experience", text: "Data Analyst, Harborline Credit Union, Jun 2022 - Present. Built SQL and Python reports on loan delinquency used by a team of four analysts." },
      { category: "experience", text: "Data Analyst, Harborline Credit Union: automated the monthly member-churn report, cutting preparation time from three days to four hours." },
      { category: "experience", text: "Data Analyst, Harborline Credit Union: wrote data quality checks for the core banking export; flagged 2,300 duplicate member records in 2023." },
      { category: "experience", text: "IT Intern, Northfield College Library, May 2021 - Aug 2021. Migrated the equipment-loan records from spreadsheets to a PostgreSQL database." },
      { category: "projects", text: "Transit delay dashboard (2021): cleaned 1.2 million rows of public bus arrival data and built a Tableau dashboard of delays by route." },
      { category: "projects", text: "Capstone (2022): designed a help-desk ticket router with a team of three; it sorted tickets by keyword with 84% accuracy on a test set of 500 tickets." },
      { category: "skills", text: "SQL, Python (pandas), Tableau, PostgreSQL, Excel, Git" },
      { category: "certifications", text: "CompTIA Security+ (2023)" },
      { category: "awards", text: "Northfield College Capstone Prize, 2022" },
      { category: "other", text: "Based in Columbus, OH" },
    ],
  };
}

/* ------------------------------------------------------------- research */

type Variant = "questions" | "essay" | "program-only" | "fetch-fail";

function variantFor(url: string): Variant {
  const u = url.toLowerCase();
  if (u.includes("fetchfail") || u.includes("blocked")) return "fetch-fail";
  if (u.includes("newhaven")) return "essay";
  if (u.includes("umbc") || u.includes("nostatement") || u.includes("rit.edu")) return "program-only";
  return "questions";
}

const PROGRAM_TEXT: Record<Exclude<Variant, "fetch-fail">, string> = {
  questions: `[Fixture page] Master of Science in Information Systems. The MS in Information Systems is offered by the Fixture School of Business at Fixture University. Students choose a track in Data Analytics or in Information Security. Core courses include Database Management Systems and Business Analytics. The Center for Applied Data Practice pairs student teams with local employers for a two-quarter practicum.`,
  essay: `[Fixture page] Master of Science in Cybersecurity. The MS in Cybersecurity is offered by the Fixture College of Engineering at Fixture University. Courses include Network Defense and Digital Forensics. Students work in the Cyber Operations Lab on incident-response exercises.`,
  "program-only": `[Fixture page] Master of Professional Studies in Data Science. The MPS in Data Science is offered by the Fixture College of Computing at Fixture University. Courses include Applied Machine Learning and Data Engineering. The program ends with a capstone project for an industry partner. Applicants submit transcripts, a resume and two letters of recommendation.`,
};

const INSTRUCTION_TEXT: Record<"questions" | "essay", string> = {
  questions: `[Fixture page] Application requirements. Statement of Purpose: answer each of the following questions. The complete statement should be 400 to 500 words in total. Question 1: What excites you about information systems? Question 2: Describe a project or experience that prepared you for graduate study. Question 3: What are your career goals after the program? Do not restate your resume. Upload the statement as a PDF.`,
  essay: `[Fixture page] How to apply. Personal Statement: tell us about your academic and professional background and your goals in cybersecurity. The statement should be approximately 1-2 pages, double-spaced, in 12 point font. Statements must be the applicant's own work.`,
};

export function mockGather(programUrl: string): GatherResult {
  const variant = variantFor(programUrl);
  const now = new Date().toISOString();
  if (variant === "fetch-fail") {
    return { pages: [], queries: [], searchCount: 0, fetchCount: 1, fetchErrors: [{ url: programUrl, code: "url_not_accessible" }], searchErrors: [], programPageFetched: false };
  }
  const base = programUrl.replace(/[#?].*$/, "").replace(/\/+$/, "");
  const pages: SourcePage[] = [{ url: programUrl, title: "Program page (fixture)", kind: "html", text: PROGRAM_TEXT[variant], retrievedAt: now }];
  if (variant !== "program-only") {
    pages.push({ url: `${base}/apply`, title: "Application requirements (fixture)", kind: "html", text: INSTRUCTION_TEXT[variant], retrievedAt: now });
  }
  return {
    pages,
    queries: ["statement of purpose requirements", "personal statement essay questions", "graduate application requirements"],
    searchCount: 3,
    fetchCount: pages.length,
    fetchErrors: [],
    searchErrors: [],
    programPageFetched: true,
  };
}

export function mockExtract(pages: SourcePage[]): RawExtract {
  const empty: RawExtract = { country: "US", docType: [], prompts: [], wordLimit: [], pageLimit: [], formatting: [], topics: [], avoid: [], aiPolicy: [], programDetails: [] };
  const find = (needle: string) => pages.find((p) => p.text.includes(needle));
  const out = { ...empty };
  const detail = (page: SourcePage, kind: string, value: string, quote: string) => out.programDetails.push({ kind, value, quote, sourceUrl: page.url });

  const q = find("Master of Science in Information Systems");
  if (q) {
    detail(q, "program", "MS in Information Systems", "The MS in Information Systems is offered by the Fixture School of Business at Fixture University.");
    detail(q, "school", "Fixture School of Business", "The MS in Information Systems is offered by the Fixture School of Business at Fixture University.");
    detail(q, "university", "Fixture University", "offered by the Fixture School of Business at Fixture University");
    detail(q, "concentration", "Data Analytics", "Students choose a track in Data Analytics or in Information Security.");
    detail(q, "course", "Database Management Systems", "Core courses include Database Management Systems and Business Analytics.");
    detail(q, "lab", "Center for Applied Data Practice", "The Center for Applied Data Practice pairs student teams with local employers for a two-quarter practicum.");
    // An invented detail with a quote that is not on the page: verification must drop it.
    detail(q, "course", "Quantum Ledger Design", "Students also take Quantum Ledger Design in their first term.");
  }
  const e = find("Master of Science in Cybersecurity");
  if (e) {
    detail(e, "program", "MS in Cybersecurity", "The MS in Cybersecurity is offered by the Fixture College of Engineering at Fixture University.");
    detail(e, "school", "Fixture College of Engineering", "The MS in Cybersecurity is offered by the Fixture College of Engineering at Fixture University.");
    detail(e, "university", "Fixture University", "offered by the Fixture College of Engineering at Fixture University");
    detail(e, "course", "Network Defense", "Courses include Network Defense and Digital Forensics.");
    detail(e, "lab", "Cyber Operations Lab", "Students work in the Cyber Operations Lab on incident-response exercises.");
  }
  const p = find("Master of Professional Studies in Data Science");
  if (p) {
    detail(p, "program", "MPS in Data Science", "The MPS in Data Science is offered by the Fixture College of Computing at Fixture University.");
    detail(p, "school", "Fixture College of Computing", "The MPS in Data Science is offered by the Fixture College of Computing at Fixture University.");
    detail(p, "university", "Fixture University", "offered by the Fixture College of Computing at Fixture University");
    detail(p, "course", "Applied Machine Learning", "Courses include Applied Machine Learning and Data Engineering.");
    detail(p, "feature", "Capstone project for an industry partner", "The program ends with a capstone project for an industry partner.");
  }

  const qi = find("Question 1: What excites you");
  if (qi) {
    const s = { sourceUrl: qi.url, level: "program" };
    out.docType.push({ value: "Statement of Purpose", quote: "Statement of Purpose: answer each of the following questions.", ...s });
    out.wordLimit.push({ text: "400 to 500 words in total", min: 400, max: 500, quote: "The complete statement should be 400 to 500 words in total.", ...s });
    out.prompts.push({ text: "What excites you about information systems?", wordMin: 0, wordMax: 0, quote: "Question 1: What excites you about information systems?", ...s });
    out.prompts.push({ text: "Describe a project or experience that prepared you for graduate study.", wordMin: 0, wordMax: 0, quote: "Question 2: Describe a project or experience that prepared you for graduate study.", ...s });
    out.prompts.push({ text: "What are your career goals after the program?", wordMin: 0, wordMax: 0, quote: "Question 3: What are your career goals after the program?", ...s });
    out.avoid.push({ text: "Do not restate your resume", quote: "Do not restate your resume.", ...s });
    out.formatting.push({ aspect: "filetype", text: "Upload as a PDF", normalized: "pdf", quote: "Upload the statement as a PDF.", ...s });
  }
  const ei = find("approximately 1-2 pages");
  if (ei) {
    const s = { sourceUrl: ei.url, level: "program" };
    out.docType.push({ value: "Personal Statement", quote: "Personal Statement: tell us about your academic and professional background", ...s });
    out.pageLimit.push({ text: "Approximately 1-2 pages", min: 1, max: 2, quote: "The statement should be approximately 1-2 pages, double-spaced, in 12 point font.", ...s });
    out.formatting.push({ aspect: "spacing", text: "Double-spaced", normalized: "double", quote: "approximately 1-2 pages, double-spaced, in 12 point font", ...s });
    out.formatting.push({ aspect: "size", text: "12 point font", normalized: "12", quote: "double-spaced, in 12 point font", ...s });
    out.topics.push({ text: "Academic and professional background", quote: "tell us about your academic and professional background and your goals in cybersecurity", ...s });
    out.topics.push({ text: "Goals in cybersecurity", quote: "your goals in cybersecurity", ...s });
    out.aiPolicy.push({ text: "The statement must be the applicant's own work", quote: "Statements must be the applicant's own work.", ...s });
  }
  // Instructions the user pasted by hand.
  const pasted = pages.find((pg) => pg.kind === "pasted");
  if (pasted && !qi && !ei) {
    const m = pasted.text.match(/[^.\n]*\b(\d{3,4})\s*words?\b[^.\n]*\.?/i);
    if (m) out.wordLimit.push({ text: m[0].trim(), min: 0, max: Number(m[1]), quote: m[0].trim(), sourceUrl: pasted.url, level: "program" });
  }
  return out;
}

export function mockQuestions(hasInstructions: boolean): { questions: { text: string; why: string }[] } {
  if (!hasInstructions) return { questions: [] };
  return {
    questions: [
      { text: "What do you want to be doing five years after the program?", why: "The instructions ask about career goals" },
      { text: "Have you received any scholarships or fellowships?", why: "Helps answer the background question" },
    ],
  };
}

/* ---------------------------------------------------------------- draft */

// The draft before the humanizer pass keeps a few patterns on purpose (dashes, stock words,
// a "not just ... but" contrast) so the humanize, lint and review stages have something to do.
const P = {
  origin:
    "The first useful program I wrote was a query, not an app. In my second year at Northfield College I cleaned 1.2 million rows of public bus arrival data for a class project and built a Tableau dashboard of delays by route. The work was slow — most of it was finding out why two rows that should have matched did not — but by the end I could say which routes ran late and when. That project is why I chose information technology as a career, and it is the kind of problem I still like best.",
  study:
    "I completed a B.S. in Information Technology at Northfield College in May 2022 with a 3.7 GPA and six semesters on the Dean's List. For my capstone, I designed a help-desk ticket router with a team of three. It sorted tickets by keyword with 84% accuracy on a test set of 500 tickets, and it won the Northfield College Capstone Prize in 2022. The summer before, as an IT intern at the college library, I migrated the equipment-loan records from spreadsheets to a PostgreSQL database.",
  work:
    "Since June 2022 I have worked as a data analyst at Harborline Credit Union. I build SQL and Python reports on loan delinquency that a team of four analyst use every week. I automated the monthly member-churn report, which cut its preparation time from three days to four hours. I also wrote data quality checks for the core banking export. In 2023 those data quality checks flagged 2,300 duplicate member records, a pivotal finding that changed how the membership team counts accounts.",
  gap:
    "Two years of this work has shown me what I do not yet know. I can write the report, but I cannot yet design the system that makes the report unnecessary. It is not just a question of tools, but of knowing how data should be modeled, governed and secured before anyone queries it. I earned the CompTIA Security+ certification in 2023 to start on the security side, and I want formal training for the rest.",
  goals:
    "After the program I want to lead the data platform work at a credit union or a regional bank — institutions that hold sensitive records and rarely have large engineering teams. In the near term that means a role as a data engineer or analytics lead. Over a longer period I want to be the person who decides how member data is structured and who is allowed to see it.",
  fit:
    "This program fits that plan. Its courses cover the modeling and governance questions I meet at work, and its practical projects with outside partners match how I learn: I do my best work when a real team is waiting on the result.",
  close:
    "I am applying with a clear picture of what I can do and what I need to learn. I will bring two years of hands-on analysis in a regulated business, and I intend to leave able to build the systems I now only query.",
};

function humanized(text: string): string {
  return text
    .replace("The work was slow — most of it was finding out why two rows that should have matched did not — but by the end", "The work was slow, mostly because I had to find out why two rows that should have matched did not, but by the end")
    .replace(", a pivotal finding that changed how", ", which changed how")
    .replace("It is not just a question of tools, but of knowing how", "The gap is in knowing how")
    .replace(" — institutions that hold sensitive records and rarely have large engineering teams.", ". These institutions hold sensitive records and rarely have large engineering teams.");
}

function shapeOf(text: string): "questions" | "essay" | "sections" {
  if (text.includes("one section per official prompt")) return "questions";
  if (text.includes("a single continuous essay")) return "essay";
  return "sections";
}

export function mockDraft(userPrompt: string): WriterOutput {
  const shape = shapeOf(userPrompt);
  if (shape === "questions") {
    return {
      sections: [
        { heading: "1. What excites me about information systems", paragraphs: [P.origin, P.gap] },
        { heading: "2. The work that prepared me", paragraphs: [P.study, P.work] },
        { heading: "3. Where I want to go next", paragraphs: [P.goals, P.close] },
      ],
    };
  }
  if (shape === "essay") {
    return { sections: [{ heading: "", paragraphs: [P.origin, P.work, P.gap, P.goals] }] };
  }
  return {
    sections: [
      { heading: "1. Background and motivation", paragraphs: [P.origin] },
      { heading: "2. Academic background and technical projects", paragraphs: [P.study] },
      { heading: "3. Professional experience", paragraphs: [P.work] },
      { heading: "4. Why data science?", paragraphs: [P.gap] },
      { heading: "5. Career goals", paragraphs: [P.goals] },
      { heading: "6. Why Fixture University?", paragraphs: [P.fit] },
      { heading: "7. Conclusion", paragraphs: [P.close] },
    ],
  };
}

export function mockHumanize(sections: DocSection[], only?: string[]): WriterOutput {
  return {
    sections: sections.map((s) => ({
      heading: s.heading,
      paragraphs: s.paragraphs.map((p) => (!only?.length || only.includes(p) ? humanized(p) : p)),
    })),
  };
}

/* --------------------------------------------------------------- review */

export function mockReview(round: number, currentText: string, isEditFollowUp: boolean): ReviewOutput {
  if (round === 1 && !isEditFollowUp) {
    const corrections: ReviewOutput["corrections"] = [];
    if (currentText.includes("a team of four analyst use")) {
      corrections.push({
        id: "1",
        severity: "MUST_FIX",
        category: "grammar",
        currentText: "a team of four analyst use",
        replacementText: "a team of four analysts uses",
        reason: "The facts say a team of four analysts; the noun and verb need to agree.",
      });
    }
    if ((currentText.match(/data quality checks/g) ?? []).length > 1) {
      corrections.push({
        id: "2",
        severity: "SHOULD_FIX",
        category: "flow",
        currentText: "data quality checks",
        replacementText: "validation checks",
        reason: "The phrase repeats in consecutive sentences; vary the first mention.",
      });
    }
    if (corrections.length) return { verdict: "CORRECTIONS", confidence: "HIGH", corrections };
  }
  return { verdict: "NO_CORRECTIONS", confidence: "HIGH", corrections: [] };
}

/* ----------------------------------------------------------------- edit */

export function mockEdit(
  sections: DocSection[],
  task: { mode: "correction"; currentText: string; replacementText: string } | { mode: "chat"; request: string } | { mode: "trim" },
): EditOutput {
  const copy: DocSection[] = JSON.parse(JSON.stringify(sections));
  const base = { declined: false, declineReason: "", newFacts: [] as string[], note: "" };
  if (task.mode === "correction") {
    for (const s of copy) {
      const i = s.paragraphs.findIndex((p) => p.includes(task.currentText));
      if (i !== -1) {
        s.paragraphs[i] = s.paragraphs[i].replace(task.currentText, task.replacementText);
        return { ...base, sections: copy, note: "Changed the first mention." };
      }
    }
    return { ...base, sections: copy, note: "Passage not found; nothing changed." };
  }
  if (task.mode === "trim") {
    // Drop the last sentence of the longest paragraph.
    let best = { s: 0, p: 0, n: 0 };
    copy.forEach((s, si) => s.paragraphs.forEach((p, pi) => countWords(p) > best.n && (best = { s: si, p: pi, n: countWords(p) })));
    const para = copy[best.s].paragraphs[best.p];
    const cut = para.replace(/\s+[^.!?]+[.!?]\s*$/, "");
    copy[best.s].paragraphs[best.p] = cut.length > 40 ? cut : para;
    return { ...base, sections: copy, note: "Trimmed the longest paragraph." };
  }
  const req = task.request.trim();
  if (/exceed|longer than the limit|ignore the (word )?limit/i.test(req)) {
    return { ...base, sections: copy, declined: true, declineReason: "That would break the official length limit." };
  }
  const last = copy[copy.length - 1];
  const award = req.match(/\bI (?:also )?(?:won|received|earned) ([^.]+)\.?/i);
  if (award) {
    last.paragraphs[last.paragraphs.length - 1] += ` I also received ${award[1].trim()}.`;
    return { ...base, sections: copy, newFacts: [`Received ${award[1].trim()}`], note: "I added the award to the closing paragraph." };
  }
  last.paragraphs[last.paragraphs.length - 1] += " I am ready to start in the fall.";
  return { ...base, sections: copy, note: "I added one sentence to the closing paragraph." };
}

export function mockFactSheet(): FactSheet {
  const f = mockFacts();
  return { applicantName: f.applicantName, items: f.items.map((i, n) => ({ id: `mock_${n}`, category: i.category as FactSheet["items"][number]["category"], text: i.text, source: "resume" })) };
}
