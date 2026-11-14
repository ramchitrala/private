import type { StreamEvent, Usage } from "../types";
import { checkPasscode } from "./auth";
import { ResearchError } from "../requirements";

export class StageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface StageCtx {
  stage: string;
  projectId: string;
  signal: AbortSignal;
  emit: (event: StreamEvent) => void;
  usage: Usage;
}

function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0, fetches: 0, stopReason: "", durationMs: 0 };
}

/** One terminal line per stage or review round. Never contains resume or SOP text. */
function logLine(ctx: StageCtx, outcome: string) {
  const u = ctx.usage;
  console.log(
    [
      new Date().toISOString().slice(11, 19),
      ctx.stage.padEnd(16),
      `project=${ctx.projectId}`,
      `dur=${(u.durationMs / 1000).toFixed(1)}s`,
      `in=${u.inputTokens}`,
      `out=${u.outputTokens}`,
      `searches=${u.searches}`,
      `fetches=${u.fetches}`,
      `stop=${u.stopReason || outcome}`,
    ].join("  "),
  );
}

/**
 * Wrap a stage handler as a route: passcode check, NDJSON stream, heartbeat,
 * error mapping and the stage log line.
 */
export function stageRoute<B>(stageName: string | ((body: B) => string), handler: (body: B, ctx: StageCtx) => Promise<unknown>) {
  return async function POST(req: Request): Promise<Response> {
    const denied = checkPasscode(req);
    if (denied) return denied;
    let body: B;
    try {
      body = (await req.json()) as B;
    } catch {
      return Response.json({ error: "The request body is not valid JSON." }, { status: 400 });
    }
    const stage = typeof stageName === "function" ? stageName(body) : stageName;
    const projectId = (req.headers.get("x-project-id") ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "------";
    const encoder = new TextEncoder();
    const started = Date.now();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (event: StreamEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            open = false;
          }
        };
        const ctx: StageCtx = { stage, projectId, signal: req.signal, emit, usage: emptyUsage() };
        // Keep the connection alive while the model thinks.
        const beat = setInterval(() => emit({ type: "progress", chars: -1 }), 10000);
        try {
          const data = await handler(body, ctx);
          ctx.usage.durationMs = Date.now() - started;
          emit({ type: "result", data, usage: ctx.usage });
          logLine(ctx, "ok");
        } catch (err) {
          ctx.usage.durationMs = Date.now() - started;
          const aborted = req.signal.aborted;
          const code = aborted ? "stopped" : err instanceof StageError || err instanceof ResearchError ? err.code : "error";
          const message = aborted ? "Stopped." : err instanceof Error ? err.message : "Something went wrong.";
          emit({ type: "error", stage, code, message });
          logLine(ctx, code);
        } finally {
          clearInterval(beat);
          open = false;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
    });
  };
}
