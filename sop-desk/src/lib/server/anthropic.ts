import Anthropic from "@anthropic-ai/sdk";
import { capEffort, getConfig, type Effort } from "./config";
import { StageError, type StageCtx } from "./stage";

export interface CallParams {
  effort: Effort;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** JSON schema for `output_config.format`. Never combined with citations. */
  schema?: Record<string, unknown>;
  tools?: Anthropic.ToolUnion[];
  /** Cache the conversation prefix as well as the system prompt. */
  cacheConversation?: boolean;
}

export interface CallResult {
  /** Every content block of the turn, across paused continuations, in order. */
  content: Anthropic.ContentBlock[];
  /** The assistant turn(s) to append to continue this conversation, exactly as received. */
  assistantTurns: Anthropic.MessageParam[];
  /** Text of the final message: text blocks only, found by type. */
  text: string;
}

/**
 * One streamed Claude call for a stage. Handles `pause_turn` (bounded), `refusal`,
 * `max_tokens`, busy retries (surfaced to the UI) and usage accounting.
 */
export async function callClaude(ctx: StageCtx, params: CallParams): Promise<CallResult> {
  const config = getConfig();
  const client = new Anthropic({
    maxRetries: config.maxRetries,
    // The SDK retries 429 and 529 itself; this only lets the UI say so.
    fetch: async (input, init) => {
      const res = await fetch(input as RequestInfo, init as RequestInit);
      if (res.status === 429 || res.status === 529 || res.status === 503) ctx.emit({ type: "busy" });
      return res;
    },
  });

  const messages = [...params.messages];
  const fetchUrls = new Map<string, string>();
  const effort = capEffort(params.effort, ctx.effortCap);
  // Stop cleanly before the platform's time limit, so the browser can retry the step at a lower effort.
  const deadline = config.timeLimitMs ? ctx.startedAt + config.timeLimitMs - 20_000 : 0;
  const tooSlow = () =>
    new StageError("too_slow", "This step needed more time than the server allows, so it will be tried again a little faster.", effort);
  const content: Anthropic.ContentBlock[] = [];
  const assistantTurns: Anthropic.MessageParam[] = [];
  let text = "";

  for (let attempt = 0; ; attempt++) {
    const remaining = deadline ? deadline - Date.now() : 0;
    if (deadline && remaining < 5_000) throw tooSlow();
    const timeUp = new AbortController();
    const timer = deadline ? setTimeout(() => timeUp.abort(), remaining) : null;
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        system: params.system,
        messages,
        // Adaptive thinking is always on for this model; "summarized" streams a readable account of it,
        // which the applicant sees as the live reasoning feed.
        thinking: { type: "adaptive", display: "summarized" },
        output_config: {
          effort,
          ...(params.schema ? { format: { type: "json_schema" as const, schema: params.schema } } : {}),
        },
        ...(params.tools ? { tools: params.tools } : {}),
        ...(params.cacheConversation ? { cache_control: { type: "ephemeral" as const } } : {}),
      },
      { signal: AbortSignal.any([ctx.signal, timeUp.signal]) },
    );
    let chars = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      ctx.emit({ type: "progress", chars });
    });
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "thinking") ctx.emit({ type: "thought", text: "", start: true });
    });
    stream.on("thinking", (delta) => {
      if (delta) ctx.emit({ type: "thought", text: delta });
    });
    stream.on("contentBlock", (block) => {
      const activity = describeToolBlock(block, fetchUrls);
      if (activity) ctx.emit({ type: "activity", text: activity });
    });

    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (timeUp.signal.aborted && !ctx.signal.aborted) throw tooSlow();
      throw mapApiError(err);
    } finally {
      if (timer) clearTimeout(timer);
    }

    const u = message.usage;
    ctx.usage.inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    ctx.usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    ctx.usage.outputTokens += u.output_tokens ?? 0;
    ctx.usage.searches += u.server_tool_use?.web_search_requests ?? 0;
    ctx.usage.fetches += u.server_tool_use?.web_fetch_requests ?? 0;
    ctx.usage.stopReason = message.stop_reason ?? "";

    content.push(...message.content);
    const turn: Anthropic.MessageParam = { role: "assistant", content: message.content as Anthropic.ContentBlockParam[] };
    assistantTurns.push(turn);
    text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    switch (message.stop_reason) {
      case "pause_turn":
        // Send the paused content back unchanged, with the same tools, a bounded number of times.
        if (attempt >= config.maxContinuations) {
          throw new StageError("pause_limit", "The research turn was paused too many times. Try again.");
        }
        messages.push(turn);
        ctx.emit({ type: "status", message: "Still working on a long step" });
        continue;
      case "refusal":
        throw new StageError(
          "refusal",
          `Claude declined this request${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}. Nothing was changed.`,
        );
      case "max_tokens":
      case "model_context_window_exceeded":
        throw new StageError("max_tokens", "The response was cut off before it finished. Try this step again.");
      default:
        return { content, assistantTurns, text };
    }
  }
}

/** A plain sentence about a search or a page fetch, for the reasoning feed. */
function describeToolBlock(block: Anthropic.ContentBlock, fetchUrls: Map<string, string>): string {
  const site = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (block.type === "server_tool_use") {
    const input = (block.input ?? {}) as { query?: string; url?: string };
    if (block.name === "web_search" && input.query) return `Searching the university's site for: ${input.query}`;
    if (block.name === "web_fetch" && input.url) {
      fetchUrls.set(block.id, input.url);
      return `Opening ${site(input.url)}`;
    }
    return "";
  }
  if (block.type === "web_search_tool_result") {
    if (!Array.isArray(block.content)) return "A search didn't work; trying another way.";
    const n = block.content.length;
    return n ? `Found ${n} page${n === 1 ? "" : "s"} to look at.` : "That search found nothing.";
  }
  if (block.type === "web_fetch_tool_result") {
    const url = fetchUrls.get(block.tool_use_id) ?? "";
    if (block.content.type !== "web_fetch_result") return `Couldn't open ${site(url) || "a page"}.`;
    const title = block.content.content.title;
    return `Read ${title ? `"${title}"` : site(block.content.url || url)}.`;
  }
  return "";
}

function mapApiError(err: unknown): Error {
  if (err instanceof Anthropic.APIUserAbortError) return new StageError("stopped", "Stopped.");
  if (err instanceof Anthropic.AuthenticationError) return new StageError("auth", "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on the server.");
  if (err instanceof Anthropic.PermissionDeniedError) return new StageError("permission", "The Anthropic API key is not allowed to make this request.");
  if (err instanceof Anthropic.RateLimitError) return new StageError("busy", "Claude is still busy after several retries. Wait a minute and try this step again.");
  if (err instanceof Anthropic.BadRequestError) return new StageError("bad_request", `The API rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new StageError("network", "Could not reach the Claude API. Check the connection and try again.");
  if (err instanceof Anthropic.APIError) {
    return new StageError(err.status === 529 ? "busy" : "api", err.status === 529 ? "Claude is overloaded right now. Try this step again in a minute." : `Claude API error ${err.status ?? ""}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error("Unknown error");
}

/** Parse the JSON text of a structured-output response. */
export function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new StageError("bad_json", "The response was not valid JSON. Try this step again.");
  }
}

export function systemBlocks(text: string, cache = false): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, ...(cache ? { cache_control: { type: "ephemeral" as const } } : {}) }];
}
