"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { diffArrays } from "diff";
import type { CorrectionOutcome, FactItem, Version } from "@/lib/types";
import { checklist, fileBaseName, sectionLimits } from "@/lib/requirements";
import { bodyToText, bodyWords, sectionWords } from "@/lib/docmodel";
import { lintDoc, lintIssueCount } from "@/lib/lint";
import { diffText } from "@/lib/diff";
import { dateTime, errorFor } from "@/lib/client/labels";
import { download, MIME } from "@/lib/client/files";
import { detailsChangedSince, getPref, setPref } from "@/lib/client/store";
import { newUserFacts } from "@/lib/client/profile";
import { chatEdit, openCorrections, restoreVersion, reviewLoop, saveVersion } from "@/lib/client/pipeline";
import { AutoTextarea, Disclosure, ErrorBlock, ProgressPanel, ScreenHead, SourceLink, Stopped } from "../ui";
import { PageView, TextView } from "../DocView";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";
import { AiRuleBox, SearchLog } from "./Instructions";
import { writeStatement } from "./write";

const CATEGORY: Record<string, string> = {
  facts: "Accuracy",
  requirements: "Instructions",
  program: "Program details",
  "lost-claim": "Something left out",
  "ai-pattern": "Wording",
  grammar: "Grammar",
  flow: "Wording",
};

function plainCategory(c: string): string {
  return CATEGORY[c] ?? "Wording";
}

/** Where a version came from, in words. */
function versionOrigin(v: Version): string {
  if (/^Edit \d+: (.+)$/.test(v.label)) return `after your change "${v.label.replace(/^Edit \d+: /, "")}"`;
  if (/^Edit/.test(v.label)) return "after a change you asked for";
  if (/^Draft 1$/.test(v.label)) return "first draft";
  if (/^(Draft|Retry)/.test(v.label)) return "new version";
  if (/^(Review|Check)/.test(v.label)) return "after another check";
  return v.label;
}

/** Only the paragraphs that changed, before and after. */
function ChangedParagraphs({ before, after }: { before: string; after: string }) {
  const parts = diffArrays(before.split("\n").filter(Boolean), after.split("\n").filter(Boolean));
  const groups: { removed: string[]; added: string[] }[] = [];
  let cur: { removed: string[]; added: string[] } | null = null;
  for (const part of parts) {
    if (!part.added && !part.removed) {
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { removed: [], added: [] };
      groups.push(cur);
    }
    (part.removed ? cur.removed : cur.added).push(...part.value);
  }
  if (!groups.length) return <p className="hint">The text is the same.</p>;
  return (
    <>
      {groups.map((g, i) => (
        <div className="diffbox" key={i}>
          {diffText(g.removed.join("\n"), g.added.join("\n")).map((d, j) =>
            d.op === "add" ? (
              <ins className="add" key={j}>
                <span className="sr-only">added: </span>
                {d.text}
              </ins>
            ) : d.op === "del" ? (
              <del className="del" key={j}>
                <span className="sr-only">removed: </span>
                {d.text}
              </del>
            ) : (
              <span key={j}>{d.text}</span>
            ),
          )}
        </div>
      ))}
    </>
  );
}

function OpenPoint({ o }: { o: CorrectionOutcome }) {
  const c = o.correction;
  return (
    <>
      <strong>{plainCategory(c.category)}:</strong> {c.reason}
      {o.outcome === "declined" && <span className="muted"> Left as is, because {o.note}</span>}
    </>
  );
}

