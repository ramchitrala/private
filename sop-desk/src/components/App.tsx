"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import type { AppInfo } from "@/lib/api-types";
import { callStage, StageFailure } from "@/lib/client/api";
import { buildFiles, download, type BuiltFiles } from "@/lib/client/files";
import {
  deleteAllData,
  emptyProject,
  getPref,
  importProject,
  listProjects,
  projectFromResume,
  saveProject,
  setPref,
  storageBlocked,
} from "@/lib/client/store";
import { formatFor, type Runtime } from "@/lib/client/pipeline";
import { DeskContext, type Desk, type ErrorState, type RunState, type StepId } from "./desk";
import { Steps } from "./Steps";
import { Preview } from "./Preview";
import { Rail } from "./Rail";

type Tab = "steps" | "checklist" | "review" | "chat";

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return (
    <span className="num muted">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function Gate({ onOpen }: { onOpen: (passcode: string, info: AppInfo) => void }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "x-app-passcode": value } });
      if (res.ok) onOpen(value, (await res.json()) as AppInfo);
      else setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That passcode was not accepted.");
    } catch {
      setMessage("Could not reach the server.");
    }
    setChecking(false);
  };
  return (
    <main className="gate">
      <h1>SOP Desk</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Enter the passcode to continue. It is remembered in this browser.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Passcode</span>
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus autoComplete="current-password" required />
        </label>
        <button className="btn primary" type="submit" disabled={checking || !value}>
          {checking ? "Checking" : "Open"}
        </button>
        <p role="alert" style={{ color: "var(--bad)", marginTop: 12, minHeight: 22 }}>
          {message}
        </p>
      </form>
    </main>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const ref = useRef<Project | null>(null);
  const [step, setStep] = useState<StepId>("intake");
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [theme, setTheme] = useState("light");
  const [built, setBuilt] = useState<BuiltFiles | null>(null);
  const [tab, setTab] = useState<Tab>("steps");
  const [noticeSeen, setNoticeSeen] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const open = useCallback((p: Project) => {
    ref.current = p;
    setProject(p);
    setError(null);
    setBuilt(null);
    setStep(p.doc ? "draft" : p.research ? "requirements" : p.facts ? "facts" : "intake");
  }, []);

  // Load preferences and projects once, in the browser.
  useEffect(() => {
    (async () => {
      const savedTheme = getPref("theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
      setNoticeSeen(getPref("notice") === "1");
      const all = await listProjects();
      setBlocked(storageBlocked());
      setProjects(all);
      const last = all.find((p) => p.id === getPref("project")) ?? all[0] ?? emptyProject();
      open(last);
      const saved = getPref("passcode");
      if (saved) {
        try {
          const res = await fetch("/api/auth", { method: "POST", headers: { "x-app-passcode": saved } });
          if (res.ok) {
            setInfo((await res.json()) as AppInfo);
            setPasscode(saved);
          }
        } catch {
          /* the gate will show */
        }
      }
      setReady(true);
    })();
  }, [open]);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = ref.current;
      if (!p) return;
      await saveProject(p);
      setBlocked(storageBlocked());
      setPref("project", p.id);
      setProjects((list) => [p, ...list.filter((x) => x.id !== p.id)]);
    }, 350);
  }, []);

  const update = useCallback(
    (mutate: (p: Project) => void) => {
      if (!ref.current) return;
      const next = structuredClone(ref.current);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      ref.current = next;
      setProject(next);
      persist();
    },
    [persist],
  );

  const start = useCallback(
    (label: string, fn: (rt: Runtime) => Promise<void>, after?: () => void) => {
      if (abortRef.current || !info) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setRun({ label, status: label, startedAt: Date.now(), busy: false });
      const rt: Runtime = {
        get: () => ref.current!,
        set: update,
        info,
        status: (message) => setRun((r) => (r ? { ...r, status: message, busy: false } : r)),
        call: async <T,>(path: string, body: unknown, stageLabel: string) => {
          const { data, usage } = await callStage<T>(path, body, {
            passcode,
            projectId: ref.current!.id,
            signal: ac.signal,
            onStatus: (message) => setRun((r) => (r ? { ...r, status: message, busy: false } : r)),
            onBusy: () => setRun((r) => (r ? { ...r, busy: true } : r)),
            onProgress: (chars) => chars > 0 && setRun((r) => (r && r.busy ? { ...r, busy: false } : r)),
          });
          update((p) => (p.runs = [...p.runs, { stage: stageLabel, at: new Date().toISOString(), ...usage }].slice(-80)));
          return data;
        },
      };
      (async () => {
        let ok = false;
        try {
          await fn(rt);
          ok = true;
        } catch (err) {
          const f = err instanceof StageFailure ? err : new StageFailure(label, "error", err instanceof Error ? err.message : "Something went wrong.");
          if (f.code === "passcode") {
            setPref("passcode", "");
            setPasscode("");
            setInfo(null);
          } else if (f.code !== "stopped") {
            setError({ stage: label, code: f.code, message: f.message, retry: () => start(label, fn, after) });
          }
        } finally {
          abortRef.current = null;
          setRun(null);
        }
        if (ok) after?.();
      })();
    },
    [info, passcode, update],
  );

  const format = useMemo(() => (project ? formatFor(project) : null), [project?.research]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild both files whenever the document or the layout rules change.
  const doc = project?.doc ?? null;
  useEffect(() => {
    if (!doc || !format) {
      setBuilt(null);
      return;
    }
    let stale = false;
    buildFiles(doc, format)
      .then((b) => !stale && setBuilt(b))
      .catch(() => !stale && setBuilt(null));
    return () => {
      stale = true;
    };
  }, [doc, format]);

  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    setPref("theme", next);
  };

  const addProject = (p: Project) => {
    open(p);
    persist();
  };

  if (!ready || !project) {
    return (
      <main className="gate">
        <p className="muted">Loading</p>
      </main>
    );
  }
  if (!info) {
    return (
      <Gate
        onOpen={(code, i) => {
          setPref("passcode", code);
          setPasscode(code);
          setInfo(i);
        }}
      />
    );
  }

  const desk: Desk = {
    project,
    update,
    start,
    running: !!run,
    info,
    format: format!,
    built,
    error,
    step,
    goto: (s) => {
      setStep(s);
      setTab("steps");
    },
    newFromResume: () => addProject(projectFromResume(project)),
  };

  const exportProject = () => {
    const bytes = new TextEncoder().encode(JSON.stringify(project, null, 1));
    download(bytes, `${project.name.replace(/[^\w -]+/g, " ").trim() || "project"}.sopdesk.json`, "application/json");
  };
  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      addProject(importProject(await file.text()));
    } catch (e) {
      setError({ stage: "Import", code: "import", message: e instanceof Error ? e.message : "That file could not be read.", retry: () => importRef.current?.click() });
    }
  };
  const wipe = async () => {
    if (!window.confirm("Delete every project, the saved passcode and all preferences from this browser? This cannot be undone.")) return;
    await deleteAllData();
    setProjects([]);
    setPasscode("");
    setInfo(null);
    open(emptyProject());
  };

  return (
    <DeskContext.Provider value={desk}>
      <header className="topbar">
        <span className="brand">SOP Desk</span>
        <label className="sr-only" htmlFor="project-select">
          Project
        </label>
        <select
          id="project-select"
          value={project.id}
          disabled={!!run}
          onChange={(e) => {
            const p = projects.find((x) => x.id === e.target.value);
            if (p) open(p);
          }}
        >
          {[project, ...projects.filter((p) => p.id !== project.id)].map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn small" disabled={!!run} onClick={() => addProject(emptyProject())}>
          New project
        </button>
        <span className="spacer" />
        <button className="btn small" onClick={switchTheme}>
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <details className="menu">
          <summary className="btn small">More</summary>
          <div className="menu-list">
            <button className="btn" disabled={!!run || !project.facts} onClick={desk.newFromResume}>
              Use this resume for another program
            </button>
            <button className="btn" onClick={exportProject}>
              Export project
            </button>
            <button className="btn" disabled={!!run} onClick={() => importRef.current?.click()}>
              Import project
            </button>
            <button
              className="btn"
              onClick={() => {
                setPref("passcode", "");
                setPasscode("");
                setInfo(null);
              }}
            >
              Forget passcode
            </button>
            <button className="btn" disabled={!!run} onClick={wipe}>
              Delete all data
            </button>
          </div>
        </details>
        <input ref={importRef} type="file" accept="application/json,.json" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => onImport(e.target.files?.[0])} />
      </header>

      {info.mock && (
        <div className="notice warn">Mock mode: every stage answers from built-in fixtures. Nothing here is a real program requirement.</div>
      )}
      {blocked && <div className="notice warn">This browser is blocking storage, so your work won&apos;t be saved after you close this tab.</div>}
      {!noticeSeen && !blocked && (
        <div className="notice">
          <span>Projects are saved in this browser only. Clearing your browser data deletes them; use Export project to keep a copy.</span>
          <button
            className="btn small"
            onClick={() => {
              setPref("notice", "1");
              setNoticeSeen(true);
            }}
          >
            Got it
          </button>
        </div>
      )}

      <div className="statusbar" role="status" aria-live="polite">
        {run ? (
          <>
            <span className="dot" aria-hidden="true" />
            <span>{run.busy ? "Claude is busy, retrying" : run.status}</span>
            <Elapsed since={run.startedAt} />
            <button className="btn small" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          </>
        ) : error ? (
          <>
            <span style={{ color: "var(--bad)" }}>
              <strong>{error.stage} failed.</strong> {error.message} Finished work is kept.
            </span>
            <button className="btn small" onClick={error.retry}>
              Retry this step
            </button>
            <button className="btn quiet" onClick={() => setError(null)}>
              Dismiss
            </button>
          </>
        ) : (
          <span className="muted">Ready. A full run can take several minutes.</span>
        )}
      </div>

      <div className="layout">
        <div className="mobile-tabs" role="tablist" aria-label="Panels">
          {(["steps", "checklist", "review", "chat"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "steps" ? "Steps" : t === "checklist" ? "Checklist" : t === "review" ? "Review" : "Changes"}
            </button>
          ))}
        </div>
        <nav className="col steps" aria-label="Steps" data-hidden={tab !== "steps"}>
          <Steps />
        </nav>
        <main className="col center" aria-label="Document preview">
          <Preview />
        </main>
        <aside className="col rail" aria-label="Checklist, review and changes" data-hidden={tab === "steps"}>
          <Rail tab={tab} />
        </aside>
      </div>
    </DeskContext.Provider>
  );
}
