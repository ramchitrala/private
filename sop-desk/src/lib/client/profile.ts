import type { FactItem, FactOrigin, Profile, Project, Question } from "../types";
import type { Runtime } from "./pipeline";
import { emptyProject } from "./store";
import { cleanText } from "../clean";
import { newId } from "../docmodel";

/**
 * Lets the unchanged pipeline read a resume into the profile: `get()` presents the profile as a
 * statement carrying the resume, and `set()` writes the details it reads back into the profile.
 */
export function profileRuntime(base: Runtime, getProfile: () => Profile, setProfile: (mutate: (p: Profile) => void) => void): Runtime {
  const asProject = (): Project => {
    const p = getProfile();
    const project = emptyProject("profile");
    project.id = "profile";
    project.inputs.resumeKind = p.resume.kind;
    project.inputs.resumeName = p.resume.name;
    project.inputs.resumeData = p.resume.data;
    project.inputs.resumeText = p.resume.text;
    project.facts = p.facts.items.length || p.facts.applicantName ? JSON.parse(JSON.stringify(p.facts)) : null;
    return project;
  };
  return {
    ...base,
    get: asProject,
    set: (mutate) => {
      const project = asProject();
      mutate(project);
      if (!project.facts) return;
      const facts = project.facts;
      setProfile((p) => {
        p.facts = facts;
        // Details read from a resume are "resume"; anything the applicant typed keeps its origin.
        const origins: Record<string, FactOrigin> = {};
        for (const f of facts.items) origins[f.id] = p.factOrigins[f.id] ?? (f.source === "user" ? "added" : "resume");
        p.factOrigins = origins;
        p.version += 1;
        p.updatedAt = new Date().toISOString();
        p.resume.savedAt = p.resume.savedAt || p.updatedAt;
      });
    },
  };
}

/** Questions that should not be remembered for later statements by default. */
export function isProgramSpecific(question: string): boolean {
  return /\bthis (program|school|university|department|degree)\b|\bwhy\b|\buniversity\b|\bprogram's\b/i.test(question);
}

/** The text an answer is saved as, matching what the pipeline folds into a statement. */
export function answerText(q: Question): string {
  return `${q.text} ${cleanText(q.answer).trim()}`;
}

/** Add answered questions the applicant chose to keep to the profile as their own details. */
export function rememberAnswers(profile: Profile, questions: Question[], keep: Record<string, boolean>): FactItem[] {
  const added: FactItem[] = [];
  for (const q of questions) {
    if (q.skipped || !cleanText(q.answer).trim() || !(keep[q.id] ?? !isProgramSpecific(q.text))) continue;
    const text = answerText(q);
    if (profile.facts.items.some((f) => f.text === text)) continue;
    const item: FactItem = { id: newId("fact"), category: "other", text, source: "user" };
    profile.facts.items.push(item);
    profile.factOrigins[item.id] = "answer";
    added.push(item);
  }
  if (added.length) {
    profile.version += 1;
    profile.updatedAt = new Date().toISOString();
  }
  return added;
}

/** Details the applicant stated in a change request, found by comparing a statement before and after. */
export function newUserFacts(before: Project, after: Project): FactItem[] {
  const had = new Set((before.facts?.items ?? []).map((f) => f.id));
  return (after.facts?.items ?? []).filter((f) => f.source === "user" && !had.has(f.id) && !f.id.startsWith("ans_"));
}
