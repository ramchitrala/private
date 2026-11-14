import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { openDB } from "idb";
import type { Profile, Project, Question } from "@/lib/types";
import {
  applyProfile,
  detailsChangedSince,
  emptyProfile,
  emptyProject,
  isMigrated,
  listProjects,
  markMigrated,
  loadProfile,
  makeBackup,
  newStatement,
  profileFromProjects,
  readBackup,
  saveProfile,
  stampProfileVersion,
} from "@/lib/client/store";
import { isProgramSpecific, newUserFacts, profileRuntime, rememberAnswers } from "@/lib/client/profile";
import { runFacts, type Runtime } from "@/lib/client/pipeline";
import { checklist, resolveFormat } from "@/lib/requirements";
import { stepFor } from "@/components/screens/steps";
import { researchKey } from "@/components/screens/research";
import { ROOT } from "./helpers";

function projectWithFacts(name: string, updatedAt: string, texts: string[]): Project {
  const p = emptyProject();
  p.updatedAt = updatedAt;
  p.inputs.resumeKind = "text";
  p.inputs.resumeText = `${name} resume`;
  p.inputs.voiceSample = `${name} voice`;
  p.inputs.entryTerm = "Fall 2027";
  p.confirmedDomains = [`${name}.ca`];
  p.facts = { applicantName: "Maya Okafor", items: texts.map((t, i) => ({ id: `${name}${i}`, category: "other", text: t, source: i === 0 ? "user" : "resume" })) };
  return p;
}

