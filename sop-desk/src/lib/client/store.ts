import { openDB, type IDBPDatabase } from "idb";
import type { Project } from "../types";
import { newId } from "../docmodel";

// Browser-only storage. Projects live in IndexedDB; the passcode and UI preferences in
// localStorage. Every call is wrapped: if storage is blocked the app keeps working in
// memory and `storageBlocked()` turns true so the UI can say work won't be saved.

const DB_NAME = "sop-desk";
const STORE = "projects";
let dbPromise: Promise<IDBPDatabase> | null = null;
let blocked = false;
const memory = new Map<string, Project>();

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
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

export async function listProjects(): Promise<Project[]> {
  const all = await attempt(
    (d) => d.getAll(STORE) as Promise<Project[]>,
    () => [...memory.values()],
  );
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveProject(project: Project): Promise<void> {
  memory.set(project.id, project);
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

export async function deleteAllData(): Promise<void> {
  memory.clear();
  await attempt(
    async (d) => {
      await d.clear(STORE);
    },
    () => undefined,
  );
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
}

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

export function emptyProject(name = "New program"): Project {
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
  };
}

/** "Use this resume for another program": a new project with the same resume and facts. */
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

/** Accept an exported project file, giving it a fresh id so it never overwrites another. */
export function importProject(json: string): Project {
  const parsed = JSON.parse(json) as Partial<Project>;
  if (!parsed || typeof parsed !== "object" || !parsed.inputs) throw new Error("That file is not a SOP Desk project.");
  return { ...emptyProject(), ...parsed, id: newId("p"), updatedAt: new Date().toISOString() } as Project;
}
