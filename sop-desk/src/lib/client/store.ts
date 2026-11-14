import { openDB, type IDBPDatabase } from "idb";
import type { FactOrigin, FactSheet, Profile, Project } from "../types";
import { newId } from "../docmodel";

// Browser-only storage. The profile (resume and details, kept once) and the statements
// (one per program) live in IndexedDB; the passcode and UI preferences in localStorage.
// Every call is wrapped: if storage is blocked the app keeps working in memory and
// `storageBlocked()` turns true so the UI can say work won't be saved.

const DB_NAME = "sop-desk";
const DB_VERSION = 2;
const STORE = "projects";
const PROFILE_STORE = "profile";
let dbPromise: Promise<IDBPDatabase> | null = null;
let blocked = false;
let otherTab = false;
let onBlocked: (() => void) | null = null;
/** Statements are kept in memory only (the applicant turned off remembering on a shared computer). */
let memoryOnly = false;
const memory = new Map<string, Project>();
let memoryProfile: Profile | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
        if (!d.objectStoreNames.contains(PROFILE_STORE)) d.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      },
      blocked() {
        // Another tab still has the old version open; the open waits until it closes.
        otherTab = true;
        onBlocked?.();
      },
      blocking() {
        // A newer tab wants to upgrade: let it.
        dbPromise?.then((x) => x.close()).catch(() => undefined);
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

async function attempt<T>(fn: (d: IDBPDatabase) => Promise<T>, fallback: () => T): Promise<T> {
  if (blocked) return fallback();
  try {
    return await fn(await db());
  } catch {
    blocked = true;
    dbPromise = null;
    return fallback();
  }
}

export function storageBlocked(): boolean {
  return blocked;
}

export function openInOtherTab(): boolean {
  return otherTab;
}

/** Be told when the database upgrade is waiting for another tab to close. */
export function whenBlocked(cb: (() => void) | null): void {
  onBlocked = cb;
  if (cb && otherTab) cb();
}

export function setMemoryOnly(on: boolean): void {
  memoryOnly = on;
}

/* ------------------------------------------------------------- statements */

/** Older records lack the fields added with profiles; fill them in. */
function upgradeProject(p: Project): Project {
  return {
    ...p,
    gathered: p.gathered ?? null,
    pending: p.pending ?? null,
    confirmedDomains: p.confirmedDomains ?? [],
    profileVersion: p.profileVersion ?? 0,
    aiRuleAcknowledged: p.aiRuleAcknowledged ?? false,
    lastError: p.lastError ?? null,
  };
}

export async function listProjects(): Promise<Project[]> {
  const stored = await attempt(
    (d) => d.getAll(STORE) as Promise<Project[]>,
    () => [...memory.values()],
  );
  const all = memoryOnly ? [...new Map([...stored, ...memory.values()].map((p) => [p.id, p])).values()] : stored;
  return all.map(upgradeProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveProject(project: Project): Promise<void> {
  memory.set(project.id, project);
  if (memoryOnly) return;
  await attempt(
    async (d) => {
      await d.put(STORE, project);
    },
    () => undefined,
  );
}

export async function deleteProject(id: string): Promise<void> {
  memory.delete(id);
  await attempt(
    async (d) => {
      await d.delete(STORE, id);
    },
    () => undefined,
  );
}

/* ---------------------------------------------------------------- profile */

const MIGRATION_KEY = "migrated-to-profile";

/** The one-time move from per-project resumes to the profile has happened (or is no longer wanted). */
export async function isMigrated(): Promise<boolean> {
  const marker = await attempt(
    (d) => d.get(PROFILE_STORE, MIGRATION_KEY) as Promise<{ id: string } | undefined>,
    () => undefined,
  );
  return !!marker || getPref(MIGRATION_KEY) === "1";
}

export async function markMigrated(): Promise<void> {
  setPref(MIGRATION_KEY, "1");
  await attempt(
    async (d) => {
      await d.put(PROFILE_STORE, { id: MIGRATION_KEY, at: new Date().toISOString() });
    },
    () => undefined,
  );
}

export async function loadProfile(): Promise<Profile | null> {
  if (memoryProfile && !memoryProfile.remember) return memoryProfile;
  const stored = await attempt(
    (d) => d.get(PROFILE_STORE, "me") as Promise<Profile | undefined>,
    () => memoryProfile ?? undefined,
  );
  return stored ? upgradeProfile(stored) : (memoryProfile ?? null);
}

/** Save the profile. With "remember" off it stays in memory and anything stored earlier is removed. */
export async function saveProfile(profile: Profile): Promise<void> {
  memoryProfile = profile;
  await attempt(
    async (d) => {
      if (profile.remember) await d.put(PROFILE_STORE, profile);
      else await d.delete(PROFILE_STORE, "me");
    },
    () => undefined,
  );
}

export async function deleteProfile(): Promise<void> {
  memoryProfile = null;
  await attempt(
    async (d) => {
      await d.delete(PROFILE_STORE, "me");
    },
    () => undefined,
  );
}

function upgradeProfile(p: Profile): Profile {
  return {
    ...emptyProfile(),
    ...p,
    factOrigins: p.factOrigins ?? {},
    trustedSites: p.trustedSites ?? [],
    setupDone: p.setupDone ?? !!p.factsConfirmedAt,
    firstStatementId: p.firstStatementId ?? "",
  };
}

export function emptyProfile(): Profile {
  return {
    id: "me",
    version: 0,
    updatedAt: new Date().toISOString(),
    resume: { kind: "", name: "", data: "", text: "", savedAt: "" },
    facts: { applicantName: "", items: [] },
    factOrigins: {},
    factsConfirmedAt: null,
    voiceSample: "",
    lastEntryTerm: "",
    trustedSites: [],
    remember: true,
    setupDone: false,
    firstStatementId: "",
  };
}

export function hasResume(p: Profile | null): boolean {
  if (!p) return false;
  return p.resume.kind === "pdf" || p.resume.kind === "docx" ? !!p.resume.data : p.resume.text.trim().length > 0;
}

/** Where a detail came from, as shown beside it. */
export function originOf(profile: Profile, factId: string, source: "resume" | "user"): FactOrigin {
  return profile.factOrigins[factId] ?? (source === "user" ? "added" : "resume");
}

/**
 * Migration from the time before profiles: build the profile from the most recently
 * updated statement that has details, and trust every site any statement confirmed.
 */
export function profileFromProjects(projects: Project[]): Profile | null {
  const source = [...projects].filter((p) => p.facts && p.facts.items.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!source) return null;
  const now = new Date().toISOString();
  const facts: FactSheet = JSON.parse(JSON.stringify(source.facts));
  return {
    ...emptyProfile(),
    version: 1,
    updatedAt: now,
    resume: {
      kind: source.inputs.resumeKind,
      name: source.inputs.resumeName || (source.inputs.resumeKind === "text" ? "Pasted resume text" : ""),
      data: source.inputs.resumeData,
      text: source.inputs.resumeText,
      savedAt: source.updatedAt,
    },
    facts,
    factOrigins: Object.fromEntries(facts.items.filter((f) => f.source === "user").map((f) => [f.id, "added" as FactOrigin])),
    factsConfirmedAt: now,
    voiceSample: source.inputs.voiceSample,
    lastEntryTerm: source.inputs.entryTerm,
    trustedSites: [...new Set(projects.flatMap((p) => p.confirmedDomains ?? []))],
    setupDone: true,
  };
}

/** After migration: statements whose details match the profile are marked as using its first version. */
export function stampProfileVersion(project: Project, profile: Profile): Project {
  const same = JSON.stringify(project.facts) === JSON.stringify(profile.facts);
  return { ...project, profileVersion: same ? profile.version : 0 };
}

/** The statement uses details from an older profile and already has a draft. */
export function detailsChangedSince(project: Project, profile: Profile | null): boolean {
  return !!profile && !!project.doc && project.profileVersion < profile.version;
}

/**
 * Copy the profile into a statement that has no draft yet. Statements that already have
 * a draft are never rewritten; they offer "Write a new version with your new details".
 */
export function applyProfile(project: Project, profile: Profile): Project {
  if (project.doc || project.preHumanize) return project;
  const answers = project.facts?.items.filter((f) => f.id.startsWith("ans_")) ?? [];
  return {
    ...project,
    facts: { ...JSON.parse(JSON.stringify(profile.facts)), items: [...JSON.parse(JSON.stringify(profile.facts.items)), ...answers] },
    inputs: { ...project.inputs, voiceSample: profile.voiceSample },
    profileVersion: profile.version,
  };
}

/* ---------------------------------------------------------------- prefs */

export function getPref(key: string): string {
  try {
    return localStorage.getItem(`sopdesk.${key}`) ?? "";
  } catch {
    return "";
  }
}

export function setPref(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(`sopdesk.${key}`, value);
    else localStorage.removeItem(`sopdesk.${key}`);
  } catch {
    /* blocked: the value simply isn't remembered */
  }
}

export async function deleteAllData(): Promise<void> {
  memory.clear();
  memoryProfile = null;
  await attempt(
    async (d) => {
      await d.clear(STORE);
      await d.clear(PROFILE_STORE);
    },
    () => undefined,
  );
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("sopdesk.")) localStorage.removeItem(key);
  } catch {
    /* blocked */
  }
}

