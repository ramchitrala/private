import type { Project } from "@/lib/types";
import type { Screen } from "../ctx";

/**
 * "Step N of M". A first visit has six steps (resume, details, program, instructions, questions,
 * statement); later statements have four. When the program asks no questions, one step drops out.
 */
export function stepFor(screen: Screen, onboarding: boolean, statement: Project | null): { n: number; m: number } | null {
  const noQuestions = !!statement?.questions && statement.questions.length === 0;
  const offset = onboarding ? 2 : 0;
  const m = (onboarding ? 6 : 4) - (noQuestions && screen !== "program" ? 1 : 0);
  switch (screen) {
    case "resume":
      return onboarding ? { n: 1, m } : null;
    case "details":
      return onboarding ? { n: 2, m } : null;
    case "program":
      return { n: 1 + offset, m };
    case "instructions":
      return { n: 2 + offset, m };
    case "questions":
      return { n: 3 + offset, m };
    case "writing":
    case "result":
      return { n: m, m };
    default:
      return null;
  }
}
