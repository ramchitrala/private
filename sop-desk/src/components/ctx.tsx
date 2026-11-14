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
  /** What the applicant was doing, e.g. "Finding the instructions". */
  stage: string;
  /** The step that actually failed, e.g. "research/gather" or "questions". */
  failStage: string;
  code: string;
  message: string;
  retry: () => void;
}

export interface StartOptions {
  kind: RunKind;
  /** The run is about the profile (reading a resume): nothing is recorded on a statement. */
  target?: "statement" | "profile";
  /** Replace the runtime the run sees, e.g. to read a resume into a draft profile. */
  wrap?: (base: Runtime) => Runtime;
  after?: () => void;
  onError?: (code: string, failStage: string) => void;
}

export interface StoppedState {
  kind: RunKind;
  /** Pick the same run up again. */
  resume: () => void;
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
  go: (screen: Screen, opts?: { replace?: boolean }) => void;
  /** Leave "Your resume and details" for wherever the applicant came from. */
  back: () => void;
  /** True while the applicant is setting up for the first time (resume, details, first statement). */
  onboarding: boolean;
  /** The profile from before a resume replacement, while Undo is still offered. */
  resumeUndo: Profile | null;
  setResumeUndo: (p: Profile | null) => void;

  run: RunState | null;
  error: ErrorState | null;
  clearError: () => void;
  start: (label: string, fn: (rt: Runtime) => Promise<void>, opts: StartOptions) => void;
  stop: () => void;
  stopped: StoppedState | null;
  clearStopped: () => void;

  format: DocFormat | null;
  built: BuiltFiles | null;
  buildFailed: boolean;
  rebuild: () => void;
  announce: (message: string) => void;
}

export const DeskContext = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const d = useContext(DeskContext);
  if (!d) throw new Error("Desk context missing");
  return d;
}
