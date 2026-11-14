import { checkPasscode } from "@/lib/server/auth";
import { getConfig, isMock } from "@/lib/server/config";
import type { AppInfo } from "@/lib/api-types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Checks the passcode and returns the settings the browser needs. */
export async function POST(req: Request): Promise<Response> {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const c = getConfig();
  const info: AppInfo = { ok: true, mock: isMock(), model: c.model, maxReviewRounds: c.maxReviewRounds, maxEditReviewRounds: c.maxEditReviewRounds };
  return Response.json(info, { headers: { "cache-control": "no-store" } });
}
