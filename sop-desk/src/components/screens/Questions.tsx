"use client";

import { useState } from "react";
import { isProgramSpecific, rememberAnswers } from "@/lib/client/profile";
import { AutoTextarea, ScreenHead } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";
import { writeStatement } from "./write";

export function QuestionsScreen() {
  const { statement, update, updateProfile, start, go, onboarding } = useDesk();
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  if (!statement) return null;
  const questions = statement.questions ?? [];

  const write = () => {
    // Answers the applicant chose to keep become their own details for later statements.
    updateProfile((p) => {
      rememberAnswers(p, questions, keep);
    });
    update((p) => p.questions?.forEach((q) => (q.skipped = !q.answer.trim())));
    go("writing");
    start("Writing your statement", writeStatement(statement.id), { kind: "write", after: () => go("result") });
  };

  return (
    <>
      <ScreenHead title="A few optional questions" step={stepFor("questions", onboarding, statement)} onBack={() => go("instructions")}>
        <p className="intro">Answer any you can. Leave a box empty to skip it. Anything you skip is left out, never invented. Short notes are fine.</p>
      </ScreenHead>

      {questions.map((q, i) => {
        const keepIt = keep[q.id] ?? !isProgramSpecific(q.text);
        return (
          <fieldset key={q.id} className="section">
            <legend className="label">
              {i + 1}. {q.text}
            </legend>
            <span className="hint" id={`${q.id}-why`}>
              Why we ask: {q.why.charAt(0).toLowerCase() + q.why.slice(1)}
            </span>
            <AutoTextarea
              id={q.id}
              className="short"
              aria-label={q.text}
              aria-describedby={`${q.id}-why`}
              value={q.answer}
              onChange={(e) => update((p) => (p.questions!.find((x) => x.id === q.id)!.answer = e.target.value))}
            />
            <label className="check">
              <input type="checkbox" checked={keepIt} onChange={(e) => setKeep((k) => ({ ...k, [q.id]: e.target.checked }))} />
              <span>Use this answer for future statements</span>
            </label>
          </fieldset>
        );
      })}

      <div className="actions">
        <button type="button" className="btn primary" onClick={write}>
          Write my statement
        </button>
        <p className="hint">This usually takes 3 to 6 minutes. Keep this tab open.</p>
      </div>
    </>
  );
}
