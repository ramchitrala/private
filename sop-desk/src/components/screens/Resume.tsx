"use client";

import { useRef, useState } from "react";
import { cleanHidden } from "@/lib/clean";
import { hasResume } from "@/lib/client/store";
import { runFacts } from "@/lib/client/pipeline";
import type { Profile } from "@/lib/types";
import { AutoTextarea, Disclosure, ErrorBlock, ErrorSummary, ProgressPanel, ScreenHead, type FieldProblem } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";

const MAX_BYTES = 3 * 1024 * 1024;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * "Start with your resume" on a first visit, or "Replace your resume" from Your resume and details.
 * The resume is kept on a draft copy until it has been read, so a failed read never loses the old one.
 */
export function ResumeScreen() {
  const { profile, onboarding, statement, start, run, go, updateProfile, setProfile, announce } = useDesk();
  const replacing = !onboarding && hasResume(profile);
  const [draft, setDraft] = useState(() => ({
    kind: replacing ? ("" as Profile["resume"]["kind"]) : (profile?.resume.kind ?? ""),
    name: replacing ? "" : (profile?.resume.name ?? ""),
    data: replacing ? "" : (profile?.resume.data ?? ""),
    text: replacing ? "" : (profile?.resume.text ?? ""),
  }));
  const [remember, setRemember] = useState(profile?.remember ?? true);
  const [pasteOpen, setPasteOpen] = useState(draft.kind === "text");
  const [fileProblem, setFileProblem] = useState("");
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [cleaned, setCleaned] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const running = run?.kind === "resume";
  const has = draft.kind === "pdf" || draft.kind === "docx" ? !!draft.data : draft.text.trim().length > 0;
  const resumeCount = profile?.facts.items.filter((f) => f.source === "resume").length ?? 0;

  const onFile = async (file: File | undefined) => {
    setFileProblem("");
    setProblems([]);
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") return setFileProblem("Use a PDF or Word file, or paste the text instead.");
    if (file.size > MAX_BYTES) return setFileProblem("That file is over 3 MB. Try a smaller file, or paste the text instead.");
    const data = toBase64(await file.arrayBuffer());
    setDraft({ kind: ext, name: file.name, data, text: "" });
    announce(`${file.name} added`);
  };

  const read = () => {
    // Put the new resume into the profile, then read it. On a replacement, the old details read
    // from a resume are dropped first; anything the applicant typed stays.
    const previous = profile ? structuredClone(profile) : null;
    updateProfile((p) => {
      p.resume = { kind: draft.kind, name: draft.kind === "text" ? "Pasted resume text" : draft.name, data: draft.data, text: draft.text, savedAt: new Date().toISOString() };
      p.remember = remember;
      if (replacing) {
        p.facts.items = p.facts.items.filter((f) => f.source === "user");
        for (const id of Object.keys(p.factOrigins)) if (!p.facts.items.some((f) => f.id === id)) delete p.factOrigins[id];
      }
    });
    start("Reading your resume", runFacts, {
      kind: "resume",
      target: "profile",
      after: () => {
        if (replacing && previous) {
          window.sessionStorage?.setItem("sopdesk.undoResume", JSON.stringify(previous));
          announce("Resume replaced.");
        }
        go(replacing ? "profile" : "details");
      },
      onError: () => {
        // Reading failed: keep the details from before, so nothing is lost.
        if (replacing && previous) setProfile(previous);
      },
    });
  };

  const submit = () => {
    if (!has) {
      setProblems([{ id: draft.kind === "text" || pasteOpen ? "resume-text" : "resume-upload", message: "Upload your resume or paste its text first." }]);
      return;
    }
    if (replacing && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    read();
  };

  const step = stepFor("resume", onboarding, statement);
  return (
    <>
      <ScreenHead
        title={replacing ? "Replace your resume" : "Start with your resume"}
        step={step}
        onBack={replacing ? () => go("profile") : null}
      >
        <p className="intro">
          {replacing
            ? "Your statements will use the details we read from your new resume."
            : "SOP Desk reads your resume to write your statements. You only add it once."}
        </p>
      </ScreenHead>

      <ErrorSummary problems={problems} />

      <div className="field">
        <span className="label" id="resume-label">
          Your resume
        </span>
        <span className="hint" id="resume-hint">
          PDF or Word file, up to 3 MB.
        </span>
        {draft.data ? (
          <div className="row">
            <span className="wrap">{draft.name}</span>
            <button type="button" className="btn text" onClick={() => fileInput.current?.click()}>
              Replace
            </button>
          </div>
        ) : (
          <button
            type="button"
            id="resume-upload"
            className="btn block"
            aria-describedby={`resume-hint${fileProblem ? " resume-file-error" : ""}`}
            aria-invalid={problems.length && !pasteOpen ? true : undefined}
            onClick={() => fileInput.current?.click()}
          >
            Upload your resume
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          data-testid="resume-file"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {fileProblem && (
          <span className="field-error" id="resume-file-error" role="alert">
            {fileProblem}
          </span>
        )}
      </div>

      {!draft.data && (
        <Disclosure summary="Paste the text instead" open={pasteOpen} onToggle={setPasteOpen}>
          <div className="field">
            <label className="label" htmlFor="resume-text">
              Your resume text
            </label>
            <AutoTextarea
              id="resume-text"
              value={draft.text}
              aria-invalid={problems.length && pasteOpen ? true : undefined}
              onChange={(e) => {
                // Pasted resumes often carry hidden characters; they are removed on the way in.
                const report = cleanHidden(e.target.value);
                setCleaned(report.removed + report.spacesNormalized);
                setDraft({ kind: report.text.trim() ? "text" : "", name: "", data: "", text: report.text });
                setProblems([]);
              }}
            />
            {cleaned > 0 && <span className="hint">Removed {cleaned} hidden or unusual characters.</span>}
          </div>
        </Disclosure>
      )}

      <p className="hint section">Your resume is sent to an AI service to be read, and saved only in this browser.</p>

      <Disclosure summary="Using a shared computer?" plain>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            Remember my resume on this computer
            <span className="hint block-line">
              Turn this off on a shared or public computer. Closing this tab will then clear it.
            </span>
          </span>
        </label>
      </Disclosure>

      {confirmReplace && !running && (
        <div className="notice" role="group" aria-labelledby="replace-q">
          <p id="replace-q">
            <strong>Read your new resume?</strong>
          </p>
          <p>
            Your corrections and additions stay. {resumeCount} detail{resumeCount === 1 ? "" : "s"} read from your old resume will be replaced. Statements you
            already wrote keep the details they used.
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={read}>
              Read my new resume
            </button>
            <button type="button" className="btn text" onClick={() => go("profile")}>
              Keep my current resume
            </button>
          </div>
        </div>
      )}

      <ErrorBlock kinds={["resume"]}>
        <button type="button" className="btn text" onClick={() => setPasteOpen(true)}>
          Paste the text instead
        </button>
      </ErrorBlock>

      {running ? (
        <ProgressPanel kinds={["resume"]} />
      ) : (
        !confirmReplace && (
          <div className="actions">
            <button type="button" className="btn primary" onClick={submit}>
              Continue
            </button>
          </div>
        )
      )}
    </>
  );
}
