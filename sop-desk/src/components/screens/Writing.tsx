"use client";

import { useEffect } from "react";
import { BUSY_LINE, WRITING_STAGES } from "@/lib/client/labels";
import { ErrorBlock, RunClock, ScreenHead } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";
import { continueWriting } from "./write";

export function WritingScreen() {
  const { statement, run, stop, stopped, error, start, go, onboarding } = useDesk();
  const writing = run?.kind === "write";

  // Nothing running and a finished statement: show it.
  // (A redirect, so it replaces the history entry: the browser's Back must not bounce back here.)
  useEffect(() => {
    if (!run && statement?.doc && !stopped && !(error && error.kind === "write")) go("result", { replace: true });
  }, [run, statement?.doc, stopped, error, go]);

  if (!statement) return null;
  const step = stepFor("writing", onboarding, statement);
  // Continue the run that was stopped; after a reload, continue from the saved draft.
  const resume = () =>
    stopped?.kind === "write" ? stopped.resume() : start("Writing your statement", continueWriting(statement.id), { kind: "write", after: () => go("result", { replace: true }) });

  if (!writing) {
    if (error && error.kind === "write") {
      return (
        <>
          <ScreenHead title="Writing your statement" step={step} onBack={() => go("home")} backLabel="Back to My statements" />
          <ErrorBlock kinds={["write"]} />
        </>
      );
    }
    return (
      <>
        <ScreenHead title="Stopped" step={step}>
          <p className="intro">Everything finished so far is saved.</p>
        </ScreenHead>
        <div className="actions">
          <button type="button" className="btn primary" onClick={resume}>
            Continue
          </button>
          <button type="button" className="btn text" onClick={() => go("home")}>
            Back to My statements
          </button>
        </div>
      </>
    );
  }

  const current = WRITING_STAGES.findIndex((s) => s.key === run.stage.key);
  const reached = Math.max(current, ...run.seen.map((k) => WRITING_STAGES.findIndex((s) => s.key === k)));
  return (
    <>
      <ScreenHead title="Writing your statement" step={step} />
      <ol className="stages">
        {WRITING_STAGES.map((s, i) => {
          const state = i < reached || (i === reached && i !== current) ? "Done" : i === current ? "Working on it" : "Next";
          return (
            <li key={s.key} aria-current={i === current ? "step" : undefined}>
              <span>
                {i + 1}. {s.label}
                {i === current && run.stage.detail && <span className="sub">{run.stage.detail}</span>}
              </span>
              <span className="state">{state}</span>
            </li>
          );
        })}
      </ol>
      {run.busy && <p>{BUSY_LINE}</p>}
      <div className="progress sticky">
        <p className="stage">{current >= 0 ? WRITING_STAGES[current].label : "Getting started"}</p>
        <div className="row between">
          <RunClock />
          <button type="button" className="btn" onClick={stop} aria-describedby="stop-hint">
            Stop
          </button>
        </div>
        <p className="hint" id="stop-hint">
          Finished work is kept.
        </p>
      </div>
      <p className="hint section">This usually takes 3 to 6 minutes. You can keep this tab open and do something else; your work is saved as it goes.</p>
    </>
  );
}
