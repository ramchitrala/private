// JSON schemas for `output_config.format`. Every object lists all its keys as required
// and sets additionalProperties: false; no optional or union-typed fields are used.

type Schema = Record<string, unknown>;

const str = { type: "string" };
const int = { type: "integer" };
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items: Schema): Schema => ({ type: "array", items });

export const factsSchema = obj({
  applicantName: str,
  education: arr(obj({ degree: str, institution: str, dates: str, details: str })),
  experience: arr(obj({ title: str, organization: str, dates: str, details: str })),
  projects: arr(obj({ name: str, dates: str, details: str })),
  skills: arr(str),
  certifications: arr(str),
  awards: arr(str),
  other: arr(str),
});

const sourced = { quote: str, sourceUrl: str, level: { type: "string", enum: ["program", "department", "guidance"] } };

export const extractSchema = obj({
  country: str,
  docType: arr(obj({ value: str, ...sourced })),
  prompts: arr(obj({ text: str, wordMin: int, wordMax: int, ...sourced })),
  wordLimit: arr(obj({ text: str, min: int, max: int, ...sourced })),
  pageLimit: arr(obj({ text: str, min: int, max: int, ...sourced })),
  formatting: arr(
    obj({ aspect: { type: "string", enum: ["font", "size", "spacing", "margins", "filetype", "other"] }, text: str, normalized: str, ...sourced }),
  ),
  topics: arr(obj({ text: str, ...sourced })),
  avoid: arr(obj({ text: str, ...sourced })),
  aiPolicy: arr(obj({ text: str, ...sourced })),
  programDetails: arr(
    obj({
      kind: { type: "string", enum: ["university", "program", "school", "concentration", "course", "lab", "facultyArea", "feature"] },
      value: str,
      quote: str,
      sourceUrl: str,
    }),
  ),
});

export const questionsSchema = obj({ questions: arr(obj({ text: str, why: str })) });

const sections = arr(obj({ heading: str, paragraphs: arr(str) }));

export const writerSchema = obj({ sections });

export const editSchema = obj({ sections, declined: { type: "boolean" }, declineReason: str, newFacts: arr(str), note: str });

export const reviewSchema = obj({
  verdict: { type: "string", enum: ["NO_CORRECTIONS", "CORRECTIONS"] },
  confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  corrections: arr(
    obj({
      id: str,
      severity: { type: "string", enum: ["MUST_FIX", "SHOULD_FIX"] },
      category: str,
      currentText: str,
      replacementText: str,
      reason: str,
    }),
  ),
});
