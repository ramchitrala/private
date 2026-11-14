"use client";

import { useEffect, useRef, useState } from "react";
import type { AppInfo } from "@/lib/api-types";

export function Gate({ onOpen, message }: { onOpen: (passcode: string, info: AppInfo) => void; message?: string }) {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState(message ?? "");
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = "SOP Desk";
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setProblem("Enter your passcode first.");
      input.current?.focus();
      return;
    }
    setChecking(true);
    setProblem("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "x-app-passcode": value } });
      if (res.ok) onOpen(value, (await res.json()) as AppInfo);
      else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem(body.error?.includes("not set") ? "SOP Desk isn't set up yet: the passcode is missing on the server." : "That passcode didn't work. Check it and try again.");
        input.current?.focus();
      }
    } catch {
      setProblem("We couldn't reach SOP Desk. Check your internet connection and try again.");
    }
    setChecking(false);
  };
  return (
    <main className="page gate" id="main">
      <h1>SOP Desk</h1>
      <p className="intro">
        SOP Desk writes a statement of purpose from your resume and the program&apos;s own web page. It uses AI to write and check a draft. You read it and decide what to submit.
      </p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="passcode">
            Passcode
          </label>
          <span className="hint" id="passcode-hint">
            Enter the passcode you were given. We&apos;ll remember it on this device.
          </span>
          <input
            ref={input}
            id="passcode"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="current-password"
            aria-describedby={`passcode-hint${problem ? " passcode-error" : ""}`}
            aria-invalid={problem ? true : undefined}
          />
          {problem && (
            <span className="field-error" id="passcode-error" role="alert">
              {problem}
            </span>
          )}
        </div>
        <div className="actions">
          <button className="btn primary" type="submit" disabled={checking}>
            {checking ? "Checking" : "Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}
