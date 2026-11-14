"use client";

import { useState } from "react";
import { shortDate, statementStatus, statementTitle } from "@/lib/client/labels";
import { detailsChangedSince, makeBackup } from "@/lib/client/store";
import { download } from "@/lib/client/files";
import { ScreenHead } from "../ui";
import { useDesk } from "../ctx";

export function Home({ migrated, onMigratedSeen }: { migrated: boolean; onMigratedSeen: () => void }) {
  const { profile, statements, openStatement, startStatement, removeStatement, go, setOnboarding } = useDesk();
  const [confirming, setConfirming] = useState("");
  const count = profile?.facts.items.length ?? 0;

  const backup = () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeBackup(profile, statements), null, 1));
    download(bytes, `SOP Desk backup ${new Date().toISOString().slice(0, 10)}.sopdesk.json`, "application/json");
  };

  return (
    <>
      <ScreenHead title="My statements">
        {profile && (
          <p className="resume-line note">
            Your resume: <span className="wrap">{profile.resume.name || "pasted text"}</span>
            {profile.resume.savedAt ? ` · saved ${shortDate(profile.resume.savedAt)}` : ""} · {count} detail{count === 1 ? "" : "s"} ·{" "}
            <button type="button" className="link-btn" onClick={() => go("profile")}>
              Change
            </button>
          </p>
        )}
      </ScreenHead>

      {migrated && (
        <div className="notice">
          <p>We saved your resume and details from your latest statement, so you won&apos;t need to add them again.</p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                onMigratedSeen();
                go("profile");
              }}
            >
              Check them
            </button>
            <button type="button" className="btn text" onClick={onMigratedSeen}>
              They look fine
            </button>
          </div>
        </div>
      )}

      <div className="actions flush">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setOnboarding(false);
            startStatement();
          }}
        >
          Start a new statement
        </button>
      </div>

      <section className="section" aria-labelledby="h-list">
        {statements.length ? (
          <>
            <h2 id="h-list">Your statements</h2>
            <ul className="statements">
              {statements.map((p) => {
                const { program, university } = statementTitle(p);
                const status = statementStatus(p);
                return (
                  <li key={p.id}>
                    <button type="button" className="statement-link" onClick={() => openStatement(p.id)}>
                      <span className="t">{program}</span>
                      <span className="s">
                        {[university, status, shortDate(p.updatedAt)].filter(Boolean).join(" · ")}
                      </span>
                      {detailsChangedSince(p, profile) && <span className="s">Your details changed after this was written</span>}
                    </button>
                    {confirming === p.id ? null : (
                      <button type="button" className="btn text" aria-label={`Delete statement for ${program}`} onClick={() => setConfirming(p.id)}>
                        Delete
                      </button>
                    )}
                    {confirming === p.id && (
                      <div className="confirm" role="group" aria-label="Confirm delete">
                        <p>Delete the statement for {program}? Its drafts and versions will be gone. Your resume stays.</p>
                        <div className="row">
                          <button
                            type="button"
                            className="btn danger"
                            onClick={async () => {
                              await removeStatement(p.id);
                              setConfirming("");
                            }}
                          >
                            Delete it
                          </button>
                          <button type="button" className="btn text" onClick={() => setConfirming("")} autoFocus>
                            Keep it
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted" id="h-list">
            You haven&apos;t written a statement yet.
          </p>
        )}
      </section>

      <p className="hint section">
        Saved only in this browser.{" "}
        <button type="button" className="link-btn" onClick={backup}>
          Download a backup
        </button>
      </p>
    </>
  );
}
