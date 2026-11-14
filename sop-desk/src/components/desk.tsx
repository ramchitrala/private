"use client";

import { createContext, useContext } from "react";
import type { DocFormat, Project } from "@/lib/types";
import type { AppInfo } from "@/lib/api-types";
import type { BuiltFiles } from "@/lib/client/files";
import type { Runtime } from "@/lib/client/pipeline";

export type StepId = "intake" | "facts" | "requirements" | "draft" | "download";

export interface RunState {
  label: string;
  status: string;
  startedAt: number;
  busy: boolean;
}

export interface ErrorState {
  stage: string;
  code: string;
  message: string;
  retry: () => void;
}

export interface Desk {
  project: Project;
  update: (mutate: (p: Project) => void) => void;
  /** Run a pipeline function with status, Stop and error handling. */
  start: (label: string, fn: (rt: Runtime) => Promise<void>, after?: () => void) => void;
  running: boolean;
  info: AppInfo;
  format: DocFormat;
  built: BuiltFiles | null;
  error: ErrorState | null;
  step: StepId;
  goto: (step: StepId) => void;
  newFromResume: () => void;
}

export const DeskContext = createContext<Desk | null>(null);

export function useDesk(): Desk {
  const d = useContext(DeskContext);
  if (!d) throw new Error("Desk context missing");
  return d;
}