describe("profile: stored once, reused for every statement", () => {
  it("a new statement copies the profile's details, writing sample and last entry term", () => {
    const prof: Profile = { ...emptyProfile(), version: 3, lastEntryTerm: "Fall 2027", voiceSample: "I write plainly.", facts: { applicantName: "Maya", items: [{ id: "a", category: "awards", text: "Prize", source: "resume" }] } };
    const s = newStatement(prof);
    expect(s.facts).toEqual(prof.facts);
    expect(s.facts).not.toBe(prof.facts);
    expect(s.inputs.entryTerm).toBe("Fall 2027");
    expect(s.inputs.voiceSample).toBe("I write plainly.");
    expect(s.inputs.resumeData).toBe("");
    expect(s.profileVersion).toBe(3);
  });

  it("profile changes reach statements without a draft, and never rewrite one that has a draft", () => {
    const prof: Profile = { ...emptyProfile(), version: 5, facts: { applicantName: "Maya", items: [{ id: "n", category: "awards", text: "New award", source: "user" }] } };
    const fresh = emptyProject();
    fresh.facts = { applicantName: "Maya", items: [{ id: "ans_q1", category: "other", text: "Goals? Lead a team.", source: "user" }] };
    const updated = applyProfile(fresh, prof);
    expect(updated.facts!.items.map((f) => f.id)).toEqual(["n", "ans_q1"]);
    expect(updated.profileVersion).toBe(5);

    const drafted = { ...emptyProject(), doc: { title: "", header: [], sections: [] }, profileVersion: 2 };
    expect(applyProfile(drafted, prof)).toBe(drafted);
    expect(detailsChangedSince(drafted, prof)).toBe(true);
    expect(detailsChangedSince({ ...drafted, profileVersion: 5 }, prof)).toBe(false);
  });

  it("migration builds the profile from the newest statement that has details and trusts every confirmed site", () => {
    const older = projectWithFacts("old", "2026-01-01T00:00:00Z", ["a"]);
    const newer = projectWithFacts("new", "2026-02-01T00:00:00Z", ["typed by me", "read from resume"]);
    const empty = emptyProject();
    const prof = profileFromProjects([older, empty, newer])!;
    expect(prof.resume.text).toBe("new resume");
    expect(prof.voiceSample).toBe("new voice");
    expect(prof.lastEntryTerm).toBe("Fall 2027");
    expect(prof.facts.items.map((f) => f.text)).toEqual(["typed by me", "read from resume"]);
    expect(prof.factOrigins).toEqual({ new0: "added" });
    expect(prof.trustedSites.sort()).toEqual(["new.ca", "old.ca"]);
    expect(prof.factsConfirmedAt).not.toBeNull();
    expect(stampProfileVersion(newer, prof).profileVersion).toBe(1);
    expect(stampProfileVersion(older, prof).profileVersion).toBe(0);
    expect(profileFromProjects([empty])).toBeNull();
  });

  it("answers the applicant keeps become their own details; program-specific ones are off by default", () => {
    expect(isProgramSpecific("Why do you want to join this program?")).toBe(true);
    expect(isProgramSpecific("Which faculty member at the university interests you?")).toBe(true);
    expect(isProgramSpecific("Have you received any scholarships or fellowships?")).toBe(false);
    const prof = emptyProfile();
    const qs: Question[] = [
      { id: "q1", text: "Have you received any scholarships?", why: "", answer: "Regional Fellowship 2024", skipped: false },
      { id: "q2", text: "Why this program?", why: "", answer: "Its practicum.", skipped: false },
      { id: "q3", text: "What are your goals?", why: "", answer: "", skipped: false },
      { id: "q4", text: "Strengths?", why: "", answer: "Patience", skipped: false },
    ];
    const added = rememberAnswers(prof, qs, { q4: false });
    expect(added.map((f) => f.text)).toEqual(["Have you received any scholarships? Regional Fellowship 2024"]);
    expect(prof.factOrigins[added[0].id]).toBe("answer");
    expect(prof.version).toBe(1);
    // Saving twice does not duplicate.
    expect(rememberAnswers(prof, qs, { q4: false })).toEqual([]);
  });

  it("finds details the applicant stated in a change request", () => {
    const before = emptyProject();
    before.facts = { applicantName: "M", items: [{ id: "a", category: "other", text: "x", source: "resume" }] };
    const after = structuredClone(before);
    after.facts!.items.push({ id: "b", category: "other", text: "Won the Regional Data Prize", source: "user" }, { id: "ans_1", category: "other", text: "answer", source: "user" });
    expect(newUserFacts(before, after).map((f) => f.id)).toEqual(["b"]);
  });

  it("reads a resume straight into the profile through the unchanged pipeline", async () => {
    let profile: Profile = { ...emptyProfile(), resume: { kind: "text", name: "Pasted resume text", data: "", text: fs.readFileSync(`${ROOT}/fixtures/resume.txt`, "utf8"), savedAt: "" } };
    profile.facts.items.push({ id: "mine", category: "awards", text: "My own award", source: "user" });
    profile.factOrigins.mine = "added";
    const base: Runtime = {
      info: { ok: true, mock: true, model: "mock", maxReviewRounds: 5, maxEditReviewRounds: 3 },
      get: () => emptyProject(),
      set: () => undefined,
      status: () => undefined,
      call: vi.fn(async () => ({ applicantName: "Maya Okafor", items: [{ id: "r1", category: "education", text: "B.S.", source: "resume" }] })) as never,
    };
    const rt = profileRuntime(base, () => profile, (m) => {
      const next = structuredClone(profile);
      m(next);
      profile = next;
    });
    await runFacts(rt);
    expect(base.call).toHaveBeenCalledWith("/api/facts", { kind: "text", text: expect.stringContaining("Maya Okafor") }, "Resume facts");
    expect(profile.facts.applicantName).toBe("Maya Okafor");
    // Details the applicant typed survive a new read.
    expect(profile.facts.items.map((f) => f.id)).toEqual(["r1", "mine"]);
    expect(profile.factOrigins).toEqual({ r1: "resume", mine: "added" });
    expect(profile.version).toBe(1);
  });
});

describe("browser storage", () => {
  beforeAll(async () => {
    // A database from before profiles existed: version 1 with only the statements store.
    const db = await openDB("sop-desk", 1, {
      upgrade(d) {
        d.createObjectStore("projects", { keyPath: "id" });
      },
    });
    const old = projectWithFacts("old", "2026-03-01T00:00:00Z", ["typed", "read"]);
    old.id = "p_old";
    // Older records lack the fields added later.
    const legacy = { ...old } as Partial<Project>;
    delete legacy.profileVersion;
    delete legacy.aiRuleAcknowledged;
    delete legacy.lastError;
    await db.put("projects", legacy);
    db.close();
  });

  it("upgrades a version 1 database without losing statements, and fills in new fields", async () => {
    const list = await listProjects();
    expect(list.map((p) => p.id)).toEqual(["p_old"]);
    expect(list[0]).toMatchObject({ profileVersion: 0, aiRuleAcknowledged: false, lastError: null });
    expect(list[0].inputs.resumeText).toBe("old resume");
    expect(await loadProfile()).toBeNull();
  });

  it("remembers that the one-time move to a profile happened", async () => {
    expect(await isMigrated()).toBe(false);
    await markMigrated();
    expect(await isMigrated()).toBe(true);
  });

  it("stores the profile, and keeps it in memory only when the applicant turns remembering off", async () => {
    const prof = { ...emptyProfile(), version: 2, voiceSample: "v" };
    await saveProfile(prof);
    expect((await loadProfile())?.voiceSample).toBe("v");
    const db = await openDB("sop-desk", 2);
    expect(await db.get("profile", "me")).toMatchObject({ voiceSample: "v" });
    await saveProfile({ ...prof, remember: false, voiceSample: "w" });
    expect(await db.get("profile", "me")).toBeUndefined();
    expect((await loadProfile())?.voiceSample).toBe("w");
    db.close();
  });
});

