/**
 * Hidden-character cleanup. Removes characters that are invisible in the rendered
 * text and turns unusual spaces into normal ones. Visible text is never changed.
 */

// Zero-width: U+200B-U+200D, U+2060, U+FEFF. Bidi controls: U+202A-U+202E, U+2066-U+2069.
// Also U+200E/U+200F and U+061C (bidi marks), U+00AD (soft hyphen), U+180E, U+2061-U+2064 (invisible operators).
const INVISIBLE = /[​-‏⁠-⁤﻿‪-‮⁦-⁩؜­᠎]/g;
// Variation selectors (U+FE00-U+FE0F, U+E0100-U+E01EF), tag characters (U+E0000-U+E007F),
// private use (U+E000-U+F8FF, planes 15 and 16).
const INVISIBLE_ASTRAL = /[︀-️-]|[\u{E0000}-\u{E007F}]|[\u{E0100}-\u{E01EF}]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu;
// Non-breaking and other unusual spaces.
const ODD_SPACES = /[   -   　]/g;

export interface CleanReport {
  text: string;
  removed: number;
  spacesNormalized: number;
}

export function cleanHidden(input: string): CleanReport {
  let removed = 0;
  let spacesNormalized = 0;
  const text = input
    .replace(INVISIBLE, () => (removed++, ""))
    .replace(INVISIBLE_ASTRAL, () => (removed++, ""))
    .replace(ODD_SPACES, () => (spacesNormalized++, " "));
  return { text, removed, spacesNormalized };
}

export function cleanText(input: string): string {
  return cleanHidden(input).text;
}

/** Apply the cleaner to every string in a JSON-like value. */
export function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return cleanText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => cleanDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanDeep(v);
    return out as T;
  }
  return value;
}
