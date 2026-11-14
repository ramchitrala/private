import type Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { stageRoute, StageError } from "@/lib/server/stage";
import { callClaude, parseJson, systemBlocks } from "@/lib/server/anthropic";
import { getConfig, isMock } from "@/lib/server/config";
import { factsSchema } from "@/lib/server/schemas";
import { FACTS_SYSTEM } from "@/lib/server/prompts";
import { mockDelay, mockFacts } from "@/lib/server/mock";
import { cleanText } from "@/lib/clean";
import { newId } from "@/lib/docmodel";
import type { FactsBody } from "@/lib/api-types";
import type { FactCategory, FactItem, FactSheet } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 3 * 1024 * 1024;

interface RawFacts {
  applicantName: string;
  education: { degree: string; institution: string; dates: string; details: string }[];
  experience: { title: string; organization: string; dates: string; details: string }[];
  projects: { name: string; dates: string; details: string }[];
  skills: string[];
  certifications: string[];
  awards: string[];
  other: string[];
}

function join(head: string[], dates: string, details: string): string {
  const h = head.map((s) => s.trim()).filter(Boolean).join(", ");
  return cleanText([h + (dates.trim() ? `, ${dates.trim()}` : ""), details.trim()].filter(Boolean).join(". ").replace(/\.\.$/, "."));
}

function toSheet(raw: RawFacts): FactSheet {
  const items: FactItem[] = [];
  const add = (category: FactCategory, text: string) => text.trim() && items.push({ id: newId("fact"), category, text: text.trim(), source: "resume" });
  raw.education.forEach((e) => add("education", join([e.degree, e.institution], e.dates, e.details)));
  raw.experience.forEach((e) => add("experience", join([e.title, e.organization], e.dates, e.details)));
  raw.projects.forEach((p) => add("projects", join([p.name], p.dates, p.details)));
  if (raw.skills.length) add("skills", cleanText(raw.skills.join(", ")));
  raw.certifications.forEach((c) => add("certifications", cleanText(c)));
  raw.awards.forEach((a) => add("awards", cleanText(a)));
  raw.other.forEach((o) => add("other", cleanText(o)));
  return { applicantName: cleanText(raw.applicantName).trim(), items };
}

export const POST = stageRoute<FactsBody>("facts", async (body, ctx) => {
  ctx.emit({ type: "status", message: "Reading your resume" });
  let content: Anthropic.ContentBlockParam[];

  if (body.kind === "text") {
    const text = cleanText(body.text ?? "").trim();
    if (text.length < 40) throw new StageError("empty_resume", "The resume text is too short to read. Paste the full text or upload the file.");
    content = [{ type: "text", text: `<resume>\n${text}\n</resume>\n\nReturn the fact sheet.` }];
  } else {
    const bytes = Buffer.from(body.data ?? "", "base64");
    if (!bytes.length) throw new StageError("empty_resume", "The resume file is empty.");
    if (bytes.length > MAX_BYTES) throw new StageError("too_large", "The resume file is larger than 3 MB.");
    if (body.kind === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      const text = cleanText(value).trim();
      if (text.length < 40) throw new StageError("empty_resume", "No text could be read from that Word file. Paste the resume text instead.");
      content = [{ type: "text", text: `<resume>\n${text}\n</resume>\n\nReturn the fact sheet.` }];
    } else {
      // PDFs go in as a document block, which reads multi-column layouts correctly.
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
        { type: "text", text: "The document above is the applicant's resume. Return the fact sheet." },
      ];
    }
  }

  if (isMock()) {
    await mockDelay(ctx);
    const m = mockFacts();
    return toSheetFromFlat(m);
  }
  const res = await callClaude(ctx, {
    effort: getConfig().effort.research,
    system: systemBlocks(FACTS_SYSTEM),
    messages: [{ role: "user", content }],
    schema: factsSchema,
  });
  return toSheet(parseJson<RawFacts>(res.text));
});

function toSheetFromFlat(m: { applicantName: string; items: { category: string; text: string }[] }): FactSheet {
  return {
    applicantName: m.applicantName,
    items: m.items.map((i) => ({ id: newId("fact"), category: i.category as FactCategory, text: i.text, source: "resume" })),
  };
}
