"use client";

import { useState } from "react";
import { checkProgramLink, parseExtraLinks, registrableDomain } from "@/lib/domains";
import { isResearchError, shortDate } from "@/lib/client/labels";
import { AutoTextarea, Disclosure, ErrorBlock, ErrorSummary, ProgressPanel, ScreenHead, Stopped, type FieldProblem } from "../ui";
import { useDesk } from "../ctx";
import { stepFor } from "./steps";
import { findInstructions } from "./research";

export function ProgramScreen() {
  const { statement, update, profile, updateProfile, start, run, go, onboarding, announce } = useDesk();
  const [checked, setChecked] = useState(false);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  if (!statement || !profile) return null;
  const { inputs } = statement;
  const trusted = [...new Set([...statement.confirmedDomains, ...profile.trustedSites])];
  const link = inputs.programUrl.trim() ? checkProgramLink(inputs.programUrl, trusted) : null;
  const extras = parseExtraLinks(inputs.extraLinks);
  const running = run?.kind === "research";
  const showLink = checked && link && !link.ok;
  const linkMessage = !inputs.programUrl.trim()
    ? "Paste the link to the program's page."
    : link && !link.ok
      ? link.reason === "invalid"
        ? "That doesn't look like a web link. It should start with https://"
        : link.reason === "aggregator"
          ? `${registrableDomain(inputs.programUrl)} is a listing or discussion site, not the university. Open the program page on the university's own website and copy that address.`
          : ""
      : "";
  const unsure = checked && link && !link.ok && link.reason === "unsure";
  const invalid = checked && !!linkMessage && !unsure;

  const trust = () => {
    const d = registrableDomain(inputs.programUrl);
    if (!d) return;
    update((p) => (p.confirmedDomains = [...new Set([...p.confirmedDomains, d])]));
    updateProfile((pr) => (pr.trustedSites = [...new Set([...pr.trustedSites, d])]));
    setChecked(false);
  };

  const submit = () => {
    setChecked(true);
    if (!link || !link.ok) {
      setProblems(unsure || (link && !link.ok && link.reason === "unsure") ? [] : [{ id: "program-link", message: linkMessage || "Check the link to the program's page." }]);
      if (link && !link.ok && link.reason === "unsure") document.getElementById("site-question")?.focus();
      return;
    }
    setProblems([]);
    if (inputs.entryTerm.trim() && inputs.entryTerm.trim() !== profile.lastEntryTerm) updateProfile((p) => (p.lastEntryTerm = inputs.entryTerm.trim()));
    update((p) => (p.confirmedDomains = [...new Set([...p.confirmedDomains, ...profile.trustedSites])]));
    start("Finding the instructions", (rt) => findInstructions(rt), {
      kind: "research",
      after: () => go("instructions"),
      onError: (code, failStage) => {
        if (isResearchError(code, failStage)) go("instructions");
      },
    });
  };

  const step = stepFor("program", onboarding, statement);
  return (
    <>
      <ScreenHead
        title="Which program is this statement for?"
        step={step}
        onBack={running ? null : () => go(onboarding ? "details" : "home")}
        backLabel={onboarding ? "Back" : "Back to My statements"}
      >
        <p className="resume-line note">
          Using your resume: <span className="wrap">{profile.resume.name || "pasted text"}</span>
          {profile.resume.savedAt ? `, saved ${shortDate(profile.resume.savedAt)}` : ""} ·{" "}
          <button type="button" className="link-btn" onClick={() => go("profile")} disabled={running}>
            Change
          </button>
        </p>
      </ScreenHead>

      <ErrorSummary problems={problems} />

      <div className="field">
        <label className="label" htmlFor="program-link">
          Link to the program&apos;s page
        </label>
        <span className="hint" id="program-link-hint">
          Open the program&apos;s page on the university&apos;s website and copy its address (on a phone: Share, then Copy link).
          <br />
          For example: https://www.university.edu/business/ms-information-systems
        </span>
        <input
          id="program-link"
          type="url"
          inputMode="url"
          autoComplete="url"
          value={inputs.programUrl}
          disabled={running}
          aria-describedby={`program-link-hint${invalid ? " program-link-error" : ""}`}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => {
            const v = e.target.value;
            update((p) => (p.inputs.programUrl = v));
            if (checked) setChecked(false);
            setProblems([]);
          }}
          onBlur={() => {
            if (!inputs.programUrl.trim()) return;
            setChecked(true);
            if (link && !link.ok && link.reason === "unsure") announce(`Is ${registrableDomain(inputs.programUrl)} the university's own website?`);
          }}
        />
        {invalid && (
          <span className="field-error" id="program-link-error">
            {linkMessage}
          </span>
        )}
      </div>

      {unsure && showLink && (
        <div className="notice" id="site-question" tabIndex={-1} role="group" aria-labelledby="site-q">
          <p id="site-q">Is {registrableDomain(inputs.programUrl)} the university&apos;s own website?</p>
          <div className="row">
            <button type="button" className="btn" onClick={trust}>
              Yes, it is
            </button>
            <button
              type="button"
              className="btn text"
              onClick={() => {
                update((p) => (p.inputs.programUrl = ""));
                setChecked(false);
                document.getElementById("program-link")?.focus();
              }}
            >
              Use a different link
            </button>
          </div>
        </div>
      )}

      <Disclosure summary="More about this program (optional)">
        <div className="field">
          <label className="label" htmlFor="entry-term">
            Entry term
          </label>
          {profile.lastEntryTerm && inputs.entryTerm === profile.lastEntryTerm && (
            <span className="hint" id="entry-term-hint">
              From your last statement
            </span>
          )}
          <input id="entry-term" type="text" placeholder="" value={inputs.entryTerm} onChange={(e) => update((p) => (p.inputs.entryTerm = e.target.value))} />
        </div>
        <div className="field">
          <label className="label" htmlFor="concentration">
            Track or concentration
          </label>
          <input id="concentration" type="text" value={inputs.concentration} onChange={(e) => update((p) => (p.inputs.concentration = e.target.value))} />
        </div>
        <div className="field">
          <label className="label" htmlFor="extra-links">
            Other pages from the university&apos;s website
          </label>
          <span className="hint" id="extra-links-hint">
            For example, the page with application instructions. One link per line.
          </span>
          <AutoTextarea
            id="extra-links"
            className="short"
            aria-describedby="extra-links-hint"
            value={inputs.extraLinks}
            onChange={(e) => update((p) => (p.inputs.extraLinks = e.target.value))}
          />
          {extras.rejected.length > 0 && (
            <span className="field-error">These are not the university&apos;s own pages, so they won&apos;t be used: {extras.rejected.join(", ")}</span>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="notes">
            Anything to stress for this program?
          </label>
          <span className="hint" id="notes-hint">
            For example: my banking experience.
          </span>
          <AutoTextarea id="notes" className="short" aria-describedby="notes-hint" value={inputs.notes} onChange={(e) => update((p) => (p.inputs.notes = e.target.value))} />
        </div>
      </Disclosure>

      <ErrorBlock kinds={["research"]} />
      <Stopped kinds={["research"]} />

      {running ? (
        <ProgressPanel kinds={["research"]} />
      ) : (
        <div className="actions">
          <button type="button" className="btn primary" onClick={submit}>
            Find the instructions
          </button>
          <p className="hint">This usually takes about a minute. We only read the university&apos;s own website.</p>
        </div>
      )}
    </>
  );
}
