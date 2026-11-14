import type { StreamEvent, Usage } from "../types";

export class StageFailure extends Error {
  stage: string;
  code: string;
  /** The effort the step ran at, when it ran out of time. */
  effort?: string;
  constructor(stage: string, code: string, message: string, effort?: string) {
    super(message);
    this.stage = stage;
    this.code = code;
    this.effort = effort;
  }
}

export interface CallOptions {
  passcode: string;
  projectId: string;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
  onBusy?: () => void;
  onProgress?: (chars: number) => void;
  onThought?: (text: string, start: boolean) => void;
  onActivity?: (text: string) => void;
}

/** POST to a stage route and read its NDJSON stream until the result or an error arrives. */
export async function callStage<T>(path: string, body: unknown, opts: CallOptions): Promise<{ data: T; usage: Usage }> {
  const stage = path.replace(/^\/api\//, "");
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-app-passcode": opts.passcode, "x-project-id": opts.projectId },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw new StageFailure(stage, "stopped", "Stopped.");
    throw new StageFailure(stage, "network", err instanceof Error ? `Could not reach the server: ${err.message}` : "Could not reach the server.");
  }
  if (res.status === 401) throw new StageFailure(stage, "passcode", "The passcode was not accepted.");
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const timedOut = res.status === 504 || /FUNCTION_INVOCATION_TIMEOUT/.test(text);
    throw new StageFailure(stage, timedOut ? "timeout" : "http", timedOut ? "This step ran past the server's time limit. Your finished work is kept; try the step again." : `The server answered ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { data: T; usage: Usage } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "status") opts.onStatus?.(event.message);
    else if (event.type === "busy") opts.onBusy?.();
    else if (event.type === "progress") opts.onProgress?.(event.chars);
    else if (event.type === "thought") opts.onThought?.(event.text, !!event.start);
    else if (event.type === "activity") opts.onActivity?.(event.text);
    else if (event.type === "error") throw new StageFailure(event.stage, event.code, event.message, event.effort);
    else if (event.type === "result") result = { data: event.data as T, usage: event.usage };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
    handle(buffer);
  } catch (err) {
    if (err instanceof StageFailure) throw err;
    if (opts.signal?.aborted) throw new StageFailure(stage, "stopped", "Stopped.");
    throw new StageFailure(stage, "stream", "The connection dropped before this step finished. Your finished work is kept; try the step again.");
  }
  if (!result) {
    throw new StageFailure(stage, "timeout", "This step ended without a result, most likely at the server's time limit. Your finished work is kept; try the step again.");
  }
  return result;
}

const LADDER = ["max", "xhigh", "high", "medium"];

/** The next lower effort, or "" when there is none. */
export function lowerEffort(effort: string): string {
  const i = LADDER.indexOf(effort);
  return i === -1 || i === LADDER.length - 1 ? "" : LADDER[i + 1];
}

/**
 * Call a stage; if it runs out of the server's time, try it again one effort level lower, and
 * remember that level for this kind of step (in `caps`) so later calls don't lose the time again.
 */
export async function callStageAdaptive<T>(
  path: string,
  body: unknown,
  opts: CallOptions & { caps: Map<string, string>; onSlower?: (path: string, effort: string) => void },
): Promise<{ data: T; usage: Usage }> {
  const key = path.replace(/^.*\/api\//, "");
  for (;;) {
    const cap = opts.caps.get(key);
    const payload = cap && body && typeof body === "object" ? { ...(body as object), effortCap: cap } : body;
    try {
      return await callStage<T>(path, payload, opts);
    } catch (err) {
      const next = err instanceof StageFailure && err.code === "too_slow" ? lowerEffort(err.effort || cap || "") : "";
      if (!next) throw err;
      opts.caps.set(key, next);
      opts.onSlower?.(key, next);
    }
  }
}
