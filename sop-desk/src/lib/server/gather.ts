import type Anthropic from "@anthropic-ai/sdk";
import { isOnDomains } from "../domains";
import { cleanText } from "../clean";
import type { GatherResult, SourcePage } from "../types";

async function pdfText(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

const norm = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/#.*$/, "").replace(/\/+$/, "");

/** Read the tool blocks of the research turn into pages, queries and errors. */
export async function readToolBlocks(content: Anthropic.ContentBlock[], programUrl: string, domains: string[]): Promise<GatherResult> {
  const out: GatherResult = { pages: [], queries: [], searchCount: 0, fetchCount: 0, fetchErrors: [], searchErrors: [], programPageFetched: false };
  const fetchUrlById = new Map<string, string>();

  for (const block of content) {
    if (block.type === "server_tool_use") {
      const input = (block.input ?? {}) as { query?: string; url?: string };
      if (block.name === "web_search" && input.query) out.queries.push(input.query);
      if (block.name === "web_fetch" && input.url) fetchUrlById.set(block.id, input.url);
    } else if (block.type === "web_search_tool_result") {
      out.searchCount += 1;
      // A success is a list of results; an error is a single object.
      if (!Array.isArray(block.content)) out.searchErrors.push(block.content.error_code);
    } else if (block.type === "web_fetch_tool_result") {
      out.fetchCount += 1;
      const asked = fetchUrlById.get(block.tool_use_id) ?? "";
      const result = block.content;
      if (result.type !== "web_fetch_result") {
        out.fetchErrors.push({ url: asked, code: result.error_code });
        continue;
      }
      const url = result.url || asked;
      // allowed_domains already enforces this on the API side; check again before trusting the text.
      if (!isOnDomains(url, domains)) continue;
      const source = result.content.source;
      let text = "";
      let kind: SourcePage["kind"] = "html";
      try {
        if (source.type === "text") text = source.data;
        else if (source.type === "base64") {
          kind = "pdf";
          text = await pdfText(source.data);
        }
      } catch {
        out.fetchErrors.push({ url, code: "pdf_text_extraction_failed" });
        continue;
      }
      text = cleanText(text).trim();
      if (!text) {
        out.fetchErrors.push({ url, code: "empty_page" });
        continue;
      }
      if (!out.pages.some((p) => norm(p.url) === norm(url))) {
        out.pages.push({ url, title: result.content.title ?? "", kind, text, retrievedAt: result.retrieved_at ?? new Date().toISOString() });
      }
      if (norm(asked) === norm(programUrl) || norm(url) === norm(programUrl)) out.programPageFetched = true;
    }
  }
  return out;
}

