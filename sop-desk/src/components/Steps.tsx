"use client";

import { useMemo, useState } from "react";
import type { DetailKind, FactCategory, ProgramDetail, ReqItem, ReqKind } from "@/lib/types";
import { FACT_CATEGORIES } from "@/lib/types";
import { checkProgramLink, parseExtraLinks, registrableDomain } from "@/lib/domains";
import { KIND_LABEL, fileBaseName, refreshStatus } from "@/lib/requirements";
import { bodyToText, newId } from "@/lib/docmodel";
import { cleanHidden } from "@/lib/clean";
import { diffText } from "@/lib/diff";
import { download, MIME } from "@/lib/client/files";
import { continueRun, openCorrections, restoreVersion, reviewLoop, runDraft, runExtract, runFacts, runQuestions, runResearch, saveVersion } from "@/lib/client/pipeline";
import { useDesk, type StepId } from "./desk";

const MAX_RESUME_BYTES = 3 * 1024 * 1024;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/* ----------------------------------------------------------------- intake */

function IntakePanel() {
  const { project, update, start, running, goto } = useDesk();
  const { inputs } = project;
  const [fileError, setFileError] = useState("");
  const [cleaned, setCleaned] = useState(0);
  const link = inputs.programUrl.trim() ? checkProgramLink(inputs.programUrl, project.confirmedDomains) : null;
  const extras = parseExtraLinks(inputs.extraLinks);
  const hasResume = inputs.resumeKind === "pdf" || inputs.resumeKind === "docx" ? !!inputs.resumeData : inputs.resumeText.trim().length > 0;

  const onFile = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") return setFileError("Upload a PDF or a DOCX file.");
    if (file.size > MAX_RESUME_BYTES) return setFileError("That file is larger than 3 MB.");
    const data = toBase64(await file.arrayBuffer());
    update((p) => {
      p.inputs.resumeKind = ext;
      p.inputs.resumeName = file.name;
      p.inputs.resumeData = data;
    });
  };

  return (
    <div>
      <div className="field">
        <label className="label" htmlFor="resume-file">
          Resume
        </label>
        {inputs.resumeData ? (
          <div className="row">
            <span>{inputs.resumeName}</span>
            <button
              className="btn quiet"
              onClick={() =>
                update((p) => {
                  p.inputs.resumeKind = p.inputs.resumeText ? "text" : "";
                  p.inputs.resumeName = "";
                  p.inputs.resumeData = "";
                })
              }
            >
              Remove
            </button>
          </div>
        ) : (
          <input id="resume-file" type="file" accept=".pdf,.docx,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />
        )}
        <span className="hint">PDF or DOCX, up to 3 MB.</span>
        {fileError && (
          <span role="alert" className="hint" style={{ color: "var(--bad)" }}>
            {fileError}
          </span>
        )}
      </div>
      {!inputs.resumeData && (
        <label className="field">
          <span>Or paste the resume text</span>
          <textarea
            rows={5}
            value={inputs.resumeText}
            onChange={(e) => {
              // Pasted resumes often carry hidden characters; they are removed on the way in.
              const report = cleanHidden(e.target.value);
              setCleaned(report.removed + report.spacesNormalized);
              update((p) => {
                p.inputs.resumeText = report.text;
                p.inputs.resumeKind = report.text.trim() ? "text" : "";
              });
            }}
          />
          {cleaned > 0 && <span className="hint">Removed {cleaned} hidden or unusual characters.</span>}
        </label>
      )}

      <label className="field">
        <span>Program link</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.university.edu/program"
          value={inputs.programUrl}
          onChange={(e) => update((p) => (p.inputs.programUrl = e.target.value))}
          aria-describedby="link-hint"
          required
        />
        <span className="hint" id="link-hint">
          The program&apos;s page on the university&apos;s own website.
        </span>
      </label>
      {link && !link.ok && (
        <div role="alert" className="small" style={{ color: "var(--bad)", margin: "-6px 0 14px" }}>
          {link.message}
          {link.reason === "unsure" && (
            <div style={{ marginTop: 6 }}>
              <button
                className="btn small"
                onClick={() =>
                  update((p) => {
                    const d = registrableDomain(p.inputs.programUrl);
                    if (d && !p.confirmedDomains.includes(d)) p.confirmedDomains.push(d);
                  })
                }
              >
                This is the university&apos;s own site
              </button>
            </div>
          )}
        </div>
      )}

      <details style={{ marginBottom: 14 }}>
        <summary>Optional details</summary>
        <div style={{ paddingTop: 10 }}>
          <label className="field">
            <span>Entry term</span>
            <input type="text" placeholder="Fall 2027" value={inputs.entryTerm} onChange={(e) => update((p) => (p.inputs.entryTerm = e.target.value))} />
          </label>
          <label className="field">
            <span>Concentration</span>
            <input type="text" value={inputs.concentration} onChange={(e) => update((p) => (p.inputs.concentration = e.target.value))} />
          </label>
          <label className="field">
            <span>Extra official links</span>
            <textarea rows={2} placeholder="An application-instructions page, one link per line" value={inputs.extraLinks} onChange={(e) => update((p) => (p.inputs.extraLinks = e.target.value))} />
            {extras.rejected.length > 0 && (
              <span className="hint" style={{ color: "var(--bad)" }}>
                Not used (not an official link): {extras.rejected.join(", ")}
              </span>
            )}
          </label>
          <label className="field">
            <span>Something you wrote yourself</span>
            <textarea rows={3} value={inputs.voiceSample} onChange={(e) => update((p) => (p.inputs.voiceSample = cleanHidden(e.target.value).text))} />
            <span className="hint">A paragraph or an earlier statement. Used only to match your voice.</span>
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea rows={2} placeholder="For example: emphasize my banking experience" value={inputs.notes} onChange={(e) => update((p) => (p.inputs.notes = e.target.value))} />
          </label>
        </div>
      </details>

      <div className="row">
        <button className="btn primary" disabled={running || !hasResume} onClick={() => start("Resume facts", runFacts, () => goto("facts"))}>
          Read resume
        </button>
        {project.facts && (
          <button className="btn quiet" onClick={() => goto("facts")}>
            Go to facts
          </button>
        )}
      </div>
      {!hasResume && <p className="muted small" style={{ marginTop: 8 }}>Add your resume to begin.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ facts */

function FactsPanel() {
  const { project, update, start, running, goto } = useDesk();
  const [category, setCategory] = useState<FactCategory>("awards");
  const [text, setText] = useState("");
  const facts = project.facts;
  if (!facts) return <p className="muted">Read your resume first.</p>;
  const link = checkProgramLink(project.inputs.programUrl, project.confirmedDomains);
  const add = () => {
    const t = cleanHidden(text).text.trim();
    if (!t) return;
    update((p) => p.facts!.items.push({ id: newId("fact"), category, text: t, source: "user" }));
    setText("");
  };
  return (
    <div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        The statement uses only these facts. Fix anything that was read wrongly and add what the resume leaves out.
      </p>
      <label className="field">
        <span>Your name</span>
        <input type="text" value={facts.applicantName} onChange={(e) => update((p) => (p.facts!.applicantName = e.target.value))} />
      </label>
      {FACT_CATEGORIES.map((cat) => {
        const items = facts.items.filter((f) => f.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} style={{ marginBottom: 12 }}>
            <h3 className="label" style={{ textTransform: "capitalize" }}>
              {cat}
            </h3>
            <ul className="itemlist">
              {items.map((f) => (
                <li key={f.id}>
                  <textarea
                    aria-label={`${cat} fact`}
                    rows={Math.min(5, Math.max(2, Math.ceil(f.text.length / 44)))}
                    value={f.text}
                    onChange={(e) => update((p) => (p.facts!.items.find((x) => x.id === f.id)!.text = e.target.value))}
                  />
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    {f.source === "user" ? <span className="tag you">from you</span> : <span />}
                    <button className="btn quiet" onClick={() => update((p) => (p.facts!.items = p.facts!.items.filter((x) => x.id !== f.id)))}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="field" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        <label className="label" htmlFor="new-fact">
          Add a fact
        </label>
        <div className="row" style={{ marginBottom: 6 }}>
          <label className="sr-only" htmlFor="new-fact-cat">
            Category
          </label>
          <select id="new-fact-cat" value={category} onChange={(e) => setCategory(e.target.value as FactCategory)} style={{ width: "auto", textTransform: "capitalize" }}>
            {FACT_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <textarea id="new-fact" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: Regional Fellowship, 2024" />
        <button className="btn small" style={{ marginTop: 6 }} onClick={add} disabled={!text.trim()}>
          Add fact
        </button>
      </div>
      <div className="row">
        <button className="btn primary" disabled={running || !link.ok} onClick={() => {
            // Go to the Requirements step right away: results, or the error and the paste box, show there.
            goto("requirements");
            start("Find requirements", (rt) => runResearch(rt));
          }}
        >
          Find requirements
        </button>
        <button className="btn quiet" disabled={running} onClick={() => start("Resume facts", runFacts)}>
          Read resume again
        </button>
      </div>
      {!link.ok && (
        <p className="small" style={{ color: "var(--bad)", marginTop: 8 }}>
          {project.inputs.programUrl.trim() ? link.message : "Add the program link in the first step."}{" "}
          <button className="btn quiet" onClick={() => goto("intake")}>
            Edit the link
          </button>
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- requirements */

const ADDABLE: ReqKind[] = ["prompt", "wordLimit", "pageLimit", "fontSize", "spacing", "margins", "font", "topic", "avoid", "docType"];
const DETAIL_LABEL: Record<DetailKind, string> = {
  university: "University",
  program: "Program",
  school: "School or college",
  country: "Country",
  concentration: "Concentration",
  course: "Course",
  lab: "Lab or center",
  facultyArea: "Faculty research area",
  feature: "Feature",
};

function SourceLink({ url }: { url: string }) {
  if (!url || url.startsWith("pasted:") || url === "user") return <span className="src muted">Entered by you</span>;
  return (
    <a className="src" href={url} target="_blank" rel="noreferrer noopener">
      {url.replace(/^https?:\/\//, "")}
    </a>
  );
}

function RequirementsPanel() {
  const { project, update, start, running, goto, error } = useDesk();
  const r = project.research;
  const [kind, setKind] = useState<ReqKind>("prompt");
  const [text, setText] = useState("");
  const [max, setMax] = useState("");
  const [dKind, setDKind] = useState<DetailKind>("course");
  const [dText, setDText] = useState("");
  const link = checkProgramLink(project.inputs.programUrl, project.confirmedDomains);
  const researchFailed = !r && !!error && /requirements|research/i.test(error.stage);

  const pasteBox = (
    <details open={researchFailed} style={{ margin: "10px 0" }}>
      <summary>Paste the instructions yourself</summary>
      <label className="field" style={{ marginTop: 8 }}>
        <span className="sr-only">Statement instructions</span>
        <textarea
          rows={5}
          placeholder="Paste the statement instructions exactly as the university gives them"
          value={project.inputs.pastedInstructions}
          onChange={(e) => update((p) => (p.inputs.pastedInstructions = cleanHidden(e.target.value).text))}
        />
      </label>
      <button
        className="btn small"
        disabled={running || !project.inputs.pastedInstructions.trim()}
        onClick={() => start("Read pasted requirements", (rt) => runExtract(rt, true))}
      >
        Use these instructions
      </button>
    </details>
  );

  if (!r) {
    return (
      <div>
        <p className="muted" style={{ marginBottom: 10 }}>
          {researchFailed
            ? "The search did not finish, so nothing was assumed. Try again, or paste the instructions."
            : "The app searches the university's own site for the statement instructions before anything is written."}
        </p>
        <button className="btn primary" disabled={running || !link.ok || !project.facts} onClick={() => start("Find requirements", (rt) => runResearch(rt, researchFailed))}>
          {researchFailed ? "Try again" : "Find requirements"}
        </button>
        {pasteBox}
      </div>
    );
  }

  const edit = (mutate: (items: ReqItem[], details: ProgramDetail[]) => void) =>
    update((p) => {
      mutate(p.research!.items, p.research!.details);
      refreshStatus(p.research!);
    });
  const addItem = () => {
    const t = text.trim();
    if (!t) return;
    const n = Math.max(0, Math.round(Number(max)) || 0);
    edit((items) =>
      items.push({ id: newId("req"), kind, text: t, min: 0, max: kind === "wordLimit" || kind === "pageLimit" || kind === "prompt" ? n : 0, normalized: t, quote: "", sourceUrl: "user", level: "user", verified: true, origin: "user" }),
    );
    setText("");
    setMax("");
  };
  const addDetail = () => {
    const t = dText.trim();
    if (!t) return;
    edit((_, details) => details.push({ id: newId("det"), kind: dKind, value: t, quote: "", sourceUrl: "user", verified: true, origin: "user" }));
    setDText("");
  };

  return (
    <div>
      <p style={{ marginBottom: 6 }}>
        <strong>{r.statusLine}</strong>
      </p>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Searched {r.domains.join(", ") || "no domain"} · {r.gather.searchCount} searches, {r.gather.pages.filter((p) => p.kind !== "pasted").length} pages read · checked{" "}
        {new Date(r.checkedAt).toLocaleDateString()}{" "}
        <button className="btn quiet" disabled={running} onClick={() => start("Find requirements", (rt) => runResearch(rt, true))}>
          Check again
        </button>
      </p>

      <h3 className="label">Statement instructions</h3>
      {r.items.length === 0 && <p className="muted small">None found on the official site.</p>}
      <ul className="itemlist">
        {r.items.map((item) => (
          <li key={item.id}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <span className="tag">{KIND_LABEL[item.kind]}</span>
              <button className="btn quiet" onClick={() => edit((items) => items.splice(items.findIndex((x) => x.id === item.id), 1))}>
                Remove
              </button>
            </div>
            <textarea
              aria-label={KIND_LABEL[item.kind]}
              rows={Math.min(4, Math.max(1, Math.ceil(item.text.length / 44)))}
              value={item.text}
              onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.text = e.target.value))}
            />
            {(item.kind === "wordLimit" || item.kind === "pageLimit" || item.kind === "prompt") && (
              <div className="row small" style={{ marginTop: 4 }}>
                <label>
                  Min{" "}
                  <input type="number" min={0} style={{ width: 80 }} value={item.min || ""} onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.min = Math.max(0, Number(e.target.value) || 0)))} />
                </label>
                <label>
                  Max{" "}
                  <input type="number" min={0} style={{ width: 80 }} value={item.max || ""} onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.max = Math.max(0, Number(e.target.value) || 0)))} />
                </label>
                <span className="muted">{item.kind === "pageLimit" ? "pages" : "words"}</span>
              </div>
            )}
            {item.quote && <blockquote className="quote">&ldquo;{item.quote}&rdquo;</blockquote>}
            <SourceLink url={item.sourceUrl} />
          </li>
        ))}
      </ul>

      <details style={{ margin: "8px 0 14px" }}>
        <summary>Add an instruction</summary>
        <div style={{ paddingTop: 8 }}>
          <label className="field">
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ReqKind)}>
              {ADDABLE.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>What it says</span>
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "fontSize" ? "12 point" : kind === "spacing" ? "Double-spaced" : ""} />
          </label>
          {(kind === "wordLimit" || kind === "pageLimit" || kind === "prompt") && (
            <label className="field">
              <span>Maximum {kind === "pageLimit" ? "pages" : "words"}</span>
              <input type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
          )}
          <button className="btn small" onClick={addItem} disabled={!text.trim()}>
            Add instruction
          </button>
        </div>
      </details>

      <h3 className="label">Program details</h3>
      {r.details.length === 0 && <p className="muted small">None verified.</p>}
      <ul className="itemlist">
        {r.details.map((d) => (
          <li key={d.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <span className="tag">{DETAIL_LABEL[d.kind]}</span> {d.value}
              </span>
              <button className="btn quiet" onClick={() => edit((_, details) => details.splice(details.findIndex((x) => x.id === d.id), 1))}>
                Remove
              </button>
            </div>
            {d.quote && <blockquote className="quote">&ldquo;{d.quote}&rdquo;</blockquote>}
            <SourceLink url={d.sourceUrl} />
          </li>
        ))}
      </ul>
      <details style={{ margin: "8px 0 14px" }}>
        <summary>Add a program detail</summary>
        <div style={{ paddingTop: 8 }}>
          <label className="field">
            <span>Kind</span>
            <select value={dKind} onChange={(e) => setDKind(e.target.value as DetailKind)}>
              {(Object.keys(DETAIL_LABEL) as DetailKind[]).filter((k) => k !== "country").map((k) => (
                <option key={k} value={k}>
                  {DETAIL_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input type="text" value={dText} onChange={(e) => setDText(e.target.value)} />
          </label>
          <button className="btn small" onClick={addDetail} disabled={!dText.trim()}>
            Add detail
          </button>
        </div>
      </details>

      {r.dropped.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary>
            {r.dropped.length} item{r.dropped.length > 1 ? "s" : ""} dropped
          </summary>
          <ul className="itemlist small">
            {r.dropped.map((d, i) => (
              <li key={i}>
                {d.text}
                <div className="muted">{d.reason}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(r.gather.queries.length > 0 || r.gather.fetchErrors.length > 0) && (
        <details style={{ marginBottom: 12 }}>
          <summary>What was searched and read</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {r.gather.queries.map((q, i) => (
              <li key={`q${i}`}>Search: {q}</li>
            ))}
            {r.gather.pages.filter((p) => p.kind !== "pasted").map((p) => (
              <li key={p.url}>
                Read: <SourceLink url={p.url} />
              </li>
            ))}
            {r.gather.fetchErrors.map((e, i) => (
              <li key={`e${i}`} style={{ color: "var(--bad)" }}>
                Could not read {e.url || "a page"} ({e.code})
              </li>
            ))}
          </ul>
        </details>
      )}
      {pasteBox}
      <button className="btn primary" disabled={running} onClick={() => goto("draft")}>
        Continue to draft
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ draft */

function DraftPanel() {
  const { project, update, start, running, goto, info } = useDesk();
  const [retryNote, setRetryNote] = useState("");
  const [compare, setCompare] = useState("");
  const ready = !!project.facts && !!project.research;
  const open = openCorrections(project);
  const unfinished = (!!project.preHumanize && !project.doc) || (!!project.doc && !project.passed);
  const compared = project.versions.find((v) => v.id === compare);
  const diff = useMemo(() => (compared && project.doc ? diffText(bodyToText(compared.doc), bodyToText(project.doc)) : []), [compared, project.doc]);

  if (!ready) return <p className="muted">Find the requirements first.</p>;
  const official = project.research!.status === "official";
  const done = () => goto("download");

  return (
    <div>
      <p style={{ marginBottom: 10 }}>{project.research!.statusLine}</p>

      {official && project.questions === null && (
        <div style={{ marginBottom: 14 }}>
          <p className="muted small" style={{ marginBottom: 6 }}>
            The instructions may ask for things your facts don&apos;t cover.
          </p>
          <button className="btn small" disabled={running} onClick={() => start("Questions", runQuestions)}>
            Check for missing details
          </button>
        </div>
      )}
      {project.questions && project.questions.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <h3 className="label">A few optional questions</h3>
          <p className="muted small" style={{ marginBottom: 8 }}>
            Your answers are used as facts. Anything you skip is left out, never invented.
          </p>
          <ul className="itemlist">
            {project.questions.map((q) => (
              <li key={q.id}>
                <label htmlFor={q.id} style={{ display: "block", marginBottom: 4 }}>
                  {q.text} <span className="muted small">({q.why})</span>
                </label>
                <textarea
                  id={q.id}
                  rows={2}
                  disabled={q.skipped}
                  value={q.answer}
                  onChange={(e) => update((p) => (p.questions!.find((x) => x.id === q.id)!.answer = e.target.value))}
                />
                <label className="small row" style={{ marginTop: 4 }}>
                  <input type="checkbox" checked={q.skipped} onChange={(e) => update((p) => (p.questions!.find((x) => x.id === q.id)!.skipped = e.target.checked))} /> Skip
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      {project.questions && project.questions.length === 0 && official && <p className="muted small" style={{ marginBottom: 12 }}>Your facts cover what the instructions ask for.</p>}

      {!project.preHumanize && !project.doc ? (
        <>
          <button className="btn primary" disabled={running} onClick={() => start("Draft and review", (rt) => runDraft(rt), done)}>
            Write draft
          </button>
          <p className="muted small" style={{ marginTop: 8 }}>
            Writes the draft, runs the humanizer pass, then reviews it for up to {info.maxReviewRounds} rounds. This can take several minutes.
          </p>
        </>
      ) : (
        <>
          {project.passed ? (
            <p style={{ marginBottom: 10 }}>
              <span className="tag ok">Passed review</span> No corrections, high confidence.
            </p>
          ) : (
            !running && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ marginBottom: 6 }}>
                  <span className="tag wait">Not passed</span>{" "}
                  {!project.doc ? "The run stopped before the humanizer pass." : project.rounds.length ? "The review stopped before the draft passed. You decide what happens next." : "The run stopped before the review."}
                </p>
                {open.length > 0 && (
                  <ul className="itemlist small">
                    {open.map((o) => (
                      <li key={o.correction.id}>
                        <strong>
                          {o.correction.severity === "MUST_FIX" ? "Must fix" : "Should fix"} ({o.correction.category}):
                        </strong>{" "}
                        {o.correction.reason}
                        <div className="muted">{o.outcome === "declined" ? `Declined because ${o.note}` : `Not applied: ${o.note}`}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row" style={{ marginTop: 6 }}>
                  {unfinished && (
                    <button
                      className="btn primary"
                      onClick={() =>
                        start(
                          "Draft and review",
                          (rt) => (rt.get().doc && rt.get().versions.length ? reviewLoop(rt, 1).then(() => saveVersion(rt, `Review ${rt.get().versions.length + 1}`)) : continueRun(rt)),
                          done,
                        )
                      }
                    >
                      {project.doc && project.versions.length ? "Run another review round" : "Continue"}
                    </button>
                  )}
                </div>
              </div>
            )
          )}
          <label className="field">
            <span>Retry: what should be different?</span>
            <textarea rows={2} value={retryNote} onChange={(e) => setRetryNote(e.target.value)} placeholder="Optional" />
          </label>
          <div className="row">
            <button className="btn" disabled={running} onClick={() => start("Draft and review", (rt) => runDraft(rt, retryNote.trim() || " "), done)}>
              Retry
            </button>
            {project.doc && (
              <button className="btn quiet" onClick={done}>
                Go to download
              </button>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            Retry writes a fresh draft from the same inputs and reuses the saved research.
          </p>
        </>
      )}

      {project.versions.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="label">Versions</h3>
          <ul className="itemlist">
            {[...project.versions].reverse().map((v) => (
              <li key={v.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    {v.label} {v.id === project.currentVersionId && <span className="tag">current</span>}{" "}
                    <span className={`tag ${v.passed ? "ok" : "wait"}`}>{v.passed ? "passed" : "not passed"}</span>
                  </span>
                  <span className="muted small num">
                    {v.wordCount} words · {v.pageCount} p
                  </span>
                </div>
                <div className="row">
                  <button className="btn quiet" onClick={() => setCompare(compare === v.id ? "" : v.id)} aria-expanded={compare === v.id}>
                    {compare === v.id ? "Hide comparison" : "Compare with current"}
                  </button>
                  {v.id !== project.currentVersionId && (
                    <button className="btn quiet" disabled={running} onClick={() => start("Restore version", async (rt) => restoreVersion(rt, v.id))}>
                      Restore
                    </button>
                  )}
                </div>
                {compare === v.id && (
                  <div className="diffbox" aria-label={`Changes from ${v.label} to the current text`}>
                    {diff.every((d) => d.op === "same")
                      ? "Same text as the current version."
                      : diff.map((d, i) => (d.op === "add" ? <ins className="add" key={i}>{d.text}</ins> : d.op === "del" ? <del className="del" key={i}>{d.text}</del> : <span key={i}>{d.text}</span>))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- download */

function DownloadPanel() {
  const { project, built, running, newFromResume } = useDesk();
  if (!project.doc) return <p className="muted">Write a draft first.</p>;
  const base = fileBaseName(project.doc, project.research);
  const pdf = () => built && download(built.pdf, `${base}.pdf`, MIME.pdf);
  const docx = () => built && download(built.docx, `${base}.docx`, MIME.docx);
  return (
    <div>
      {!project.passed && (
        <p style={{ marginBottom: 10 }}>
          <span className="tag wait">Not passed</span> This draft has not passed review. You can still download it; check the review log first.
        </p>
      )}
      <p className="small muted" style={{ marginBottom: 10, overflowWrap: "anywhere" }}>
        {base}
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" disabled={!built || running} onClick={docx}>
          Download .docx
        </button>
        <button className="btn primary" disabled={!built || running} onClick={pdf}>
          Download .pdf
        </button>
        <button
          className="btn"
          disabled={!built || running}
          onClick={() => {
            docx();
            setTimeout(pdf, 400);
          }}
        >
          Download both
        </button>
      </div>
      <p className="muted small">
        Both files are built in your browser from the same text and layout. They carry no author, software or date information, and hidden characters are removed.
        {built?.adjusted ? " Paragraph spacing was tightened slightly so the last lines don't sit alone on a new page." : ""}
      </p>
      <hr />
      <button className="btn" disabled={running} onClick={newFromResume}>
        Use this resume for another program
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ steps */

export function Steps() {
  const { project, step, goto, built } = useDesk();
  const r = project.research;
  const steps: { id: StepId; title: string; state: string; done: boolean; body: React.ReactNode }[] = [
    { id: "intake", title: "Resume and program", state: project.facts ? "Done" : "", done: !!project.facts, body: <IntakePanel /> },
    { id: "facts", title: "Facts", state: project.facts ? `${project.facts.items.length} facts` : "", done: !!project.facts, body: <FactsPanel /> },
    {
      id: "requirements",
      title: "Requirements",
      state: r ? (r.status === "official" ? "Official" : "Default structure") : "",
      done: !!r,
      body: <RequirementsPanel />,
    },
    {
      id: "draft",
      title: "Draft and review",
      state: project.doc ? (project.passed ? "Passed" : "Not passed") : project.preHumanize ? "In progress" : "",
      done: project.passed,
      body: <DraftPanel />,
    },
    { id: "download", title: "Download", state: project.doc && built ? "Ready" : "", done: !!project.doc && !!built && project.passed, body: <DownloadPanel /> },
  ];
  return (
    <ol className="steplist">
      {steps.map((s, i) => (
        <li key={s.id}>
          <button className="stephead" aria-expanded={step === s.id} aria-controls={`step-${s.id}`} onClick={() => goto(s.id)}>
            <span className="n num">{i + 1}</span>
            <span className="t">{s.title}</span>
            <span className={`s ${s.done ? "done" : ""}`}>{s.state}</span>
          </button>
          {step === s.id && (
            <div className="stepbody" id={`step-${s.id}`}>
              {s.body}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
