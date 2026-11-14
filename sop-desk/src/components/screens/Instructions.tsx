"use client";

import { useState } from "react";
import type { DetailKind, ProgramDetail, ReqItem, ReqKind } from "@/lib/types";
import { KIND_LABEL, detailValue, refreshStatus } from "@/lib/requirements";
import { newId } from "@/lib/docmodel";
import { cleanHidden } from "@/lib/clean";
import { longDate } from "@/lib/client/labels";
import { runExtract, runQuestions } from "@/lib/client/pipeline";
import { AutoTextarea, Disclosure, ErrorBlock, ProgressPanel, ScreenHead, SourceLink } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";
import { findInstructions } from "./research";
import { writeStatement } from "./write";

const ADDABLE: ReqKind[] = ["prompt", "wordLimit", "pageLimit", "fontSize", "spacing", "margins", "font", "topic", "avoid", "docType"];
const DETAIL_LABEL: Record<DetailKind, string> = {
  university: "University",
  program: "Program",
  school: "School or college",
  country: "Country",
  concentration: "Track or concentration",
  course: "Course",
  lab: "Lab or center",
  facultyArea: "Faculty research area",
  feature: "Something special about the program",
};
const PLAIN_KIND: Partial<Record<ReqKind, string>> = {
  docType: "What to write",
  prompt: "Question to answer",
  wordLimit: "Length",
  pageLimit: "Length",
  font: "Layout",
  fontSize: "Layout",
  spacing: "Layout",
  margins: "Layout",
  formatOther: "Layout",
  fileType: "File",
  topic: "Topics to cover",
  avoid: "Don't",
  aiPolicy: "Rule about writing help",
};

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Evidence({ items }: { items: ReqItem[] }) {
  const sourced = items.filter((i) => i.quote);
  if (!sourced.length) return items.some((i) => i.origin === "user") ? <p className="hint">You entered this yourself.</p> : null;
  return (
    <Disclosure summary="Where this came from" plain>
      {sourced.map((i) => (
        <div key={i.id} className="evidence">
          <blockquote className="quote">&ldquo;{i.quote}&rdquo;</blockquote>
          <SourceLink url={i.sourceUrl} />
        </div>
      ))}
    </Disclosure>
  );
}

/** The plain summary: one row per kind of instruction, each with its evidence one tap away. */
function Summary({ items }: { items: ReqItem[] }) {
  const of = (...kinds: ReqKind[]) => items.filter((i) => kinds.includes(i.kind));
  const rows: { key: string; title: string; body: React.ReactNode; items: ReqItem[] }[] = [];
  const doc = of("docType");
  if (doc.length) rows.push({ key: "doc", title: "What to write", body: doc[0].text, items: doc });
  const prompts = of("prompt");
  if (prompts.length)
    rows.push({
      key: "prompts",
      title: "Questions to answer",
      body: (
        <ol className="bullets">
          {prompts.map((p) => (
            <li key={p.id}>
              {p.text}
              {p.max ? <span className="muted"> (about {p.max} words)</span> : null}
            </li>
          ))}
        </ol>
      ),
      items: prompts,
    });
  const length = of("wordLimit", "pageLimit");
  if (length.length)
    rows.push({
      key: "length",
      title: "Length",
      body: length
        .map((l) => {
          const unit = l.kind === "pageLimit" ? "page" : "word";
          if (l.min && l.max) return `${l.min} to ${l.max} ${unit}s in total`;
          if (l.max) return `at most ${l.max} ${unit}${l.max === 1 ? "" : "s"}`;
          return l.text;
        })
        .join("; "),
      items: length,
    });
  const layout = of("font", "fontSize", "spacing", "margins", "formatOther");
  if (layout.length) rows.push({ key: "layout", title: "Layout", body: layout.map((l) => l.text).join(", "), items: layout });
  const file = of("fileType");
  if (file.length) rows.push({ key: "file", title: "File", body: file.map((f) => f.text).join(", "), items: file });
  const topics = of("topic");
  if (topics.length)
    rows.push({
      key: "topics",
      title: "Topics to cover",
      body: (
        <ul className="bullets">
          {topics.map((t) => (
            <li key={t.id}>{t.text}</li>
          ))}
        </ul>
      ),
      items: topics,
    });
  const avoid = of("avoid");
  if (avoid.length)
    rows.push({
      key: "avoid",
      title: "Don't",
      body: (
        <ul className="bullets">
          {avoid.map((t) => (
            <li key={t.id}>{t.text}</li>
          ))}
        </ul>
      ),
      items: avoid,
    });
  return (
    <ul className="lines" data-testid="instructions-summary">
      {rows.map((r) => (
        <li key={r.key}>
          <h2 className="label">{r.title}</h2>
          <div className="wrap">{r.body}</div>
          <Evidence items={r.items} />
        </li>
      ))}
    </ul>
  );
}

