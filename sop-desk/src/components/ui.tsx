"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { BUSY_LINE, errorFor } from "@/lib/client/labels";
import { useDesk, type FeedItem, type RunKind } from "./ctx";

/** Step line, Back, and the screen's h1, which takes focus and names the tab. */
export function ScreenHead({
  title,
  step,
  onBack,
  backLabel = "Back",
  children,
}: {
  title: string;
  step?: { n: number; m: number } | null;
  onBack?: (() => void) | null;
  backLabel?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const stepText = step ? `Step ${step.n} of ${step.m}` : "";
  useEffect(() => {
    document.title = [title, stepText, "SOP Desk"].filter(Boolean).join(" · ");
  }, [title, stepText]);
  useEffect(() => {
    // Move focus to the heading whenever a new screen (or a new state of one) appears,
    // so keyboard and screen-reader users start at the top.
    ref.current?.focus({ preventScroll: false });
    window.scrollTo({ top: 0 });
  }, [title]);
  return (
    <div className="screen-head">
      {(stepText || onBack) && (
        <div className="stepline">
          {onBack && (
            <button type="button" className="btn text" onClick={onBack}>
              {backLabel}
            </button>
          )}
          {stepText && <span>{stepText}</span>}
        </div>
      )}
      <h1 tabIndex={-1} ref={ref}>
        {title}
      </h1>
      {children}
    </div>
  );
}

/** The panel that replaces a pressed button while its run goes on: progress, the live feed and Stop. */
export function ProgressPanel({ kinds }: { kinds: RunKind[] }) {
  const { run } = useDesk();
  const ref = useRef<HTMLParagraphElement>(null);
  const active = !!run && kinds.includes(run.kind);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  if (!run || !active) return null;
  return (
    <div className="progress">
      <p className="sr-only" tabIndex={-1} ref={ref}>
        {run.stage.label}
      </p>
      <RunView />
    </div>
  );
}

/** The share of the work really done, as a bar and a number. */
export function ProgressBar({ value, label = "Progress" }: { value: number; label?: string }) {
  return (
    <div className="bar-wrap">
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${value}% done`}>
        <div className="bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="num bar-num" aria-hidden="true">
        {value}%
      </span>
    </div>
  );
}

/** Split "**Title**\n\nBody" into its parts. */
function thoughtParts(text: string): { title: string; body: string } {
  const m = text.match(/^\s*\*\*(.+?)\*\*\s*([\s\S]*)$/);
  if (m) return { title: m[1].trim(), body: m[2].replace(/\*\*/g, "").trim() };
  return { title: "", body: text.replace(/\*\*/g, "").trim() };
}

/**
 * What SOP Desk is thinking and doing, live: Claude's own summary of its reasoning, the searches
 * it runs and the pages it opens. It follows the newest line unless you scroll up to read.
 */
export function Feed({ items }: { items: FeedItem[] }) {
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const visible = items.filter((i) => i.text.trim());
  const last = visible[visible.length - 1];
  useEffect(() => {
    const el = box.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [visible.length, last?.text]);
  return (
    <div
      className="feed"
      ref={box}
      tabIndex={0}
      role="region"
      aria-label="What SOP Desk is doing"
      onScroll={(e) => {
        const el = e.currentTarget;
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {visible.length === 0 ? (
        <p className="feed-empty">Getting started…</p>
      ) : (
        <ol>
          {visible.map((item) => {
            if (item.kind !== "thought") {
              return (
                <li key={item.id} className={`feed-${item.kind}`}>
                  {item.text}
                </li>
              );
            }
            const { title, body } = thoughtParts(item.text);
            return (
              <li key={item.id} className="feed-thought">
                {title && <strong>{title}</strong>}
                {body && <span>{body}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Progress, the live feed and Stop, for the run that is going on. */
export function RunView({ showStage = true }: { showStage?: boolean }) {
  const { run, stop } = useDesk();
  if (!run) return null;
  const value = Math.round(run.progress.shown * 100);
  return (
    <>
      {showStage && (
        <p className="stage">
          {run.paused ? "Paused while you were away" : run.busy ? BUSY_LINE : run.stage.label}
          {!run.paused && !run.busy && run.stage.detail && <span className="sub">{run.stage.detail}</span>}
        </p>
      )}
      <ProgressBar value={value} />
      {run.paused && <p className="hint">You left the page, so the connection paused. It carries on by itself when you come back; nothing finished is lost.</p>}
      <Feed items={run.feed} />
      <div className="row between run-foot">
        <p className="hint">You can switch to another app. It picks up where it left off.</p>
        <button type="button" className="btn" onClick={stop}>
          Stop
        </button>
      </div>
    </>
  );
}

/** One error block, in place, focused on arrival, with one way forward. */
export function ErrorBlock({
  kinds,
  children,
  retryLabel = "Retry this step",
  headless = false,
}: {
  kinds: RunKind[];
  children?: ReactNode;
  retryLabel?: string;
  /** The screen's own heading already says what went wrong: show only the way forward. */
  headless?: boolean;
}) {
  const { error, run } = useDesk();
  const ref = useRef<HTMLHeadingElement>(null);
  const show = !!error && !run && kinds.includes(error.kind);
  useEffect(() => {
    if (show && !headless) ref.current?.focus();
  }, [show, error, headless]);
  if (!show || !error) return null;
  const plain = errorFor(error.code, error.stage);
  return (
    <div className={headless ? "error-actions" : "error-block"} role={headless ? undefined : "alert"}>
      {!headless && (
        <>
          <h2 tabIndex={-1} ref={ref}>
            {plain.heading}
          </h2>
          <p>{plain.body}</p>
        </>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={error.retry}>
          {retryLabel}
        </button>
      </div>
      {children}
      <details className="disclosure plain">
        <summary>Technical details</summary>
        <div className="body hint wrap">
          <p>Step: {error.stage}</p>
          <p>Code: {error.code}</p>
          <p>{error.message}</p>
        </div>
      </details>
    </div>
  );
}

/** After Stop: say that nothing finished was lost, and offer to pick the same run up again. */
export function Stopped({ kinds, label = "Continue" }: { kinds: RunKind[]; label?: string }) {
  const { stopped, run, clearStopped } = useDesk();
  const ref = useRef<HTMLParagraphElement>(null);
  const show = !!stopped && !run && kinds.includes(stopped.kind);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show]);
  if (!show || !stopped) return null;
  return (
    <div className="notice">
      <p tabIndex={-1} ref={ref}>
        <strong>Stopped.</strong> Everything finished so far is saved.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={stopped.resume}>
          {label}
        </button>
        <button type="button" className="btn text" onClick={clearStopped}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** A textarea that grows with its content (CSS field-sizing where supported, script elsewhere). */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} />;
}

export interface FieldProblem {
  id: string;
  message: string;
}

/** "Fix 1 thing before you continue" with links to each field. Takes focus when it appears. */
export function ErrorSummary({ problems }: { problems: FieldProblem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problems.length) ref.current?.focus();
  }, [problems]);
  if (!problems.length) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref}>
      <p>
        <strong>
          Fix {problems.length} thing{problems.length > 1 ? "s" : ""} before you continue:
        </strong>
      </p>
      <ul>
        {problems.map((p) => (
          <li key={p.id}>
            <a
              href={`#${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(p.id)?.focus();
              }}
            >
              {p.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Disclosure({ summary, children, open, plain, onToggle }: { summary: ReactNode; children: ReactNode; open?: boolean; plain?: boolean; onToggle?: (open: boolean) => void }) {
  return (
    <details className={`disclosure${plain ? " plain" : ""}`} open={open} onToggle={(e) => onToggle?.((e.target as HTMLDetailsElement).open)}>
      <summary>{summary}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

/** Show a source link as its site and path, never wider than the screen. */
export function SourceLink({ url, label }: { url: string; label?: string }) {
  if (!url || !/^https?:/i.test(url)) return <span className="hint">You entered this yourself.</span>;
  let site = url;
  try {
    site = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return (
    <a className="wrap" href={url} target="_blank" rel="noreferrer noopener">
      {label ?? `Open the page on ${site}`}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
