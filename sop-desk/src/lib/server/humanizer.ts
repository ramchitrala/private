import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/**
 * The vendored humanizer skill (skills/humanizer/SKILL.md, MIT). An API app cannot run
 * slash commands, so the file is loaded at runtime and used as prompt text.
 */
export function humanizerSkill(): string {
  if (cached === null) {
    const raw = readFileSync(path.join(process.cwd(), "skills", "humanizer", "SKILL.md"), "utf8");
    cached = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  }
  return cached;
}
