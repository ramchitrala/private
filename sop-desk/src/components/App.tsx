"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Profile, Project } from "@/lib/types";
import type { AppInfo } from "@/lib/api-types";
import { callStage, StageFailure } from "@/lib/client/api";
import { buildFiles, type BuiltFiles } from "@/lib/client/files";
import {
  applyProfile,
  deleteProject,
  emptyProfile,
  getPref,
  hasResume,
  listProjects,
  loadProfile,
  newStatement,
  openInOtherTab,
  profileFromProjects,
  saveProfile,
  saveProject,
  setPref,
  stampProfileVersion,
  storageBlocked,
} from "@/lib/client/store";
import { formatFor, type Runtime } from "@/lib/client/pipeline";
import { profileRuntime } from "@/lib/client/profile";
import { stageFor, type Stage } from "@/lib/client/labels";
import { DeskContext, type Desk, type ErrorState, type RunKind, type RunState, type Screen, type StartOptions } from "./ctx";
import { Gate } from "./screens/Gate";
import { Home } from "./screens/Home";
import { ResumeScreen } from "./screens/Resume";
import { DetailsScreen } from "./screens/Details";
import { ProgramScreen } from "./screens/Program";
import { InstructionsScreen } from "./screens/Instructions";
import { QuestionsScreen } from "./screens/Questions";
import { WritingScreen } from "./screens/Writing";
import { ResultScreen } from "./screens/Result";
import { Menu } from "./Menu";

type ThemePref = "system" | "light" | "dark";

