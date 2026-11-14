import type { SourcePage } from "./types";

/**
 * Normalize text for quote matching: Unicode compatibility form, straight quotes,
 * plain hyphens, single spaces, lower case. Visible wording is otherwise untouched.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿­]/g, "")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−⁃﹘﹣－]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\s  -   　]+/g, " ")
    .trim()
    .toLowerCase();
}

function sameUrl(a: string, b: string): boolean {
  const strip = (u: string) =>
    u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/#.*$/, "").replace(/\/+$/, "");
  return strip(a) === strip(b);
}

export interface QuoteCheck {
  verified: boolean;
  /** The page the quote was found on (may differ from the claimed one). */
  sourceUrl: string;
  reason: string;
}

/**
 * A quote verifies only when it appears, after normalization, in the text of a page
 * the app fetched. The claimed source is tried first, then the other fetched pages.
 */
export function verifyQuote(quote: string, sourceUrl: string, pages: SourcePage[]): QuoteCheck {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return { verified: false, sourceUrl, reason: "The quote is too short to check." };
  const ordered = [...pages.filter((p) => sameUrl(p.url, sourceUrl)), ...pages.filter((p) => !sameUrl(p.url, sourceUrl))];
  for (const page of ordered) {
    if (normalizeForMatch(page.text).includes(q)) return { verified: true, sourceUrl: page.url, reason: "" };
  }
  return {
    verified: false,
    sourceUrl,
    reason: pages.length ? "The quote was not found in any fetched page." : "No page was fetched to check this quote against.",
  };
}
