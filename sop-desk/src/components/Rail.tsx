"use client";

import { useMemo, useState } from "react";
import { KIND_LABEL, checklist, sectionLimits } from "@/lib/requirements";
import { lintDoc, lintIssueCount } from "@/lib/lint";
import { diffText } from "@/lib/diff";
import { runChatEdit } from "@/lib/client/pipeline";
import { useDesk } from "./desk";

const OUTCOME: Record<string, string> = {
  "applied-exact": "Applied word for word",
  "applied-writer": "Applied by the writer",
  declined: "Declined",
  open: "Not applied",
};

export function Rail({ tab }: { tab: "steps" | "checklist" | "review" | "chat" }) {
  const { project, format, built, running, start, info } = useDesk();
  const [request, setRequest] = useState("");
  const doc = project.doc;
  const fmt = built?.format ?? format;
  const pages = built?.pageCount ?? 0;
  const rows = useMemo(() => checklist(project.research, doc, fmt, pages, project.passed), [project.research, doc, fmt, pages, project.passed]);
  const lint = useMemo(() => (doc ? lintDoc(doc, sectionLimits(project.research, fmt)) : null), [doc, project.research, fmt]);
  const totals = project.runs.reduce((t, r) => ({ i: t.i + r.inputTokens, o: t.o + r.outputTokens }), { i: 0, o: 0 });

  const send = () => {
    const text = request.trim();
    if (!text) return;
    setRequest("");
    start("Edit request", (rt) => runChatEdit(rt, text));
  };

  return (
    <>
      <div className="rail-part" data-hidden={tab !== "checklist" && tab !== "steps"}>
        <section className="block" aria-labelledby="h-check">
          <h2 className="section" id="h-check">
            Requirements
          </h2>
          {!project.research ? (
            <p className="muted small">Not searched yet.</p>
          ) : rows.length === 0 ? (
            <p className="muted small">{project.research.statusLine}</p>
          ) : (
            <ul className="itemlist">
              {rows.map((row) => (
                <li key={row.item.id}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="small muted">{KIND_LABEL[row.item.kind]}</span>
                    <span className={`tag ${row.met === true ? "ok" : row.met === false ? "no" : "wait"}`}>{row.met === true ? "Met" : row.met === false ? "Not met" : doc ? "Reviewer" : "Waiting"}</span>
                  </div>
                  <div style={{ overflowWrap: "anywhere" }}>{row.item.text}</div>
                  <div className="small muted num">{row.note}</div>
                  {row.item.sourceUrl.startsWith("http") && (
                    <a className="src" href={row.item.sourceUrl} target="_blank" rel="noreferrer noopener">
                      Source
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block" aria-labelledby="h-counts">
          <h2 className="section" id="h-counts">
            Counts
          </h2>
          {!lint ? (
            <p className="muted small">No draft yet.</p>
          ) : (
            <dl className="counts num">
              <dt>Words</dt>
              <dd>
                {lint.wordCount}
                {fmt.wordMax ? ` / ${fmt.wordMin ? `${fmt.wordMin}–` : ""}${fmt.wordMax}` : ""}
              </dd>
              <dt>Pages</dt>
              <dd>
                {pages || "–"}
                {fmt.pageMax ? ` / ${fmt.pageMax}` : ""}
              </dd>
              {lint.perSection.filter((s) => s.limit > 0).map((s, i) => (
                <FragmentRow key={i} label={`Section ${i + 1}`} value={`${s.words} / ${s.limit}`} />
              ))}
              <dt>Layout</dt>
              <dd>
                {fmt.sizePt} pt, {fmt.lineMultiple >= 2 ? "double" : fmt.lineMultiple >= 1.5 ? "1.5" : "single"}
              </dd>
              <dt>Style flags</dt>
              <dd>{lintIssueCount(lint)}</dd>
            </dl>
          )}
          {lint && lintIssueCount(lint) > 0 && (
            <ul className="small muted" style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {lint.emDashes + lint.enDashes > 0 && <li>{lint.emDashes + lint.enDashes} dashes</li>}
              {lint.stockWords.map((w) => (
                <li key={w.word}>
                  &ldquo;{w.word}&rdquo; × {w.count}
                </li>
              ))}
              {lint.contrastPatterns.length > 0 && <li>{lint.contrastPatterns.length} &ldquo;not just … but&rdquo; patterns</li>}
              {lint.oneSentenceClosers.length > 0 && <li>{lint.oneSentenceClosers.length} one-sentence closing paragraphs</li>}
            </ul>
          )}
        </section>
      </div>

      <div className="rail-part" data-hidden={tab !== "review" && tab !== "steps"}>
        <section className="block" aria-labelledby="h-review">
          <h2 className="section" id="h-review">
            Review log
          </h2>
          {project.rounds.length === 0 ? (
            <p className="muted small">No review yet.</p>
          ) : (
            project.rounds.map((r) => (
              <div className="round" key={r.round}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Round {r.round}</strong>
                  <span className={`tag ${r.verdict === "NO_CORRECTIONS" && r.confidence === "HIGH" ? "ok" : "wait"}`}>
                    {r.verdict === "NO_CORRECTIONS" ? "No corrections" : `${r.outcomes.length} correction${r.outcomes.length === 1 ? "" : "s"}`} · {r.confidence.toLowerCase()}
                  </span>
                </div>
                <div className="small muted num">
                  {r.wordCount} words, {r.pageCount} page{r.pageCount === 1 ? "" : "s"}
                </div>
                {r.outcomes.map((o) => (
                  <div className="fix" key={o.correction.id}>
                    <div>
                      <strong>{o.correction.id}.</strong> {o.correction.severity === "MUST_FIX" ? "Must fix" : "Should fix"} · {o.correction.category}
                    </div>
                    <div>{o.correction.reason}</div>
                    <div>
                      <del className="del">{o.correction.currentText}</del> <ins className="add">{o.correction.replacementText || "(removed)"}</ins>
                    </div>
                    <div className="muted">
                      {OUTCOME[o.outcome]}
                      {o.outcome === "declined" ? ` because ${o.note}` : o.outcome === "open" ? `: ${o.note}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>

        <section className="block" aria-labelledby="h-runs">
          <details>
            <summary>
              <h2 className="section" id="h-runs" style={{ display: "inline" }}>
                Run details
              </h2>
            </summary>
            <p className="small muted num" style={{ margin: "6px 0" }}>
              {info.model} · {totals.i.toLocaleString()} tokens in, {totals.o.toLocaleString()} out
            </p>
            {project.runs.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="runs num">
                  <thead>
                    <tr>
                      <th scope="col">Stage</th>
                      <th scope="col">In</th>
                      <th scope="col">Out</th>
                      <th scope="col">Sec</th>
                      <th scope="col">Web</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.runs.map((r, i) => (
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
          </details>
        </section>
      </div>

      <div className="rail-part" data-hidden={tab !== "chat" && tab !== "steps"}>
        <section className="block" aria-labelledby="h-chat">
          <h2 className="section" id="h-chat">
            Changes
          </h2>
          {project.chat.length > 0 && (
            <ul className="chatlog">
              {project.chat.map((m) => (
                <li key={m.id} className={m.role}>
                  <div className="small muted">{m.role === "user" ? "You asked" : "Result"}</div>
                  <div>{m.text}</div>
                  {m.before !== undefined && m.after !== undefined && (
                    <details>
                      <summary className="small">Show what changed</summary>
                      <div className="diffbox">
                        {diffText(m.before, m.after).map((d, i) =>
                          d.op === "add" ? <ins className="add" key={i}>{d.text}</ins> : d.op === "del" ? <del className="del" key={i}>{d.text}</del> : <span key={i}>{d.text}</span>,
                        )}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <label className="field" style={{ marginBottom: 8 }}>
            <span>Ask for a change</span>
            <textarea
              rows={3}
              value={request}
              disabled={!doc}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={doc ? "For example: shorten the second paragraph" : "Available once there is a draft"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
            />
          </label>
          <button className="btn" disabled={!doc || running || !request.trim()} onClick={send}>
            Make change
          </button>
          <p className="muted small" style={{ marginTop: 6 }}>
            Each change is made with the smallest edit, then reviewed again (up to {info.maxEditReviewRounds} rounds).
          </p>
        </section>
      </div>
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
