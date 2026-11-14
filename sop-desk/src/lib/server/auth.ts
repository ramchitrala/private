import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Every /api route calls this first. The passcode from the `x-app-passcode` header is
 * compared to APP_PASSCODE in constant time (both are hashed first, so length does not leak).
 * Returns a 401 response when it does not match, or null when the request may proceed.
 */
export function checkPasscode(req: Request): Response | null {
  const expected = process.env.APP_PASSCODE ?? "";
  const given = req.headers.get("x-app-passcode") ?? "";
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  const match = timingSafeEqual(a, b) && expected.length > 0;
  if (match) return null;
  return Response.json(
    { error: expected ? "Wrong passcode." : "APP_PASSCODE is not set on the server." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}