describe("backup and restore", () => {
  it("round-trips a version 2 backup with fresh statement ids", () => {
    const s = projectWithFacts("x", "2026-01-01T00:00:00Z", ["a"]);
    const prof = profileFromProjects([s]);
    const back = readBackup(JSON.stringify(makeBackup(prof, [s])));
    expect(back.profile?.resume.text).toBe("x resume");
    expect(back.statements).toHaveLength(1);
    expect(back.statements[0].id).not.toBe(s.id);
    expect(back.statements[0].facts).toEqual(s.facts);
  });
  it("accepts an older single-statement export and builds a profile from it", () => {
    const s = projectWithFacts("y", "2026-01-01T00:00:00Z", ["a"]);
    const back = readBackup(JSON.stringify(s));
    expect(back.statements).toHaveLength(1);
    expect(back.profile?.resume.text).toBe("y resume");
  });
  it("refuses files that are not backups", () => {
    expect(() => readBackup("not json")).toThrow("That file isn't a SOP Desk backup.");
    expect(() => readBackup('{"hello":1}')).toThrow("That file isn't a SOP Desk backup.");
  });
});

describe("screens", () => {
  it("searches again when other official pages or the track change, but not for spacing or order", () => {
    const a = researchKey("https://x.edu/p", "https://x.edu/a\nhttps://x.edu/b", "Data Analytics");
    expect(researchKey("https://x.edu/p", " https://x.edu/b  https://x.edu/a ", "data analytics")).toBe(a);
    expect(researchKey("https://x.edu/p", "https://x.edu/a", "Data Analytics")).not.toBe(a);
    expect(researchKey("https://x.edu/p", "https://x.edu/a\nhttps://x.edu/b", "Security")).not.toBe(a);
  });

  it("counts steps: six on a first visit, four later, one fewer when there are no questions", () => {
    const s = emptyProject();
    expect(stepFor("resume", true, null)).toEqual({ n: 1, m: 6 });
    expect(stepFor("program", true, s)).toEqual({ n: 3, m: 6 });
    expect(stepFor("program", false, s)).toEqual({ n: 1, m: 4 });
    expect(stepFor("resume", false, s)).toBeNull();
    s.questions = [];
    expect(stepFor("program", false, s)).toEqual({ n: 1, m: 4 });
    expect(stepFor("instructions", false, s)).toEqual({ n: 2, m: 3 });
    expect(stepFor("result", false, s)).toEqual({ n: 3, m: 3 });
    expect(stepFor("result", true, s)).toEqual({ n: 5, m: 5 });
  });

  it("never marks a program's rule about writing help as met", () => {
    const research = {
      programUrl: "",
      domains: [],
      checkedAt: "",
      gather: {} as never,
      details: [],
      dropped: [],
      country: "US",
      status: "official" as const,
      statusLine: "",
      items: [
        { id: "a", kind: "aiPolicy" as const, text: "Own work", min: 0, max: 0, normalized: "", quote: "q", sourceUrl: "u", level: "program" as const, verified: true, origin: "official" as const },
        { id: "b", kind: "avoid" as const, text: "No resume restating", min: 0, max: 0, normalized: "", quote: "q", sourceUrl: "u", level: "program" as const, verified: true, origin: "official" as const },
      ],
    };
    const rows = checklist(research, { title: "", header: [], sections: [] }, resolveFormat(research), 1, true);
    expect(rows.map((r) => r.item.id)).toEqual(["b"]);
  });
});