export function AiRuleBox({ items }: { items: ReqItem[] }) {
  const rules = items.filter((i) => i.kind === "aiPolicy" && i.verified);
  if (!rules.length) return null;
  return (
    <div className="rule-box" role="note" aria-labelledby="ai-rule">
      <h2 id="ai-rule">This program has a rule about writing help</h2>
      {rules.map((r) => (
        <div key={r.id}>
          <blockquote className="quote">&ldquo;{r.quote || r.text}&rdquo;</blockquote>
          <SourceLink url={r.sourceUrl} />
        </div>
      ))}
      <p>Read it before you use this draft. Change anything that doesn&apos;t sound like you.</p>
    </div>
  );
}

/** "Something is wrong or missing": the full editor, for the few who need it. */
function Editor({ onDone }: { onDone: () => void }) {
  const { statement, update } = useDesk();
  const [kind, setKind] = useState<ReqKind>("prompt");
  const [text, setText] = useState("");
  const [max, setMax] = useState("");
  const [removed, setRemoved] = useState<ReqItem | null>(null);
  const r = statement!.research!;
  const edit = (mutate: (items: ReqItem[]) => void) =>
    update((p) => {
      mutate(p.research!.items);
      refreshStatus(p.research!);
    });
  const add = () => {
    const t = cleanHidden(text).text.trim();
    if (!t) return;
    const n = Math.max(0, Math.round(Number(max)) || 0);
    edit((items) =>
      items.push({
        id: newId("req"),
        kind,
        text: t,
        min: 0,
        max: ["wordLimit", "pageLimit", "prompt"].includes(kind) ? n : 0,
        normalized: t,
        quote: "",
        sourceUrl: "user",
        level: "user",
        verified: true,
        origin: "user",
      }),
    );
    setText("");
    setMax("");
  };
  return (
    <div className="section">
      <h2>Fix the instructions</h2>
      <p className="hint">Change, remove or add anything. Your statement will follow this list.</p>
      {removed && (
        <p className="notice" role="status">
          Removed.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              edit((items) => items.push(removed));
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      <ul className="lines section">
        {r.items.map((item) => (
          <li key={item.id}>
            <label className="label" htmlFor={`req-${item.id}`}>
              {PLAIN_KIND[item.kind] ?? KIND_LABEL[item.kind]}
            </label>
            <AutoTextarea
              id={`req-${item.id}`}
              className="short"
              value={item.text}
              onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.text = e.target.value))}
            />
            {["wordLimit", "pageLimit", "prompt"].includes(item.kind) && (item.min > 0 || item.max > 0 || item.kind !== "prompt") && (
              <div className="row">
                <label className="row">
                  At least{" "}
                  <input
                    type="number"
                    min={0}
                    value={item.min || ""}
                    onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.min = Math.max(0, Number(e.target.value) || 0)))}
                  />
                </label>
                <label className="row">
                  At most{" "}
                  <input
                    type="number"
                    min={0}
                    value={item.max || ""}
                    onChange={(e) => edit((items) => (items.find((x) => x.id === item.id)!.max = Math.max(0, Number(e.target.value) || 0)))}
                  />
                </label>
                <span className="muted">{item.kind === "pageLimit" ? "pages" : "words"}</span>
              </div>
            )}
            <button
              type="button"
              className="btn text"
              aria-label={`Remove: ${item.text.slice(0, 40)}`}
              onClick={() => {
                setRemoved(item);
                edit((items) => items.splice(items.findIndex((x) => x.id === item.id), 1));
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <Disclosure summary="Add an instruction">
        <div className="field">
          <label className="label" htmlFor="new-kind">
            Kind
          </label>
          <select id="new-kind" value={kind} onChange={(e) => setKind(e.target.value as ReqKind)}>
            {ADDABLE.map((k) => (
              <option key={k} value={k}>
                {k === "prompt" ? "Question to answer" : k === "wordLimit" ? "Length in words" : k === "pageLimit" ? "Length in pages" : (PLAIN_KIND[k] ?? KIND_LABEL[k])}
                {k === "fontSize" ? " (font size)" : k === "spacing" ? " (line spacing)" : k === "margins" ? " (margins)" : k === "font" ? " (font)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="new-text">
            What it says
          </label>
          <AutoTextarea id="new-text" className="short" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {["wordLimit", "pageLimit", "prompt"].includes(kind) && (
          <div className="field">
            <label className="label" htmlFor="new-max">
              At most ({kind === "pageLimit" ? "pages" : "words"})
            </label>
            <input id="new-max" type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
        )}
        <button type="button" className="btn" onClick={add}>
          Add instruction
        </button>
      </Disclosure>
      <div className="actions">
        <button type="button" className="btn primary" onClick={onDone}>
          Done editing
        </button>
      </div>
    </div>
  );
}

function ProgramDetails() {
  const { statement, update } = useDesk();
  const [kind, setKind] = useState<DetailKind>("course");
  const [value, setValue] = useState("");
  const r = statement!.research!;
  const edit = (mutate: (d: ProgramDetail[]) => void) =>
    update((p) => {
      mutate(p.research!.details);
      refreshStatus(p.research!);
    });
  return (
    <>
      <p className="hint">Your statement only names courses, labs and people that appear here.</p>
      <ul className="lines section">
        {r.details.map((d) => (
          <li key={d.id}>
            <div className="row between">
              <span className="wrap">
                <span className="muted">{DETAIL_LABEL[d.kind]}:</span> {d.value}
              </span>
              <button type="button" className="btn text" aria-label={`Remove: ${d.value}`} onClick={() => edit((ds) => ds.splice(ds.findIndex((x) => x.id === d.id), 1))}>
                Remove
              </button>
            </div>
            {d.quote && <blockquote className="quote">&ldquo;{d.quote}&rdquo;</blockquote>}
            <SourceLink url={d.sourceUrl} />
          </li>
        ))}
      </ul>
      <Disclosure summary="Add a program detail" plain>
        <div className="field">
          <label className="label" htmlFor="detail-kind">
            Kind
          </label>
          <select id="detail-kind" value={kind} onChange={(e) => setKind(e.target.value as DetailKind)}>
            {(Object.keys(DETAIL_LABEL) as DetailKind[])
              .filter((k) => k !== "country")
              .map((k) => (
                <option key={k} value={k}>
                  {DETAIL_LABEL[k]}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="detail-value">
            Name
          </label>
          <input id="detail-value" type="text" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const v = value.trim();
            if (!v) return;
            edit((ds) => ds.push({ id: newId("det"), kind, value: v, quote: "", sourceUrl: "user", verified: true, origin: "user" }));
            setValue("");
          }}
        >
          Add detail
        </button>
      </Disclosure>
    </>
  );
}

export function SearchLog() {
  const { statement } = useDesk();
  const g = statement!.research?.gather ?? statement!.gathered?.gather;
  if (!g) return null;
  return (
    <ul className="bullets hint">
      {g.queries.map((q, i) => (
        <li key={`q${i}`}>Searched for: {q}</li>
      ))}
      {g.pages
        .filter((p) => p.kind !== "pasted")
        .map((p) => (
          <li key={p.url} className="wrap">
            Read: <SourceLink url={p.url} label={p.url.replace(/^https?:\/\//, "")} />
          </li>
        ))}
      {g.fetchErrors.map((e, i) => (
        <li key={`e${i}`} className="wrap">
          Couldn&apos;t open {e.url || "a page"}
        </li>
      ))}
    </ul>
  );
}

function PasteBox({ label, hint, open }: { label: string; hint: string; open?: boolean }) {
  const { statement, update } = useDesk();
  return (
    <div className="field" hidden={!open}>
      <label className="label" htmlFor="pasted">
        {label}
      </label>
      <span className="hint" id="pasted-hint">
        {hint}
      </span>
      <AutoTextarea
        id="pasted"
        aria-describedby="pasted-hint"
        value={statement!.inputs.pastedInstructions}
        onChange={(e) => update((p) => (p.inputs.pastedInstructions = cleanHidden(e.target.value).text))}
      />
    </div>
  );
}

export function InstructionsScreen() {
  const { statement, getStatement, start, run, go, error, onboarding } = useDesk();
  const [editing, setEditing] = useState(false);
  if (!statement) return null;
  const r = statement.research;
  const step = stepFor("instructions", onboarding, statement);
  const running = !!run && (run.kind === "research" || run.kind === "write");
  const pasted = statement.inputs.pastedInstructions.trim();

  const usePasted = () =>
    start(
      "Reading the instructions you pasted",
      async (rt) => {
        await runExtract(rt, true);
        if (rt.get().questions === null) await runQuestions(rt);
      },
      { kind: "research" },
    );

  /** Continue to the questions if there are any, otherwise straight to writing. */
  const decide = () => {
    const s = getStatement();
    if (!s) return;
    if (s.questions?.length) {
      go("questions");
      return;
    }
    go("writing");
    start("Writing your statement", writeStatement(s.id), { kind: "write", after: () => go("result") });
  };
  const proceed = () => {
    if (statement.questions === null) start("Checking for questions", runQuestions, { kind: "research", after: decide });
    else decide();
  };

  /* ---------- research failed ---------- */
  if (!r) {
    const failed = !!error && error.kind === "research";
    return (
      <>
        <ScreenHead title={failed ? "We couldn't open that page" : "Find the instructions"} step={step} onBack={running ? null : () => go("program")}>
          {failed && <p className="intro">Some university sites block automatic visits. Nothing was guessed, and your details are saved.</p>}
          {!failed && !running && <p className="intro">We haven&apos;t looked at the program page yet.</p>}
        </ScreenHead>
        {failed && !running && (
          <>
            <ErrorBlock kinds={["research"]} headless />
            <PasteBox label="Or paste the instructions from the program's page" hint="Copy the statement instructions from the university's page and paste them here." open />
            <div className="actions tight">
              <button type="button" className="btn" onClick={usePasted} disabled={!pasted}>
                Use these instructions
              </button>
              <button type="button" className="btn text" onClick={() => go("program")}>
                Use a different link
              </button>
            </div>
          </>
        )}
        {!failed && !running && (
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => start("Finding the instructions", (rt) => findInstructions(rt), { kind: "research" })}>
              Find the instructions
            </button>
          </div>
        )}
        <ProgressPanel kinds={["research"]} />
      </>
    );
  }

  const university = detailValue(r.details, "university");
  const site = r.domains[0] ?? siteOf(r.programUrl);
  const items = r.items.filter((i) => i.verified);
  const official = r.status === "official";

  const details = (
    <div className="section">
      <h2 className="sr-only">More details</h2>
      <Disclosure summary={`What we'll mention about the program (${r.details.length})`}>
        <ProgramDetails />
      </Disclosure>
      {r.dropped.length > 0 && (
        <Disclosure summary={`Instructions we couldn't confirm (${r.dropped.length})`}>
          <p className="hint">These came up but could not be found word for word on the university&apos;s pages, so they are not used.</p>
          <ul className="bullets section">
            {r.dropped.map((d, i) => (
              <li key={i} className="wrap">
                {d.text}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      <Disclosure summary="Pages we searched and read">
        <SearchLog />
        <div className="actions tight">
          <button type="button" className="btn" disabled={running} onClick={() => start("Finding the instructions", (rt) => findInstructions(rt, true), { kind: "research" })}>
            Search the university&apos;s site again
          </button>
        </div>
      </Disclosure>
    </div>
  );

  /* ---------- nothing found ---------- */
  if (!official) {
    const pages = r.gather.pages.filter((p) => p.kind !== "pasted").length;
    return (
      <>
        <ScreenHead title="We didn't find instructions for this statement" step={step} onBack={running ? null : () => go("program")}>
          <p className="intro">
            We searched {site} and read {pages} page{pages === 1 ? "" : "s"}. If the application portal shows instructions, paste them here so your statement follows them.
          </p>
        </ScreenHead>
        <PasteBox label="The program's instructions" hint="Copy them from the application portal or the program's page." open />
        <ErrorBlock kinds={["research", "write"]} />
        {running ? (
          <ProgressPanel kinds={["research", "write"]} />
        ) : (
          <div className="actions">
            {pasted ? (
              <>
                <button type="button" className="btn primary" onClick={usePasted}>
                  Use these instructions
                </button>
                <button type="button" className="btn text" onClick={proceed}>
                  Continue with a standard layout
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={proceed}>
                Continue with a standard layout
              </button>
            )}
          </div>
        )}
        <p className="hint section">A standard layout has seven short sections: background, studies and projects, work, why this field, goals, why this university and a conclusion.</p>
        {details}
      </>
    );
  }

  /* ---------- found ---------- */
  return (
    <>
      <ScreenHead title={university ? `What ${university} asks for` : "What the program asks for"} step={step} onBack={running ? null : () => go("program")}>
        <p className="hint note">
          Found on {site} · checked {longDate(r.checkedAt)}
        </p>
      </ScreenHead>

      <AiRuleBox items={items} />

      {editing ? (
        <Editor onDone={() => setEditing(false)} />
      ) : (
        <>
          <Summary items={items.filter((i) => i.kind !== "aiPolicy")} />
          <ErrorBlock kinds={["research", "write"]} />
          {running ? (
            <ProgressPanel kinds={["research", "write"]} />
          ) : (
            <div className="actions">
              <button type="button" className="btn primary" onClick={proceed}>
                Looks right, continue
              </button>
              <button type="button" className="btn text" onClick={() => setEditing(true)}>
                Something is wrong or missing
              </button>
            </div>
          )}
        </>
      )}
      {details}
    </>
  );
}
