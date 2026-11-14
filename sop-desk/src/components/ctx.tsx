"use client";

import { createContext, useContext } from "react";
import type { DocFormat, Profile, Project } from "@/lib/types";
import type { AppInfo } from "@/lib/api-types";
import type { BuiltFiles } from "@/lib/client/files";
import type { Runtime } from "@/lib/client/pipeline";
import type { Stage, StageKey } from "@/lib/client/labels";

export type Screen = "home" | "resume" | "details" | "profile" | "program" | "instructions" | "questions" | "writing" | "result";

export type RunKind = "resume" | "research" | "write" | "change" | "other";

export interface RunState {
  kind: RunKind;
  stage: Stage;
  /** Stage keys reached so far in this run, in order. */
  seen: StageKey[];
  startedAt: number;
  busy: boolean;
}

export interface ErrorState {
  kind: RunKind;
  stage: string;
  code: string;
  message: string;
  retry: () => void;
}

export interface StartOptions {
  kind: RunKind;
  /** Run against the profile (reading a resume) instead of the open statement. */
  target?: "statement" | "profile";
  after?: () => void;
  onError?: (code: string) => void;
}

export interface Desk {
  info: AppInfo;
  profile: Profile | null;
  updateProfile: (mutate: (p: Profile) => void) => void;
  setProfile: (p: Profile | null) => void;
  statements: Project[];
  statement: Project | null;
  /** The latest statement, for code that runs after a state change in the same event. */
  getStatement: () => Project | null;
  update: (mutate: (p: Project) => void) => void;
  openStatement: (id: string) => void;
  startStatement: () => void;
  removeStatement: (id: string) => Promise<void>;

  screen: Screen;
  go: (screen: Screen) => void;
  /** True while the applicant is setting up for the first time (resume, details, first statement). */
  onboarding: boolean;
  setOnboarding: (v: boolean) => void;

  run: RunState | null;
  error: ErrorState | null;
  clearError: () => void;
  start: (label: string, fn: (rt: Runtime) => Promise<void>, opts: StartOptions) => void;
  stop: () => void;
  stopped: RunKind | null;
  clearStopped: () => void;

  format: DocFormat | null;
  built: BuiltFiles | null;
  announce: (message: string) => void;
}

export const DeskContext = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const d = useContext(DeskContext);
  if (!d) throw new Error("Desk context missing");
  return d;
}
