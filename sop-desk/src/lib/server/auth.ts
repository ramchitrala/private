import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Every /api route calls this first. The passcode from the `x-app-passcode` header (or an
 * `Authorization: Bearer` header) is
 * compared to APP_PASSCODE in constant time (both are hashed first, so length does not leak).
 * Returns a 401 response when it does not match, or null when the request may proceed.
 */
function same(expected: string, given: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b) && expected.length > 0;
}

export function checkPasscode(req: Request): Response | null {
  const expected = process.env.APP_PASSCODE ?? "";
  const given = req.headers.get("x-app-passcode") ?? "";
  // Scripts and tools may send the passcode as a standard bearer token instead.
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const match = same(expected, given) || (bearer.length > 0 && same(expected, bearer));
  if (match) return null;
  return Response.json(
    { error: expected ? "Wrong passcode." : "APP_PASSCODE is not set on the server." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}