/* ------------------------------------------------------------ statements */

export function emptyProject(name = "New statement"): Project {
  const now = new Date().toISOString();
  return {
    id: newId("p"),
    name,
    createdAt: now,
    updatedAt: now,
    inputs: {
      resumeKind: "",
      resumeName: "",
      resumeData: "",
      resumeText: "",
      programUrl: "",
      entryTerm: "",
      concentration: "",
      extraLinks: "",
      voiceSample: "",
      notes: "",
      pastedInstructions: "",
    },
    facts: null,
    gathered: null,
    research: null,
    questions: null,
    preHumanize: null,
    doc: null,
    prevDoc: null,
    rounds: [],
    passed: false,
    reviewer: null,
    versions: [],
    currentVersionId: "",
    chat: [],
    runs: [],
    pending: null,
    confirmedDomains: [],
    profileVersion: 0,
    aiRuleAcknowledged: false,
    lastError: null,
  };
}

/** A new statement reuses everything about the person; only the program changes. */
export function newStatement(profile: Profile): Project {
  const p = emptyProject();
  p.inputs.entryTerm = profile.lastEntryTerm;
  return applyProfile(p, profile);
}

/** "Use this resume for another program" from the time before profiles; kept for older callers. */
export function projectFromResume(source: Project): Project {
  const p = emptyProject();
  p.inputs.resumeKind = source.inputs.resumeKind;
  p.inputs.resumeName = source.inputs.resumeName;
  p.inputs.resumeData = source.inputs.resumeData;
  p.inputs.resumeText = source.inputs.resumeText;
  p.inputs.voiceSample = source.inputs.voiceSample;
  p.facts = source.facts ? JSON.parse(JSON.stringify(source.facts)) : null;
  return p;
}

