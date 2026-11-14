"use client";

import { useEffect, useRef, useState } from "react";
import type { DocFormat, DocModel } from "@/lib/types";
import { SINGLE_LINE_FACTOR } from "@/lib/requirements";
import { changedWords } from "@/lib/diff";

// The statement as it will print: "Easy to read" is real text in the document's own fonts,
// "As printed" draws the actual PDF pages.

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
export function PageView({ pdf }: { pdf: Uint8Array }) {
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
      {failed && <p className="hint">The printed view can&apos;t be shown here. &ldquo;Easy to read&rdquo; shows the same text.</p>}
      <div className="pages" ref={holder} data-testid="pages" aria-hidden="true" />
    </>
  );
}

const FAMILY: Record<DocFormat["font"], string> = {
  sans: '"Doc Sans", Arial, sans-serif',
  serif: '"Doc Serif", "Times New Roman", serif',
  calibri: '"Doc Calibri", Calibri, sans-serif',
};

/** Text view: the document's own type, with the words changed by the last edit marked. */
export function TextView({ doc, prev, format }: { doc: DocModel; prev: DocModel | null; format: DocFormat }) {
  const line = SINGLE_LINE_FACTOR * format.lineMultiple;
  const para = (text: string, si: number, pi: number) => {
    const before = prev?.sections[si]?.paragraphs[pi];
    if (!prev || before === text) return text;
    if (before === undefined)
      return (
        <mark>
          <span className="sr-only">changed: </span>
          {text}
        </mark>
      );
    return changedWords(before, text).map((p, i) =>
      p.op === "add" ? (
        <mark key={i}>
          <span className="sr-only">changed: </span>
          {p.text}
        </mark>
      ) : (
        <span key={i}>{p.text}</span>
      ),
    );
  };
  return (
    <div className="pages">
      <article className="sheet" data-testid="textview" style={{ fontFamily: FAMILY[format.font], fontSize: `${format.sizePt}pt`, lineHeight: line }}>
        <h2 className="doc-title" style={{ fontSize: `${format.titlePt}pt` }}>
          {doc.title}
        </h2>
        <div className="doc-header" style={{ lineHeight: SINGLE_LINE_FACTOR * Math.min(format.lineMultiple, 1.2) }}>
          {doc.header.map((h, i) => (
            <p key={i}>{h.label ? <><strong>{h.label}:</strong> {h.value}</> : <strong>{h.value}</strong>}</p>
          ))}
        </div>
        {doc.sections.map((s, si) => (
          <section key={si}>
            {s.heading && (
              <h3 className="doc-heading" style={{ fontSize: `${format.headingPt}pt` }}>
                {s.heading}
              </h3>
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

