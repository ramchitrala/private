"use client";

import { useEffect, useState } from "react";
import type { FactCategory, FactItem, Profile } from "@/lib/types";
import { FACT_CATEGORIES } from "@/lib/types";
import { cleanHidden } from "@/lib/clean";
import { newId } from "@/lib/docmodel";
import { shortDate } from "@/lib/client/labels";
import { deleteProfile, originOf } from "@/lib/client/store";
import { AutoTextarea, Disclosure, ScreenHead } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";

const GROUP: Record<FactCategory, string> = {
  education: "Education",
  experience: "Work experience",
  projects: "Projects",
  skills: "Skills",
  certifications: "Certifications",
  awards: "Awards",
  other: "Other",
};

const ORIGIN_TAG = { resume: "", added: "added by you", answer: "from your answer", change: "from a change you asked for" } as const;

/**
 * "Check your details" on a first visit, and "Your resume and details" from the menu.
 * Details read from the resume are shown as plain lines; each group can be edited.
 */
export function DetailsScreen({ mode }: { mode: "onboarding" | "profile" }) {
  const { profile, updateProfile, setProfile, onboarding, statement, go, startStatement, announce } = useDesk();
  const [editing, setEditing] = useState<FactCategory | "">("");
  const [adding, setAdding] = useState("");
  const [removed, setRemoved] = useState<{ item: FactItem; origin: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [undoResume, setUndoResume] = useState<Profile | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("sopdesk.undoResume");
      if (raw && mode === "profile") setUndoResume(JSON.parse(raw) as Profile);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 10000);
    return () => clearTimeout(t);
  }, [removed]);

  if (!profile) return null;
  const facts = profile.facts;
  const setFact = (id: string, text: string) =>
    updateProfile((p) => {
      const f = p.facts.items.find((x) => x.id === id);
      if (!f) return;
      f.text = text;
      // Editing a detail makes it the applicant's own, so reading the resume again keeps it.
      if (f.source !== "user") {
        f.source = "user";
        p.factOrigins[f.id] = "added";
      }
      p.version += 1;
    });

  const remove = (item: FactItem) => {
    const origin = profile.factOrigins[item.id] ?? "";
    updateProfile((p) => {
      p.facts.items = p.facts.items.filter((x) => x.id !== item.id);
      delete p.factOrigins[item.id];
      p.version += 1;
    });
    setRemoved({ item, origin });
    announce("Removed. Undo is available.");
  };

  const add = () => {
    const text = cleanHidden(adding).text.trim();
    if (!text) return;
    updateProfile((p) => {
      const item: FactItem = { id: newId("fact"), category: "other", text, source: "user" };
      p.facts.items.push(item);
      p.factOrigins[item.id] = "added";
      p.version += 1;
    });
    setAdding("");
    announce("Added to your details.");
  };

  const confirm = () => {
    updateProfile((p) => (p.factsConfirmedAt = new Date().toISOString()));
    startStatement();
  };

  const step = mode === "onboarding" ? stepFor("details", onboarding, statement) : null;
  const title = mode === "onboarding" ? "Check your details" : "Your resume and details";

  return (
    <>
      <ScreenHead title={title} step={step} onBack={mode === "onboarding" ? () => go("resume") : () => go("home")} backLabel={mode === "onboarding" ? "Back" : "Back to My statements"}>
        <p className="intro">This is what we read from your resume. Your statements will use only these details.</p>
      </ScreenHead>

      {mode === "profile" && (
        <div className="notice">
          <p>
            <span className="wrap">{profile.resume.name || "Pasted resume text"}</span>
            {profile.resume.savedAt ? ` · saved ${shortDate(profile.resume.savedAt)}` : ""}
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => go("resume")}>
              Replace your resume
            </button>
          </div>
          {undoResume && (
            <p>
              Resume replaced.{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setProfile({ ...undoResume, version: (profile.version ?? 0) + 1 });
                  window.sessionStorage.removeItem("sopdesk.undoResume");
                  setUndoResume(null);
                  announce("Your old resume and details are back.");
                }}
              >
                Undo
              </button>
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="your-name">
          Your name
        </label>
        <input
          id="your-name"
          type="text"
          autoComplete="name"
          value={facts.applicantName}
          onChange={(e) => updateProfile((p) => (p.facts.applicantName = e.target.value))}
        />
      </div>

      {removed && (
        <p className="notice" role="status">
          Removed.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              updateProfile((p) => {
                p.facts.items.push(removed.item);
                if (removed.origin) p.factOrigins[removed.item.id] = removed.origin as never;
                p.version += 1;
              });
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </p>
      )}

      {FACT_CATEGORIES.map((cat) => {
        const items = facts.items.filter((f) => f.category === cat);
        if (!items.length) return null;
        const isEditing = editing === cat;
        return (
          <section key={cat} className="section" aria-labelledby={`h-${cat}`}>
            <div className="row between">
              <h2 id={`h-${cat}`}>{GROUP[cat]}</h2>
              {!isEditing && (
                <button type="button" className="btn text" aria-label={`Edit ${GROUP[cat]}`} onClick={() => setEditing(cat)}>
                  Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <>
                <ul className="lines">
                  {items.map((f, i) => (
                    <li key={f.id}>
                      <label className="label" htmlFor={`fact-${f.id}`}>
                        {GROUP[cat]} {i + 1} of {items.length}
                      </label>
                      <AutoTextarea id={`fact-${f.id}`} className="short" value={f.text} onChange={(e) => setFact(f.id, e.target.value)} />
                      <button type="button" className="btn text" aria-label={`Remove: ${f.text.slice(0, 40)}`} onClick={() => remove(f)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="actions tight">
                  <button type="button" className="btn" onClick={() => setEditing("")}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <ul className="bullets">
                {items.map((f) => {
                  const tag = ORIGIN_TAG[originOf(profile, f.id, f.source)];
                  return (
                    <li key={f.id} className="wrap">
                      {f.text} {tag && <span className="tag">({tag})</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <div className="section">
        <Disclosure summary="Add something your resume leaves out">
          <div className="field">
            <label className="label" htmlFor="add-detail">
              What should we add?
            </label>
            <span className="hint" id="add-detail-hint">
              For example: Regional Fellowship, 2024. Short notes are fine.
            </span>
            <AutoTextarea id="add-detail" className="short" aria-describedby="add-detail-hint" value={adding} onChange={(e) => setAdding(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={add}>
            Add
          </button>
        </Disclosure>
        <Disclosure summary="Match my writing voice (optional)">
          <div className="field">
            <label className="label" htmlFor="voice">
              A paragraph you wrote yourself
            </label>
            <span className="hint" id="voice-hint">
              We use it only to match how you write. Nothing is copied from it.
            </span>
            <AutoTextarea
              id="voice"
              aria-describedby="voice-hint"
              value={profile.voiceSample}
              onChange={(e) => updateProfile((p) => (p.voiceSample = cleanHidden(e.target.value).text))}
            />
          </div>
        </Disclosure>
      </div>

      {mode === "onboarding" ? (
        <div className="actions">
          <button type="button" className="btn primary" onClick={confirm}>
            Looks right
          </button>
        </div>
      ) : (
        <div className="section">
          {confirmDelete ? (
            <div className="confirm">
              <p>Delete your resume and details? Your statements stay. The next new statement will ask for your resume again.</p>
              <div className="row">
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    await deleteProfile();
                    setProfile(null);
                    window.location.reload();
                  }}
                >
                  Delete them
                </button>
                <button type="button" className="btn text" onClick={() => setConfirmDelete(false)}>
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn text" onClick={() => setConfirmDelete(true)}>
              Delete my resume and details
            </button>
          )}
        </div>
      )}
    </>
  );
}