/* ----------------------------------------------------- backup and restore */

export interface Backup {
  kind: "sopdesk-backup";
  version: 2;
  profile: Profile | null;
  statements: Project[];
}

export function makeBackup(profile: Profile | null, statements: Project[]): Backup {
  return { kind: "sopdesk-backup", version: 2, profile, statements };
}

/**
 * Read a backup file. Accepts version 2 backups and older single-statement exports.
 * Restored statements get fresh ids so they never overwrite anything.
 */
export function readBackup(json: string): { profile: Profile | null; statements: Project[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a SOP Desk backup.");
  }
  const fresh = (p: Partial<Project>): Project => upgradeProject({ ...emptyProject(), ...p, id: newId("p"), updatedAt: new Date().toISOString() } as Project);
  if (parsed && typeof parsed === "object" && (parsed as Backup).kind === "sopdesk-backup") {
    const b = parsed as Backup;
    return { profile: b.profile ? upgradeProfile(b.profile) : null, statements: (b.statements ?? []).map(fresh) };
  }
  if (parsed && typeof parsed === "object" && (parsed as Project).inputs) {
    const statement = fresh(parsed as Project);
    return { profile: profileFromProjects([statement]), statements: [statement] };
  }
  throw new Error("That file isn't a SOP Desk backup.");
}

/** Kept for older callers: import one exported statement. */
export function importProject(json: string): Project {
  const { statements } = readBackup(json);
  if (!statements.length) throw new Error("That file isn't a SOP Desk backup.");
  return statements[0];
}