export function ResultScreen() {
  const desk = useDesk();
  const { statement, profile, updateProfile, update, start, run, go, built, buildFailed, rebuild, format, info, onboarding, startStatement, getStatement, announce } = desk;
  const [view, setView] = useState<"text" | "print">("text");
  const [request, setRequest] = useState("");
  const [note, setNote] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [ackProblem, setAckProblem] = useState(false);
  const [requestProblem, setRequestProblem] = useState(false);
  const [lastChange, setLastChange] = useState<{ prevVersionId: string; saved: FactItem[]; request: string } | null>(null);
  const [compare, setCompare] = useState("");
  const ackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // "As printed" is remembered only on wide screens; phones always start with "Easy to read".
    if (getPref("view") === "print" && window.matchMedia?.("(min-width: 820px)").matches) setView("print");
  }, []);

  // A new version means the files on the applicant's computer are out of date.
  const docKey = statement?.currentVersionId ?? "";
  useEffect(() => setDownloaded(false), [docKey]);

  const p = statement;
  const fmt = built?.format ?? format;
  const pages = built?.pageCount ?? 0;
  const rows = useMemo(() => (p && fmt ? checklist(p.research, p.doc, fmt, pages, p.passed) : []), [p, fmt, pages]);
  const lint = useMemo(() => (p?.doc && fmt ? lintDoc(p.doc, sectionLimits(p.research, fmt)) : null), [p?.doc, p?.research, fmt]);
  if (!p || !p.doc || !fmt) return null;
  const doc = p.doc;
  const research = p.research;
  const words = bodyWords(doc);
  const changing = run?.kind === "change";
  const busy = !!run;
  const open = openCorrections(p);
  const official = research?.status === "official";
  const rules = research?.items.filter((i) => i.kind === "aiPolicy" && i.verified) ?? [];
  const fileRule = research?.items.find((i) => i.kind === "fileType" && i.verified);
  const wantsWord = !!fileRule && /\bdoc|word/i.test(`${fileRule.normalized} ${fileRule.text}`) && !/pdf/i.test(`${fileRule.normalized} ${fileRule.text}`);
  const base = fileBaseName(doc, research);
  const overWords = official && fmt.wordMax > 0 && words > fmt.wordMax;
  const overPages = official && fmt.pageMax > 0 && pages > fmt.pageMax;
  const university = research?.details.find((d) => d.kind === "university" && d.verified)?.value ?? "The program";
  const lastChat = [...p.chat].reverse().find((m) => m.role === "app");
  // Marks show only what the applicant's own last request changed, not the automatic checks.
  const currentVersion = p.versions.find((v) => v.id === p.currentVersionId);
  const showMarks = !!p.prevDoc && !!currentVersion && /^Edit/.test(currentVersion.label) && JSON.stringify(p.prevDoc) !== JSON.stringify(doc);

  const ackOk = () => {
    if (!rules.length || p.aiRuleAcknowledged) return true;
    setAckProblem(true);
    ackRef.current?.focus();
    return false;
  };
  const dl = (kind: "pdf" | "docx") => {
    if (!built || !ackOk()) return;
    download(kind === "pdf" ? built.pdf : built.docx, `${base}.${kind}`, MIME[kind]);
    setDownloaded(true);
  };

  const askFor = (text: string) => {
    const req = text.trim();
    if (!req) {
      setRequestProblem(true);
      document.getElementById("change-request")?.focus();
      return;
    }
    setRequestProblem(false);
    const before = getStatement()!;
    const prevVersionId = before.currentVersionId;
    const chatLength = before.chat.length;
    setRequest("");
    setLastChange(null);
    start("Making your change", chatEdit(req), {
      kind: "change",
      after: () => {
        const after = getStatement()!;
        const reply = after.chat.slice(chatLength).find((m) => m.role === "app");
        const declined = !!reply?.text.startsWith("Not changed");
        // Details stated in a change request are saved for later statements, with Undo.
        const saved: FactItem[] = [];
        if (!declined && profile) {
          const fresh = newUserFacts(before, after).filter((f) => !profile.facts.items.some((x) => x.text === f.text));
          if (fresh.length) {
            saved.push(...fresh);
            updateProfile((pr) => {
              for (const f of fresh) {
                pr.facts.items.push({ ...f });
                pr.factOrigins[f.id] = "change";
              }
              pr.version += 1;
            });
            // The statement already has these details, so it is as current as the profile it came from.
            if (before.profileVersion >= profile.version) update((st) => (st.profileVersion = profile.version + 1));
          }
        }
        setLastChange({ prevVersionId: after.currentVersionId !== prevVersionId ? prevVersionId : "", saved, request: req });
        announce(declined ? "Not changed." : "Your change is done.");
        setTimeout(() => document.getElementById("change-result")?.focus(), 0);
      },
    });
  };

  const checkAgain = () => {
    go("writing");
    start(
      "Checking it again",
      async (rt) => {
        await reviewLoop(rt, 1);
        rt.status("Preparing your files");
        await saveVersion(rt, `Check ${rt.get().versions.length + 1}`);
      },
      { kind: "write", after: () => go("result", { replace: true }) },
    );
  };

  const newVersion = (withNewDetails = false) => {
    if (withNewDetails && profile) {
      update((s) => {
        const answers = s.facts?.items.filter((f) => f.id.startsWith("ans_")) ?? [];
        s.facts = { ...structuredClone(profile.facts), items: [...structuredClone(profile.facts.items), ...answers] };
        s.inputs.voiceSample = profile.voiceSample;
        s.profileVersion = profile.version;
      });
    }
    go("writing");
    start("Writing your statement", writeStatement(p.id, withNewDetails ? "Use the updated details." : note.trim()), { kind: "write", after: () => go("result", { replace: true }) });
  };

  const summary = (() => {
    const parts: string[] = [];
    if (official && rows.length) parts.push(p.passed ? `Follows all ${rows.length} instruction${rows.length === 1 ? "" : "s"} we found` : `${rows.length} instruction${rows.length === 1 ? "" : "s"} found`);
    if (official && fmt.wordMax) parts.push(`${words} words (limit ${fmt.wordMin ? `${fmt.wordMin} to ` : ""}${fmt.wordMax})`);
    else if (!official || !fmt.pageMax) parts.push(`${words} words`);
    if (pages) parts.push(`${pages} page${pages === 1 ? "" : "s"}${official && fmt.pageMax ? ` (limit ${fmt.pageMax})` : ""}`);
    return parts.join(" · ");
  })();

  const step = stepFor("result", onboarding, p);
  return (
    <>
      <ScreenHead title={p.passed ? "Your statement is ready" : "Your statement is ready to read"} step={step} onBack={busy ? null : () => go("home")} backLabel="Back to My statements">
        <p className="summary-line num">{summary}</p>
        {official && !fmt.wordMax && !fmt.pageMax && <p className="hint">The program gives no length. Most statements are 900 to 1,200 words; yours is {words}.</p>}
        {!official && (
          <p className="hint">
            Written in a standard layout because the program&apos;s instructions weren&apos;t found.{" "}
            <button type="button" className="link-btn" onClick={() => go("instructions")}>
              Paste them
            </button>
          </p>
        )}
      </ScreenHead>

      {detailsChangedSince(p, profile) && (
        <div className="notice">
          <p>Your details changed after this was written.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => newVersion(true)}>
            Write a new version with your new details
          </button>
        </div>
      )}

      {!p.passed && !busy && (
        <div className="notice">
          {open.length ? (
            <>
              <p>
                SOP Desk has {open.length} suggestion{open.length === 1 ? "" : "s"} it couldn&apos;t apply:
              </p>
              <ul className="lines">
                {open.map((o) => (
                  <li key={o.correction.id}>
                    <p className="wrap">
                      <OpenPoint o={o} />
                    </p>
                    {o.outcome !== "declined" && (
                      <button
                        type="button"
                        className="btn text"
                        onClick={() =>
                          askFor(`${o.correction.reason} Change "${o.correction.currentText}" to "${o.correction.replacementText}".`)
                        }
                      >
                        Fix this for me
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>The checks didn&apos;t finish. You can read it now, or check it again.</p>
          )}
          <button type="button" className="btn" onClick={checkAgain}>
            Check it again
          </button>
        </div>
      )}

      {(overWords || overPages) && !busy && (
        <div className="notice warn">
          <p className="lead">
            {overWords ? `It's ${words} words; the limit is ${fmt.wordMax}.` : `It's ${pages} pages; the limit is ${fmt.pageMax}.`}
          </p>
          <button type="button" className="btn" onClick={() => askFor(overWords ? `Shorten it to ${fmt.wordMax} words.` : `Shorten it to fit ${fmt.pageMax} page${fmt.pageMax > 1 ? "s" : ""}.`)}>
            Shorten it for me
          </button>
        </div>
      )}

      <ErrorBlock kinds={["change", "write"]} />
      <Stopped kinds={["change"]} />

      {buildFailed && (
        <div className="error-block" role="alert">
          <h2>We couldn&apos;t prepare your files</h2>
          <p>Your statement is saved. Try again to build the PDF and Word file.</p>
          <button type="button" className="btn primary" onClick={rebuild}>
            Retry this step
          </button>
        </div>
      )}

      {rules.length > 0 && (
        <div className="rule-ack">
          <AiRuleBox items={rules} />
          <label className="check">
            <input
              ref={ackRef}
              type="checkbox"
              checked={p.aiRuleAcknowledged}
              aria-invalid={ackProblem && !p.aiRuleAcknowledged ? true : undefined}
              aria-describedby={ackProblem ? "ack-error" : undefined}
              onChange={(e) => {
                const v = e.target.checked;
                update((st) => (st.aiRuleAcknowledged = v));
                if (v) setAckProblem(false);
              }}
            />
            <span>I&apos;ve read this program&apos;s rule about writing help.</span>
          </label>
          {ackProblem && !p.aiRuleAcknowledged && (
            <p className="field-error" id="ack-error" role="alert">
              Tick the box above first.
            </p>
          )}
        </div>
      )}

      <section className="download" aria-labelledby="h-download">
        <h2 id="h-download" className="sr-only">
          Download
        </h2>
        <div className="row">
          <button type="button" className="btn primary block" disabled={!built || busy} onClick={() => dl(wantsWord ? "docx" : "pdf")}>
            {wantsWord ? "Download Word file (.docx)" : "Download PDF"}
          </button>
          <button type="button" className="btn block" disabled={!built || busy} onClick={() => dl(wantsWord ? "pdf" : "docx")}>
            {wantsWord ? "Download PDF" : "Download Word file (.docx)"}
          </button>
          <button
            type="button"
            className="btn text"
            disabled={!built || busy}
            onClick={() => {
              if (!built || !ackOk()) return;
              dl("docx");
              setTimeout(() => dl("pdf"), 400);
            }}
          >
            Download both
          </button>
        </div>
        <p className="hint">
          {fileRule ? `${university} asks for ${wantsWord ? "a Word file" : "a PDF"}. ` : ""}
          {wantsWord ? "The PDF is the same text, ready to print." : "The Word file is the same text, if you want to edit it yourself."}
        </p>
        <p className="hint">Read it before you submit. Every fact should be true, and it should sound like you. SOP Desk can make mistakes.</p>
        {downloaded && (
          <div className="notice" role="status">
            <p>Downloaded. Applying somewhere else?</p>
            <button type="button" className="btn" onClick={startStatement}>
              Start a new statement
            </button>
          </div>
        )}
      </section>

      <div className="doc-bar">
        <p className="hint">Draft written by SOP Desk from your resume.</p>
        <div className="seg" role="group" aria-label="How to show the statement">
          <button
            type="button"
            aria-pressed={view === "text"}
            onClick={() => {
              setView("text");
              setPref("view", "");
            }}
          >
            Easy to read
          </button>
          <button
            type="button"
            aria-pressed={view === "print"}
            onClick={() => {
              setView("print");
              setPref("view", "print");
            }}
          >
            As printed
          </button>
        </div>
      </div>
      {showMarks && view === "text" && <p className="hint">Underlined words changed with your last request.</p>}
      {view === "print" && built ? (
        <>
          <p className="hint">
            {pages} page{pages === 1 ? "" : "s"}, {fmt.page === "a4" ? "A4" : "US Letter"}, {fmt.sizePt} pt,{" "}
            {fmt.lineMultiple >= 2 ? "double spaced" : fmt.lineMultiple >= 1.5 ? "1.5 spaced" : "single spaced"}
          </p>
          <PageView pdf={built.pdf} />
        </>
      ) : (
        <TextView doc={doc} prev={showMarks ? p.prevDoc : null} format={fmt} />
      )}

      <section className="section" aria-labelledby="h-change">
        <h2 id="h-change">Want something changed?</h2>
        {lastChange && !busy && lastChat && (
          <div className="notice" role="status" id="change-result" tabIndex={-1}>
            <p className="wrap">{lastChat.text.startsWith("Not changed") ? lastChat.text : `Changed: ${lastChat.text}`}</p>
            {lastChange.prevVersionId && (
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    start("Undoing your change", async (rt) => restoreVersion(rt, lastChange.prevVersionId), {
                      kind: "change",
                      after: () => {
                        setLastChange(null);
                        announce("Your change was undone.");
                      },
                    })
                  }
                >
                  Undo this change
                </button>
              </div>
            )}
            {lastChat.before !== undefined && lastChat.after !== undefined && (
              <Disclosure summary="Show what changed" plain>
                <ChangedParagraphs before={lastChat.before} after={lastChat.after} />
              </Disclosure>
            )}
            {lastChange.saved.map((f) => (
              <p key={f.id} className="wrap">
                Saved to your details for future statements: &ldquo;{f.text}&rdquo;.{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    const wasCurrent = !!profile && p.profileVersion >= profile.version;
                    updateProfile((pr) => {
                      pr.facts.items = pr.facts.items.filter((x) => x.id !== f.id);
                      delete pr.factOrigins[f.id];
                      pr.version += 1;
                    });
                    // Taking a detail back out of your saved details doesn't make this statement out of date.
                    if (wasCurrent && profile) update((st) => (st.profileVersion = profile.version + 1));
                    setLastChange((c) => (c ? { ...c, saved: c.saved.filter((x) => x.id !== f.id) } : c));
                  }}
                >
                  Undo
                </button>
              </p>
            ))}
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="change-request">
            Describe it in your own words
          </label>
          <span className="hint" id="change-hint">
            For example: make the second paragraph shorter.
          </span>
          <AutoTextarea
            id="change-request"
            className="short"
            aria-describedby={`change-hint${requestProblem ? " change-error" : ""}`}
            aria-invalid={requestProblem ? true : undefined}
            value={request}
            disabled={busy}
            onChange={(e) => {
              setRequest(e.target.value);
              if (e.target.value.trim()) setRequestProblem(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askFor(request);
            }}
          />
        </div>
        {requestProblem && (
          <p className="field-error" id="change-error">
            Describe the change first, or pick one of the ideas below.
          </p>
        )}
        <p className="hint chips-label" id="ideas">
          Ideas:
        </p>
        <div className="chips" role="group" aria-labelledby="ideas">
          {["Make it shorter", "Use simpler words", "Say more about my work experience", "Make my career goals clearer"].map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => {
                setRequest(c);
                setRequestProblem(false);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {changing ? (
          <ProgressPanel kinds={["change"]} />
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => askFor(request)}>
            Make this change
          </button>
        )}
      </section>

      <div className="section">
        <Disclosure summary="Not happy with it? Write a new version">
          <div className="field">
            <label className="label" htmlFor="retry-note">
              What should be different? (optional)
            </label>
            <span className="hint" id="retry-hint">
              Your current version is kept under Earlier versions.
            </span>
            <AutoTextarea id="retry-note" className="short" aria-describedby="retry-hint" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => newVersion(false)}>
            Write a new version
          </button>
          <p className="hint section">
            Something wrong with the instructions or your answers?{" "}
            <button type="button" className="link-btn" disabled={busy} onClick={() => go("instructions")}>
              Check the instructions again
            </button>
          </p>
        </Disclosure>
      </div>

      <section className="section" aria-labelledby="h-details">
        <h2 id="h-details">Show details</h2>
        <div className="details-group">
          {official && rows.length > 0 && (
            <Disclosure summary="What the program asks for, and where it says so">
              <ul className="lines">
                {rows.map((row) => (
                  <li key={row.item.id}>
                    <div className="row between">
                      <span className="wrap">{row.item.text}</span>
                      <span className="tag">{row.met === true ? "Follows" : row.met === false ? "Doesn't follow yet" : "Checked by SOP Desk"}</span>
                    </div>
                    <p className="hint num">{plainNote(row.item.kind, row.note)}</p>
                    {row.item.quote && <blockquote className="quote">&ldquo;{row.item.quote}&rdquo;</blockquote>}
                    <SourceLink url={row.item.sourceUrl} />
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          <Disclosure summary="Length and layout">
            <dl className="kv num">
              <dt>Words</dt>
              <dd>
                {words}
                {fmt.wordMax ? ` of ${fmt.wordMin ? `${fmt.wordMin} to ` : ""}${fmt.wordMax}` : ""}
              </dd>
              {doc.sections.map((s, i) =>
                s.heading || doc.sections.length > 1 ? (
                  <FragmentRow key={i} label={s.heading || `Part ${i + 1}`} value={`${sectionWords(s)}${lint?.perSection[i]?.limit ? ` of ${lint.perSection[i].limit}` : ""} words`} />
                ) : null,
              )}
              <dt>Pages</dt>
              <dd>
                {pages || "–"}
                {fmt.pageMax ? ` of ${fmt.pageMax}` : ""}
              </dd>
              <dt>Layout</dt>
              <dd>
                {fmt.docxFont}, {fmt.sizePt} pt, {fmt.lineMultiple >= 2 ? "double" : fmt.lineMultiple >= 1.5 ? "1.5" : "single"} spaced, {fmt.marginIn}-inch margins
              </dd>
              <dt>Writing-style checks</dt>
              <dd>
                {lint ? lintIssueCount(lint) : 0} phrase{lint && lintIssueCount(lint) === 1 ? "" : "s"} flagged
              </dd>
            </dl>
          </Disclosure>

          <Disclosure summary="How SOP Desk checked it">
            {p.rounds.length === 0 ? (
              <p className="hint">Not checked yet.</p>
            ) : (
              <ol className="lines">
                {p.rounds.map((r) => (
                  <li key={r.round}>
                    <h3>
                      Check {r.round}: {r.verdict === "NO_CORRECTIONS" ? "nothing to change" : `${r.outcomes.length} change${r.outcomes.length === 1 ? "" : "s"} suggested`}
                    </h3>
                    <p className="hint num">
                      {r.wordCount} words, {r.pageCount} page{r.pageCount === 1 ? "" : "s"}
                    </p>
                    {r.outcomes.map((o) => (
                      <div key={o.correction.id} className="check-item">
                        <p>
                          <strong>{o.correction.severity === "MUST_FIX" ? "Important" : "Suggested"}</strong> · {plainCategory(o.correction.category)}: {o.correction.reason}
                        </p>
                        <p className="wrap">
                          <span className="muted">Before: </span>
                          <del className="del">{o.correction.currentText}</del>
                        </p>
                        <p className="wrap">
                          <span className="muted">After: </span>
                          <ins className="add">{o.correction.replacementText || "(removed)"}</ins>
                        </p>
                        <p className="hint">
                          {o.outcome.startsWith("applied") ? "Fixed" : o.outcome === "declined" ? `Left as is, because ${o.note}` : `Not applied: ${o.note}`}
                        </p>
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </Disclosure>

          {p.versions.length > 0 && (
            <Disclosure summary="Earlier versions">
              <ol className="lines">
                {[...p.versions].reverse().map((v) => {
                  const n = p.versions.indexOf(v) + 1;
                  const current = v.id === p.currentVersionId;
                  return (
                    <li key={v.id}>
                      <p>
                        Version {n} · {versionOrigin(v)} · {dateTime(v.createdAt)} · <span className="num">{v.wordCount} words</span>
                        {current && <span className="tag"> · In use</span>}
                      </p>
                      <div className="row">
                        <button type="button" className="btn text" aria-expanded={compare === v.id} onClick={() => setCompare(compare === v.id ? "" : v.id)}>
                          {compare === v.id ? "Hide comparison" : "Compare with current"}
                        </button>
                        {!current && (
                          <button
                            type="button"
                            className="btn text"
                            disabled={busy}
                            onClick={() => start("Switching versions", async (rt) => restoreVersion(rt, v.id), { kind: "change" })}
                          >
                            Use this version
                          </button>
                        )}
                      </div>
                      {compare === v.id && <ChangedParagraphs before={bodyToText(v.doc)} after={bodyToText(doc)} />}
                    </li>
                  );
                })}
              </ol>
              <p className="hint">Using an earlier version keeps the current one in this list.</p>
            </Disclosure>
          )}

          {p.chat.length > 0 && (
            <Disclosure summary="Your change requests">
              <ul className="lines">
                {p.chat.map((m) => (
                  <li key={m.id} className="wrap">
                    <span className="muted">{m.role === "user" ? "You asked: " : "SOP Desk: "}</span>
                    {m.text}
                    {m.before !== undefined && m.after !== undefined && (
                      <Disclosure summary="Show what changed" plain>
                        <ChangedParagraphs before={m.before} after={m.after} />
                      </Disclosure>
                    )}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          {research && (
            <Disclosure summary="What we searched">
              <SearchLog />
            </Disclosure>
          )}

          <Disclosure summary="About these files">
            <p>
              Both files have the same text and layout, built in your browser. They contain no hidden author details or tracked changes, and hidden characters are removed.
              {built?.adjusted ? " Paragraph spacing was tightened slightly so the last lines don't sit alone on a new page." : ""}
            </p>
            <p className="hint wrap">File names: {base}.pdf and {base}.docx</p>
          </Disclosure>

          <Disclosure summary="Technical details">
            <p className="hint">Model: {info.model}</p>
            {p.lastError && (
              <p className="hint">
                Last problem: {errorFor(p.lastError.code, p.lastError.stage).heading} ({p.lastError.stage}, {p.lastError.code})
              </p>
            )}
            {p.runs.length > 0 && (
              <div className="table-wrap">
                <table className="runs num">
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col">Tokens in</th>
                      <th scope="col">Tokens out</th>
                      <th scope="col">Seconds</th>
                      <th scope="col">Web</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.runs.map((r, i) => (
                      <tr key={i}>
                        <td>{r.stage}</td>
                        <td>{r.inputTokens.toLocaleString()}</td>
                        <td>{r.outputTokens.toLocaleString()}</td>
                        <td>{(r.durationMs / 1000).toFixed(0)}</td>
                        <td>{r.searches + r.fetches || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Disclosure>
        </div>
      </section>
    </>
  );
}

/** The checklist's notes, in the words used on this screen. */
function plainNote(kind: string, note: string): string {
  if (/^Checked (in review|by the reviewer)$/.test(note)) return "Checked by SOP Desk";
  if (kind === "fileType") return "Use the Download buttons above";
  if (note === "No draft yet") return "";
  return note;
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="wrap">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
