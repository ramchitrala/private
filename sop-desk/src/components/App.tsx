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
  isMigrated,
  listProjects,
  loadProfile,
  markMigrated,
  newStatement,
  profileFromProjects,
  saveProfile,
  saveProject,
  setMemoryOnly,
  setPref,
  stampProfileVersion,
  storageBlocked,
  whenBlocked,
} from "@/lib/client/store";
import { formatFor, type Runtime } from "@/lib/client/pipeline";
import { endStep, newProgress, startStep, stepForPath, writing, type Progress } from "@/lib/client/progress";
import { BUSY_LINE, stageFor, type Stage } from "@/lib/client/labels";
import { DeskContext, type Desk, type ErrorState, type FeedItem, type RunState, type Screen, type StartOptions, type StoppedState } from "./ctx";
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

/** A history entry may point at a screen whose content no longer exists: fall back to where the statement is. */
function validScreen(screen: Screen, p: Project): Screen {
  if (screen === "result" && !p.doc) return screenFor(p);
  if (screen === "writing" && !p.preHumanize && !p.doc) return screenFor(p);
  if (screen === "questions" && !p.questions?.length) return screenFor(p);
  return screen;
}

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
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [stopped, setStopped] = useState<StoppedState | null>(null);
  const [built, setBuilt] = useState<BuiltFiles | null>(null);
  const [buildFailed, setBuildFailed] = useState(false);
  const [buildTry, setBuildTry] = useState(0);
  const [resumeUndo, setResumeUndo] = useState<Profile | null>(null);
  const [live, setLive] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [theme, setTheme] = useState<ThemePref>("system");

  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<Screen>("home");
  const returnTo = useRef<Screen>("home");

  const announce = useCallback((message: string) => {
    // Clear first so the same message is announced again.
    setLive("");
    setTimeout(() => setLive(message), 50);
  }, []);

  /* --------------------------------------------------------- navigation */

  const go = useCallback((next: Screen, opts: { replace?: boolean } = {}) => {
    if (next === "profile" && screenRef.current !== "profile") returnTo.current = screenRef.current;
    screenRef.current = next;
    setScreen(next);
    try {
      const state = { screen: next, id: statementRef.current?.id ?? "" };
      // A redirect replaces the entry, so the browser's Back never bounces between two screens.
      if (opts.replace) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
    } catch {
      /* history unavailable */
    }
  }, []);

  /** Write a pending statement save at once (before switching statements or leaving the page). */
  const flushStatement = useCallback(() => {
    if (!saveTimer.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const p = statementRef.current;
    if (p) void saveProject(p);
  }, []);

  const openStatementObj = useCallback(
    (p: Project, nav = true) => {
      flushStatement();
      statementRef.current = p;
      setStatement(p);
      setError(null);
      setStopped(null);
      setBuilt(null);
      setBuildFailed(false);
      setPref("lastStatement", p.id);
      if (nav) go(screenFor(p));
    },
    [go, flushStatement],
  );

  /* ----------------------------------------------------------- loading */

  useEffect(() => {
    // If another tab still has the old database open, say so instead of loading forever.
    whenBlocked(() => setOtherTab(true));
    (async () => {
      const pref = (getPref("theme") as ThemePref) || "system";
      setTheme(pref);
      applyTheme(pref);
      let all = await listProjects();
      let prof = await loadProfile();
      setOtherTab(false);
      whenBlocked(null);
      // Once only: before profiles existed, each statement carried its own resume, so build the profile
      // from the latest one. After that, a missing profile means the applicant deleted it or chose not to keep it.
      if (!(await isMigrated())) {
        if (!prof && all.length) {
          const fromOld = profileFromProjects(all);
          if (fromOld) {
            prof = fromOld;
            await saveProfile(fromOld);
            all = all.map((p) => stampProfileVersion(p, fromOld));
            await Promise.all(all.map(saveProject));
            setMigrated(true);
          }
        }
        await markMigrated();
      }
      profileRef.current = prof;
      setProfileState(prof);
      setMemoryOnly(!!prof && !prof.remember);
      setStatements(all);
      setBlocked(storageBlocked());
      // A resume without any details (a read that never finished) starts over at the resume.
      const first: Screen = !prof || !hasResume(prof) || !prof.facts.items.length ? "resume" : !prof.factsConfirmedAt ? "details" : "home";
      screenRef.current = first;
      setScreen(first);
      try {
        window.history.replaceState({ screen: first, id: "" }, "");
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
    // Leaving the page writes any save that is still waiting.
    const onHide = () => flushStatement();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flushStatement]);

  // The browser's Back button follows the same path as the in-app Back.
  const statementsRef = useRef<Project[]>([]);
  statementsRef.current = statements;
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { screen?: Screen; id?: string } | null;
      if (abortRef.current) {
        // A run is going: stay on this screen.
        window.history.pushState({ screen: screenRef.current, id: statementRef.current?.id ?? "" }, "");
        return;
      }
      let next = state?.screen ?? "home";
      if (STATEMENT_SCREENS.includes(next)) {
        // The entry may belong to another statement: open that one, at a screen that still makes sense.
        let p = statementRef.current;
        if (state?.id && state.id !== p?.id) {
          const other = statementsRef.current.find((x) => x.id === state.id) ?? null;
          if (other) {
            openStatementObj(other, false);
            p = other;
          } else p = null;
        }
        next = p ? validScreen(next, p) : "home";
      }
      screenRef.current = next;
      setScreen(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openStatementObj]);

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
    setMemoryOnly(!!next && !next.remember);
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
      // Any later edit ends the chance to undo a resume replacement, so Undo never erases newer work.
      setResumeUndo(null);
      void commitProfile(next);
    },
    [commitProfile],
  );

  /* -------------------------------------------------------------- runs */

  /** Keeps the screen awake while a run goes on, where the browser allows it. */
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const holdScreen = useCallback(async (on: boolean) => {
    try {
      if (on && !wakeLock.current && document.visibilityState === "visible") {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
      } else if (!on && wakeLock.current) {
        await wakeLock.current.release();
        wakeLock.current = null;
      }
    } catch {
      wakeLock.current = null;
    }
  }, []);

  /** Whether the page was hidden (another app, another tab) since the current run started. */
  const hiddenDuringRun = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenDuringRun.current = true;
      else {
        // The wake lock ends when the page is hidden; take it again on return.
        wakeLock.current = null;
        if (abortRef.current) void holdScreen(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [holdScreen]);

  const feedId = useRef(0);

  const start = useCallback(
    function start(
      label: string,
      fn: (rt: Runtime) => Promise<void>,
      opts: StartOptions,
      carry?: { feed: FeedItem[]; progress: Progress; attempts: number; startedAt: number },
    ) {
      if (abortRef.current || !info) return;
      const ac = new AbortController();
      abortRef.current = ac;
      hiddenDuringRun.current = document.visibilityState === "hidden";
      void holdScreen(true);
      setError(null);
      setStopped(null);
      const first: Stage = { key: "working", label: "Working on it", detail: "" };
      const wordTarget = statementRef.current ? formatFor(statementRef.current).wordMax || 1100 : 1100;
      setRun((prev) => ({
        kind: opts.kind,
        stage: carry && prev ? prev.stage : first,
        seen: carry && prev ? prev.seen : [],
        startedAt: carry?.startedAt ?? Date.now(),
        busy: false,
        paused: false,
        feed: carry ? carry.feed : [],
        progress: carry ? carry.progress : newProgress(opts.plan ?? opts.kind, opts.kind === "change" ? info.maxEditReviewRounds : info.maxReviewRounds, wordTarget),
      }));

      const note = (text: string, kind: FeedItem["kind"] = "note") =>
        setRun((r) => (r ? { ...r, feed: [...r.feed, { id: ++feedId.current, kind, text }].slice(-80) } : r));

      const onStatus = (message: string) => {
        let s = stageFor(message);
        if (!s) return;
        // While writing, a passage fixed during the checks is part of checking, not a separate change.
        if (opts.kind === "write" && (s.key === "change" || s.key === "smooth")) s = { key: "check", label: "Checking it against the instructions", detail: "" };
        setRun((r) => {
          if (!r) return r;
          const detail = s.detail || (s.key === r.stage.key ? r.stage.detail : "");
          if (s.key !== r.stage.key) announce(s.label);
          const progress = s.key === "files" ? startStep(r.progress, "files") : r.progress;
          return { ...r, busy: false, progress, stage: { ...s, detail }, seen: r.seen.includes(s.key) ? r.seen : [...r.seen, s.key] };
        });
      };

      const base: Runtime = {
        get: () => statementRef.current!,
        set: update,
        info,
        status: onStatus,
        call: async <T,>(path: string, body: unknown, stageLabel: string) => {
          const key = stepForPath(path);
          if (key) setRun((r) => (r ? { ...r, progress: startStep(r.progress, key) } : r));
          const { data, usage } = await callStage<T>(path, body, {
            passcode,
            projectId: statementRef.current?.id ?? "profile",
            signal: ac.signal,
            onStatus,
            onBusy: () =>
              setRun((r) => {
                if (r && !r.busy) announce(BUSY_LINE);
                return r ? { ...r, busy: true } : r;
              }),
            onProgress: (chars) =>
              chars > 0 && setRun((r) => (r ? { ...r, busy: false, progress: writing(r.progress, chars) } : r)),
            onThought: (text, isStart) =>
              setRun((r) => {
                if (!r) return r;
                const feed = [...r.feed];
                const last = feed[feed.length - 1];
                if (isStart || !last || last.kind !== "thought") {
                  if (isStart && !text) {
                    feed.push({ id: ++feedId.current, kind: "thought", text: "" });
                    return { ...r, busy: false, feed: feed.slice(-80) };
                  }
                  feed.push({ id: ++feedId.current, kind: "thought", text });
                } else feed[feed.length - 1] = { ...last, text: last.text + text };
                return { ...r, busy: false, feed: feed.slice(-80) };
              }),
            onActivity: (text) => note(text, "activity"),
          });
          if (opts.target !== "profile" && statementRef.current) {
            update((p) => (p.runs = [...p.runs, { stage: stageLabel, at: new Date().toISOString(), ...usage }].slice(-80)));
          }
          const askedForChanges = key === "review" && (data as { review?: { verdict?: string } })?.review?.verdict === "CORRECTIONS";
          setRun((r) => (r ? { ...r, progress: endStep(r.progress, { reviewAskedForChanges: askedForChanges }) } : r));
          return data;
        },
      };
      const rt = opts.wrap ? opts.wrap(base) : base;

      (async () => {
        let ok = false;
        let paused = false;
        try {
          await fn(rt);
          ok = true;
        } catch (err) {
          const f = err instanceof StageFailure ? err : new StageFailure(label, "error", err instanceof Error ? err.message : "Something went wrong.");
          const dropped = ["network", "stream", "timeout", "http"].includes(f.code) && !ac.signal.aborted;
          const away = hiddenDuringRun.current || document.visibilityState === "hidden";
          const attempts = carry?.attempts ?? 0;
          if (f.code === "passcode") {
            setPref("passcode", "");
            setPasscode("");
            setInfo(null);
            setGateMessage("Your passcode was not accepted. Enter it again.");
          } else if (f.code === "stopped" || ac.signal.aborted) {
            setStopped({ kind: opts.kind, resume: () => start(label, fn, opts) });
            announce("Stopped. Everything finished so far is saved.");
          } else if (dropped && (away ? attempts < 8 : f.code !== "timeout" && attempts < 2)) {
            // The connection dropped, almost always because the phone or browser paused this page while
            // another app was open. Nothing finished is lost: wait until the page is back, then carry on.
            paused = true;
            const waitAc = new AbortController();
            abortRef.current = waitAc;
            let carried: { feed: FeedItem[]; progress: Progress; startedAt: number } | null = null;
            setRun((r) => {
              if (!r) return r;
              const text = away
                ? "The connection paused while you were away. Picking up where it left off when you're back."
                : "The connection dropped. Trying again.";
              const feed = [...r.feed, { id: ++feedId.current, kind: "note" as const, text }].slice(-80);
              carried = { feed, progress: r.progress, startedAt: r.startedAt };
              return { ...r, paused: true, feed };
            });
            const resume = () => {
              if (waitAc.signal.aborted) return;
              document.removeEventListener("visibilitychange", onBack);
              abortRef.current = null;
              const c = carried ?? { feed: [], progress: newProgress(opts.kind, info.maxReviewRounds), startedAt: Date.now() };
              c.feed = [...c.feed, { id: ++feedId.current, kind: "note", text: "Back again. Carrying on from the last finished step." }];
              start(label, fn, opts, { ...c, attempts: attempts + 1 });
            };
            const onBack = () => {
              if (document.visibilityState === "visible") setTimeout(resume, 600);
            };
            waitAc.signal.addEventListener("abort", () => {
              document.removeEventListener("visibilitychange", onBack);
              abortRef.current = null;
              setRun(null);
              void holdScreen(false);
              setStopped({ kind: opts.kind, resume: () => start(label, fn, opts) });
              announce("Stopped. Everything finished so far is saved.");
            });
            if (document.visibilityState === "visible") setTimeout(resume, away ? 600 : 2500);
            else document.addEventListener("visibilitychange", onBack);
          } else {
            setError({ kind: opts.kind, stage: label, failStage: f.stage, code: f.code, message: f.message, retry: () => start(label, fn, opts) });
            if (opts.target !== "profile" && statementRef.current) update((p) => (p.lastError = { stage: f.stage || label, code: f.code }));
            opts.onError?.(f.code, f.stage);
          }
        } finally {
          if (!paused) {
            if (abortRef.current === ac) abortRef.current = null;
            setRun(null);
            void holdScreen(false);
          }
        }
        if (ok) {
          if (opts.target !== "profile" && statementRef.current?.lastError) update((p) => (p.lastError = null));
          opts.after?.();
        }
      })();
    },
    [info, passcode, update, announce, holdScreen],
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
    setBuildFailed(false);
    buildFiles(doc, format)
      .then((b) => !stale && setBuilt(b))
      .catch(() => {
        if (stale) return;
        setBuilt(null);
        setBuildFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [doc, format, buildTry]);

  // Reaching My statements ends the first-visit setup: later statements have four steps.
  useEffect(() => {
    if (screen === "home" && profile?.factsConfirmedAt && !profile.setupDone) {
      const next = { ...profile, setupDone: true };
      void commitProfile(next);
    }
  }, [screen, profile, commitProfile]);

  /* ------------------------------------------------------------ render */

  if (!ready) {
    return (
      <main className="page" id="main">
        {otherTab ? (
          <>
            <h1>SOP Desk is open in another tab</h1>
            <p className="intro">Close the other tab, then reload this page. Your work is safe.</p>
          </>
        ) : (
          <p className="muted">Loading</p>
        )}
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

  const createStatement = (prof: Profile): Project => {
    flushStatement();
    const p = newStatement(prof);
    p.confirmedDomains = [...prof.trustedSites];
    void saveProject(p);
    setStatements((list) => [p, ...list]);
    statementRef.current = p;
    setStatement(p);
    setError(null);
    setStopped(null);
    setBuilt(null);
    setBuildFailed(false);
    return p;
  };

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
      if (!prof.setupDone) {
        // The end of the first-visit setup opens the first statement; going back and pressing
        // "Looks right" again reopens it instead of making another one.
        const first = prof.firstStatementId ? statementsRef.current.find((x) => x.id === prof.firstStatementId) : undefined;
        if (first && !first.doc) {
          openStatementObj(first, false);
          go("program");
          return;
        }
        if (prof.firstStatementId) {
          // A second statement: the setup is over.
          void commitProfile({ ...prof, setupDone: true });
        } else {
          const p = createStatement(prof);
          void commitProfile({ ...prof, firstStatementId: p.id });
          go("program");
          return;
        }
      }
      createStatement(profileRef.current ?? prof);
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
    back: () => go(returnTo.current && returnTo.current !== "profile" ? returnTo.current : "home"),
    onboarding: !profile?.setupDone,
    resumeUndo,
    setResumeUndo,
    run,
    error,
    clearError: () => setError(null),
    start,
    stop,
    stopped,
    clearStopped: () => setStopped(null),
    format,
    built,
    buildFailed,
    rebuild: () => setBuildTry((n) => n + 1),
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
          <button
            type="button"
            className="brand"
            onClick={() => !run && profile?.factsConfirmedAt && go("home")}
            aria-label={profile?.factsConfirmedAt ? "SOP Desk, go to My statements" : "SOP Desk"}
          >
            SOP Desk
          </button>
          <Menu
            theme={theme}
            setUp={!!profile?.factsConfirmedAt}
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
              setResumeUndo(null);
              setPasscode("");
              setInfo(null);
              screenRef.current = "resume";
              setScreen("resume");
            }}
            onRestored={async (restoredProfile, list) => {
              // Restored details get a version above anything on this computer, so every comparison stays meaningful.
              const local = profileRef.current;
              let prof = local;
              if (restoredProfile) {
                prof = {
                  ...restoredProfile,
                  version: Math.max(local?.version ?? 0, restoredProfile.version) + 1,
                  factsConfirmedAt: restoredProfile.factsConfirmedAt ?? new Date().toISOString(),
                  setupDone: true,
                  remember: true,
                };
                await commitProfile(prof);
              }
              const stamped = list.map((st) => ({
                ...st,
                profileVersion: prof && JSON.stringify(st.facts) === JSON.stringify(prof.facts) ? prof.version : 0,
              }));
              await Promise.all(stamped.map(saveProject));
              setStatements((all) => [...stamped, ...all]);
              if (prof?.factsConfirmedAt) go("home");
            }}
          />
        </div>
      </header>
      {info.mock && <div className="banner warn">Test mode: answers are samples, not real university instructions.</div>}
      {blocked && <div className="banner warn">This browser is blocking storage, so your work won&apos;t be saved after you close this tab.</div>}
      {!blocked && profile && !profile.remember && <div className="banner warn">Not saved on this computer. Closing this tab clears it.</div>}

      <main id="main" className="page">
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
