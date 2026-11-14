"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile, Project } from "@/lib/types";
import { deleteAllData, makeBackup, readBackup, saveProfile, saveProject } from "@/lib/client/store";
import { download } from "@/lib/client/files";
import { useDesk } from "./ctx";

type ThemePref = "system" | "light" | "dark";

export function Menu({
  theme,
  onTheme,
  onSignOut,
  onReset,
  onRestored,
}: {
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
  onSignOut: () => void;
  onReset: () => void;
  onRestored: (profile: Profile | null, statements: Project[]) => void;
}) {
  const { go, profile, statements, run } = useDesk();
  const [open, setOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRestore, setPendingRestore] = useState<{ profile: Profile | null; statements: Project[] } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = (focusButton = true) => {
    setOpen(false);
    setConfirmWipe(false);
    setPendingRestore(null);
    if (focusButton) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panel.current) {
        // Keep focus inside the open menu.
        const items = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (screen: "home" | "profile") => {
    close(false);
    go(screen);
  };

  const backup = () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeBackup(profile, statements), null, 1));
    download(bytes, `SOP Desk backup ${new Date().toISOString().slice(0, 10)}.sopdesk.json`, "application/json");
  };

  const finishRestore = async (data: { profile: Profile | null; statements: Project[] }, useProfile: boolean) => {
    for (const s of data.statements) await saveProject(s);
    if (useProfile && data.profile) await saveProfile(data.profile);
    onRestored(useProfile ? data.profile : null, data.statements);
    setPendingRestore(null);
    setMessage(`Restored ${data.statements.length} statement${data.statements.length === 1 ? "" : "s"}.`);
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      const data = readBackup(await file.text());
      if (data.profile && profile) setPendingRestore(data);
      else await finishRestore(data, !!data.profile);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "That file isn't a SOP Desk backup.");
    }
  };

  return (
    <div className="menu-wrap">
      <button
        ref={button}
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="menu-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        Menu
      </button>
      {open && (
        <div className="menu-panel" id="menu-panel" ref={panel} role="group" aria-label="Menu">
          <button type="button" className="btn item" disabled={!!run} onClick={() => navigate("home")}>
            My statements
          </button>
          <button type="button" className="btn item" disabled={!!run} onClick={() => navigate("profile")}>
            Your resume and details
          </button>
          <fieldset>
            <legend>Theme</legend>
            {(
              [
                ["system", "Match my device"],
                ["light", "Light"],
                ["dark", "Dark"],
              ] as [ThemePref, string][]
            ).map(([value, label]) => (
              <label key={value} className="check">
                <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => onTheme(value)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn item" onClick={backup}>
            Download a backup
          </button>
          <p className="hint menu-note">
            One file with your resume, details and all statements.
          </p>
          <button type="button" className="btn item" disabled={!!run} onClick={() => fileInput.current?.click()}>
            Restore from a backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void restore(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {pendingRestore && (
            <div className="confirm">
              <p>Replace your saved resume and details with the ones in this backup?</p>
              <div className="row">
                <button type="button" className="btn" onClick={() => finishRestore(pendingRestore, true)}>
                  Replace them
                </button>
                <button type="button" className="btn text" onClick={() => finishRestore(pendingRestore, false)}>
                  Keep mine
                </button>
              </div>
            </div>
          )}
          {message && (
            <p className="hint menu-note" role="status">
              {message}
            </p>
          )}
          <button
            type="button"
            className="btn item"
            onClick={() => {
              close(false);
              onSignOut();
            }}
          >
            Sign out on this device
          </button>
          <div className="danger-zone">
            {confirmWipe ? (
              <div className="confirm">
                <p>
                  Delete your resume, your details and all {statements.length} statement{statements.length === 1 ? "" : "s"} from this browser? This can&apos;t be undone.
                  Download a backup first if you want to keep them.
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      await deleteAllData();
                      close(false);
                      onReset();
                    }}
                  >
                    Delete everything
                  </button>
                  <button type="button" className="btn text" onClick={() => setConfirmWipe(false)}>
                    Keep everything
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn item" disabled={!!run} onClick={() => setConfirmWipe(true)}>
                Delete everything saved here
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
