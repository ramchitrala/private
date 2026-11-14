"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocFormat, DocModel } from "@/lib/types";
import { SINGLE_LINE_FACTOR } from "@/lib/requirements";
import { bodyWords } from "@/lib/docmodel";
import { changedWords } from "@/lib/diff";
import { getPref, setPref } from "@/lib/client/store";
import { useDesk } from "./desk";

interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    destroy(): Promise<void>;
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }): { promise: Promise<void> };
      }>;
    }>;
  };
}

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    // Loaded from /public as a plain module so the bundler leaves it alone.
    const url = "/pdfjs/pdf.min.mjs";
    pdfjsPromise = (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<PdfJs>).then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return m;
    });
    pdfjsPromise.catch(() => (pdfjsPromise = null));
  }
  return pdfjsPromise;
}

/** Page view: the real PDF, rendered page by page. */
function PageView({ pdf }: { pdf: Uint8Array }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({ data: pdf.slice() });
        const d = await task.promise;
        const canvases: HTMLCanvasElement[] = [];
        const scale = Math.min(2, window.devicePixelRatio || 1) * 1.34;
        for (let i = 1; i <= d.numPages; i++) {
          const page = await d.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.round(viewport.width / (scale / 1.34))}px`;
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Page ${i} of ${d.numPages}`);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
          canvases.push(canvas);
        }
        if (!cancelled && holder.current) holder.current.replaceChildren(...canvases);
        await task.destroy();
        setFailed("");
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "The page view could not be drawn.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);
  return (
    <>
      {failed && <p className="muted small">Page view is unavailable here ({failed}). Text view shows the same document.</p>}
      <div className="pages" ref={holder} data-testid="pages" />
    </>
  );
}

const FAMILY: Record<DocFormat["font"], string> = {
  sans: '"Doc Sans", Arial, sans-serif',
  serif: '"Doc Serif", "Times New Roman", serif',
  calibri: '"Doc Calibri", Calibri, sans-serif',
};

/** Text view: the document's own type, with the words changed by the last edit marked. */
function TextView({ doc, prev, format }: { doc: DocModel; prev: DocModel | null; format: DocFormat }) {
  const line = SINGLE_LINE_FACTOR * format.lineMultiple;
  const para = (text: string, si: number, pi: number) => {
    const before = prev?.sections[si]?.paragraphs[pi];
    if (!prev || before === text) return text;
    if (before === undefined) return <mark>{text}</mark>;
    return changedWords(before, text).map((p, i) => (p.op === "add" ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>));
  };
  return (
    <div className="pages">
      <article className="sheet" data-testid="textview" style={{ fontFamily: FAMILY[format.font], fontSize: `${format.sizePt}pt`, lineHeight: line }}>
        <p className="doc-title" style={{ fontSize: `${format.titlePt}pt` }}>
          {doc.title}
        </p>
        <div className="doc-header" style={{ lineHeight: SINGLE_LINE_FACTOR * Math.min(format.lineMultiple, 1.2) }}>
          {doc.header.map((h, i) => (
            <p key={i}>{h.label ? <><strong>{h.label}:</strong> {h.value}</> : <strong>{h.value}</strong>}</p>
          ))}
        </div>
        {doc.sections.map((s, si) => (
          <section key={si}>
            {s.heading && (
              <p className="doc-heading" style={{ fontSize: `${format.headingPt}pt` }}>
                {s.heading}
              </p>
            )}
            {s.paragraphs.map((p, pi) => (
              <p key={pi} style={{ margin: `0 0 ${format.paraAfterPt}pt`, textIndent: format.firstLineIndentIn ? `${format.firstLineIndentIn}in` : undefined }}>
                {para(p, si, pi)}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}

export function Preview() {
  const { project, built, format, running } = useDesk();
  const [view, setView] = useState<"page" | "text">("page");
  useEffect(() => {
    if (getPref("view") === "text") setView("text");
  }, []);
  const choose = (v: "page" | "text") => {
    setView(v);
    setPref("view", v);
  };
  const doc = project.doc ?? project.preHumanize;
  const words = useMemo(() => (doc ? bodyWords(doc) : 0), [doc]);

  if (!doc) {
    return (
      <div className="pages">
        <div className="sheet placeholder">
          <p>
            Your statement will appear here.
            <br />
            <span className="small">Start with your resume and the program&apos;s official page.</span>
          </p>
        </div>
      </div>
    );
  }
  const fmt = built?.format ?? format;
  return (
    <>
      <div className="previewbar">
        <div className="seg" role="group" aria-label="Preview">
          <button aria-pressed={view === "page"} onClick={() => choose("page")}>
            Page view
          </button>
          <button aria-pressed={view === "text"} onClick={() => choose("text")}>
            Text view
          </button>
        </div>
        <span className="muted small num">
          {words} words{built ? ` · ${built.pageCount} page${built.pageCount > 1 ? "s" : ""}` : ""}
        </span>
        {!project.doc && <span className="tag wait">First draft, before the humanizer pass</span>}
        {project.doc && (
          <span className={`tag ${project.passed ? "ok" : "wait"}`}>{project.passed ? "Passed review" : running ? "In review" : "Not passed yet"}</span>
        )}
      </div>
      {view === "page" && built && project.doc ? <PageView pdf={built.pdf} /> : <TextView doc={doc} prev={project.doc ? project.prevDoc : null} format={fmt} />}
    </>
  );
}