function applyTheme(pref: ThemePref) {
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

/** Where to reopen a statement. */
function screenFor(p: Project): Screen {
  if (p.doc) return "result";
  if (p.preHumanize) return "writing";
  if (p.research) return "instructions";
  return "program";
}

const STATEMENT_SCREENS: Screen[] = ["program", "instructions", "questions", "writing", "result"];

export default function App() {
  const [ready, setReady] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [gateMessage, setGateMessage] = useState("");

  const [profile, setProfileState] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const [statements, setStatements] = useState<Project[]>([]);
  const [statement, setStatement] = useState<Project | null>(null);
  const statementRef = useRef<Project | null>(null);

  const [screen, setScreen] = useState<Screen>("home");
  const [onboarding, setOnboarding] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [stopped, setStopped] = useState<RunKind | null>(null);
  const [built, setBuilt] = useState<BuiltFiles | null>(null);
  const [live, setLive] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [theme, setTheme] = useState<ThemePref>("system");

  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<Screen>("home");

  const announce = useCallback((message: string) => {
    // Clear first so the same message is announced again.
    setLive("");
    setTimeout(() => setLive(message), 50);
  }, []);

  /* --------------------------------------------------------- navigation */

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
    try {
      window.history.pushState({ screen: next, id: statementRef.current?.id ?? "" }, "");
    } catch {
      /* history unavailable */
    }
  }, []);

  const openStatementObj = useCallback((p: Project, nav = true) => {
    statementRef.current = p;
    setStatement(p);
    setError(null);
    setStopped(null);
    setBuilt(null);
    setPref("lastStatement", p.id);
    if (nav) go(screenFor(p));
  }, [go]);

  /* ----------------------------------------------------------- loading */

  useEffect(() => {
    (async () => {
      const pref = (getPref("theme") as ThemePref) || "system";
      setTheme(pref);
      applyTheme(pref);
      let all = await listProjects();
      let prof = await loadProfile();
      // Before profiles existed, each statement carried its own resume: build the profile from the latest one.
      if (!prof && all.length) {
        const built = profileFromProjects(all);
        if (built) {
          prof = built;
          await saveProfile(built);
          all = all.map((p) => stampProfileVersion(p, built));
          await Promise.all(all.map(saveProject));
          if (!getPref("migrated")) {
            setMigrated(true);
            setPref("migrated", "1");
          }
        }
      }
      profileRef.current = prof;
      setProfileState(prof);
      setStatements(all);
      setBlocked(storageBlocked());
      setOtherTab(openInOtherTab());
      if (!prof || !hasResume(prof)) {
        setOnboarding(true);
        screenRef.current = "resume";
        setScreen("resume");
      } else if (!prof.factsConfirmedAt) {
        setOnboarding(true);
        screenRef.current = "details";
        setScreen("details");
      } else {
        screenRef.current = "home";
        setScreen("home");
      }
      try {
        window.history.replaceState({ screen: screenRef.current, id: "" }, "");
      } catch {
        /* ignore */
      }
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
  }, []);

  // The browser's Back button follows the same path as the in-app Back.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { screen?: Screen; id?: string } | null;
      if (abortRef.current) {
        // A run is going: stay on this screen.
        window.history.pushState({ screen: screenRef.current, id: statementRef.current?.id ?? "" }, "");
        return;
      }
      const next = state?.screen ?? "home";
      if (STATEMENT_SCREENS.includes(next) && !statementRef.current) {
        screenRef.current = "home";
        setScreen("home");
        return;
      }
      screenRef.current = next;
      setScreen(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /* ------------------------------------------------------------ saving */

  const persistStatement = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const p = statementRef.current;
      if (!p) return;
      await saveProject(p);
      setBlocked(storageBlocked());
      setStatements((list) => [p, ...list.filter((x) => x.id !== p.id)]);
    }, 250);
  }, []);

  const update = useCallback(
    (mutate: (p: Project) => void) => {
      if (!statementRef.current) return;
      const next = structuredClone(statementRef.current);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      statementRef.current = next;
      setStatement(next);
      persistStatement();
    },
    [persistStatement],
  );

  /** Save the profile, and copy it into every statement that has no draft yet. Saving waits for typing to pause. */
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitProfile = useCallback(async (next: Profile | null) => {
    profileRef.current = next;
    setProfileState(next);
    if (profileTimer.current) clearTimeout(profileTimer.current);
    if (!next) return;
    profileTimer.current = setTimeout(async () => {
      const latest = profileRef.current;
      if (!latest) return;
      await saveProfile(latest);
      setBlocked(storageBlocked());
      const list = await listProjects();
      const changed: Project[] = [];
      for (const p of list) {
        const live = statementRef.current?.id === p.id ? statementRef.current : p;
        if (live.doc || live.preHumanize || live.profileVersion >= latest.version) continue;
        const q = applyProfile(live, latest);
        changed.push(q);
        await saveProject(q);
      }
      if (changed.length) {
        setStatements((all) => all.map((p) => changed.find((c) => c.id === p.id) ?? p));
        const open = statementRef.current;
        const fresh = open && changed.find((c) => c.id === open.id);
        if (fresh) {
          statementRef.current = fresh;
          setStatement(fresh);
        }
      }
    }, 300);
  }, []);

  const updateProfile = useCallback(
    (mutate: (p: Profile) => void) => {
      const next = structuredClone(profileRef.current ?? emptyProfile());
      mutate(next);
      next.updatedAt = new Date().toISOString();
      void commitProfile(next);
    },
    [commitProfile],
  );

  /* -------------------------------------------------------------- runs */

  const start = useCallback(
    (label: string, fn: (rt: Runtime) => Promise<void>, opts: StartOptions) => {
      if (abortRef.current || !info) return;
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setStopped(null);
      const first: Stage = { key: "working", label: "Working on it", detail: "" };
      setRun({ kind: opts.kind, stage: first, seen: [], startedAt: Date.now(), busy: false });

      const onStatus = (message: string) => {
        const s = stageFor(message);
        if (!s) return;
        setRun((r) => {
          if (!r) return r;
          const detail = s.detail || (s.key === r.stage.key ? r.stage.detail : "");
          if (s.key !== r.stage.key) announce(s.label);
          return { ...r, busy: false, stage: { ...s, detail }, seen: r.seen.includes(s.key) ? r.seen : [...r.seen, s.key] };
        });
      };

      const base: Runtime = {
        get: () => statementRef.current!,
        set: update,
        info,
        status: onStatus,
        call: async <T,>(path: string, body: unknown, stageLabel: string) => {
          const { data, usage } = await callStage<T>(path, body, {
            passcode,
            projectId: statementRef.current?.id ?? "profile",
            signal: ac.signal,
            onStatus,
            onBusy: () => setRun((r) => (r ? { ...r, busy: true } : r)),
            onProgress: (chars) => chars > 0 && setRun((r) => (r && r.busy ? { ...r, busy: false } : r)),
          });
          if (opts.target !== "profile" && statementRef.current) {
            update((p) => (p.runs = [...p.runs, { stage: stageLabel, at: new Date().toISOString(), ...usage }].slice(-80)));
          }
          return data;
        },
      };
      const rt =
        opts.target === "profile"
          ? profileRuntime(base, () => profileRef.current ?? emptyProfile(), updateProfile)
          : base;

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
            setGateMessage("Your passcode was not accepted. Enter it again.");
          } else if (f.code === "stopped" || ac.signal.aborted) {
            setStopped(opts.kind);
            announce("Stopped. Everything finished so far is saved.");
          } else {
            setError({ kind: opts.kind, stage: label, code: f.code, message: f.message, retry: () => start(label, fn, opts) });
            if (opts.target !== "profile" && statementRef.current) update((p) => (p.lastError = { stage: label, code: f.code }));
            opts.onError?.(f.code);
          }
        } finally {
          abortRef.current = null;
          setRun(null);
        }
        if (ok) {
          if (opts.target !== "profile" && statementRef.current?.lastError) update((p) => (p.lastError = null));
          opts.after?.();
        }
      })();
    },
    [info, passcode, update, updateProfile, announce],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // When a run ends and its progress panel goes away, focus must not be lost: return it to the screen's heading.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !run) {
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body) document.querySelector<HTMLElement>("main h1")?.focus();
      }, 0);
    }
    wasRunning.current = !!run;
  }, [run]);

  /* ------------------------------------------------------------- files */

  const format = useMemo(() => (statement ? formatFor(statement) : null), [statement?.research]); // eslint-disable-line react-hooks/exhaustive-deps
  const doc = statement?.doc ?? null;
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

  /* ------------------------------------------------------------ render */

  if (!ready) {
    return (
      <main className="page" id="main">
        <p className="muted">Loading</p>
      </main>
    );
  }
  if (!info) {
    return (
      <Gate
        message={gateMessage}
        onOpen={(code, i) => {
          setPref("passcode", code);
          setPasscode(code);
          setInfo(i);
          setGateMessage("");
        }}
      />
    );
  }

  const desk: Desk = {
    info,
    profile,
    updateProfile,
    setProfile: (p) => void commitProfile(p),
    statements,
    statement,
    getStatement: () => statementRef.current,
    update,
    openStatement: (id) => {
      const p = statements.find((x) => x.id === id);
      if (p) openStatementObj(p);
    },
    startStatement: () => {
      const prof = profileRef.current;
      if (!prof) return;
      const p = newStatement(prof);
      p.confirmedDomains = [...prof.trustedSites];
      void saveProject(p);
      setStatements((list) => [p, ...list]);
      statementRef.current = p;
      setStatement(p);
      setError(null);
      setStopped(null);
      setBuilt(null);
      go("program");
    },
    removeStatement: async (id) => {
      await deleteProject(id);
      setStatements((list) => list.filter((x) => x.id !== id));
      if (statementRef.current?.id === id) {
        statementRef.current = null;
        setStatement(null);
      }
    },
    screen,
    go,
    onboarding,
    setOnboarding,
    run,
    error,
    clearError: () => setError(null),
    start,
    stop,
    stopped,
    clearStopped: () => setStopped(null),
    format,
    built,
    announce,
  };

  const needsStatement = STATEMENT_SCREENS.includes(screen) && !statement;
  const current: Screen = needsStatement ? "home" : screen;

  return (
    <DeskContext.Provider value={desk}>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header className="header">
        <div className="header-inner">
        <button type="button" className="brand" onClick={() => !run && go(profile?.factsConfirmedAt ? "home" : screen)} aria-label="SOP Desk, go to My statements">
          SOP Desk
        </button>
        {profile?.factsConfirmedAt ? (
          <Menu
            theme={theme}
            onTheme={(t) => {
              setTheme(t);
              applyTheme(t);
              setPref("theme", t === "system" ? "" : t);
            }}
            onSignOut={() => {
              setPref("passcode", "");
              setPasscode("");
              setInfo(null);
            }}
            onReset={() => {
              profileRef.current = null;
              statementRef.current = null;
              setProfileState(null);
              setStatement(null);
              setStatements([]);
              setPasscode("");
              setInfo(null);
              setOnboarding(true);
              screenRef.current = "resume";
              setScreen("resume");
            }}
            onRestored={(prof, list) => {
              if (prof) {
                profileRef.current = prof;
                setProfileState(prof);
              }
              setStatements((all) => [...list, ...all]);
            }}
          />
        ) : null}
        </div>
      </header>
      {info.mock && <div className="banner warn">Test mode: answers are samples, not real university instructions.</div>}
      {blocked && <div className="banner warn">This browser is blocking storage, so your work won&apos;t be saved after you close this tab.</div>}
      {!blocked && profile && !profile.remember && <div className="banner warn">Not saved on this computer. Closing this tab clears it.</div>}
      {otherTab && <div className="banner warn">SOP Desk is open in another tab. Close it, then reload this page.</div>}

      <main id="main" className={`page${current === "result" ? " wide" : ""}`}>
        {current === "home" && <Home migrated={migrated} onMigratedSeen={() => setMigrated(false)} />}
        {current === "resume" && <ResumeScreen />}
        {current === "details" && <DetailsScreen mode="onboarding" />}
        {current === "profile" && <DetailsScreen mode="profile" />}
        {current === "program" && <ProgramScreen />}
        {current === "instructions" && <InstructionsScreen />}
        {current === "questions" && <QuestionsScreen />}
        {current === "writing" && <WritingScreen />}
        {current === "result" && <ResultScreen />}
      </main>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </div>
    </DeskContext.Provider>
  );
}
