# SOP Desk

Writes a graduate-school statement of purpose from your resume and a link to the program's page on the university's own website.

The app searches the university's site for the official statement instructions and follows them. It uses a default seven-section structure only when the site has none. Every draft goes through a humanizer pass and a strict review loop, and you download a `.docx` and a `.pdf`.

Next.js (App Router, TypeScript), deployed to Vercel. No database: projects live in your browser.

## Run it locally

Requires Node.js 20 or later.

```bash
cd sop-desk
npm install
cp .env.example .env.local      # then fill in the two required values
npm run dev                     # http://localhost:3000
```

The terminal prints one line per pipeline stage or review round: time, stage, short project id, duration, input and output tokens, searches and fetches, and the stop reason. Resume and statement text are never logged.

To try the whole app without an API key or spending credits:

```bash
MOCK_ANTHROPIC=1 APP_PASSCODE=anything npm run dev
```

In mock mode every stage answers from built-in fixtures (an invented applicant and invented page texts). Links containing `newhaven` give the "1-2 pages, double-spaced, 12 pt" shape, links containing `umbc` give the no-instructions fallback, links containing `fetchfail` give a failed fetch, and anything else gives question prompts with a word range.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | | Your Claude API key. Used only on the server; it never reaches the browser. |
| `APP_PASSCODE` | yes | | Every `/api/*` route compares the `x-app-passcode` header to this in constant time and answers 401 otherwise. If it is unset, every request is refused. |
| `MODEL_ID` | no | `claude-opus-5-5` | Model for all stages. |
| `EFFORT_WRITE` | no | `xhigh` | Draft, humanize, apply edits. |
| `EFFORT_CRITIQUE` | no | `max` | Review loop. |
| `EFFORT_RESEARCH` | no | `high` | Resume facts, requirements research, applicant questions. |
| `MAX_REVIEW_ROUNDS` | no | `5` | Review rounds per run before the app stops and lets you decide. |
| `MOCK_ANTHROPIC` | no | | Set to `1` to answer every stage from fixtures. |

`.env*` files are git-ignored (except `.env.example`). All model settings are in `src/lib/server/config.ts`.

## Deploy to Vercel

1. Import the repository in Vercel. If the app sits in a subfolder of the repository (here `sop-desk/`), set **Root Directory** to that folder.
2. Add `ANTHROPIC_API_KEY` and `APP_PASSCODE` under Settings, Environment Variables.
3. Deploy. No other services are needed: no database, KV, Blob, Postgres or Edge Config.

### The 300-second limit

On the Hobby plan a function call can run for at most 300 seconds, so the pipeline is cut into separate calls: resume facts, research (gather), research (extract), questions, draft, humanize, each review round, and each edit. The browser runs them in order and saves each result, so after a timeout, refresh or error you can continue or retry just the step that failed.

Every route has a literal `export const maxDuration = 300` (Next.js needs a literal there). On the Pro plan you can raise it to as much as 800 in each `src/app/api/**/route.ts`. A review round at `max` effort is the call most likely to run long; if it times out on Hobby, retry it, lower `EFFORT_CRITIQUE` to `xhigh`, or move to Pro.

## How it works

1. **Resume and program.** Upload a PDF or DOCX (up to 3 MB) or paste the text, and give the program link. PDFs are sent to Claude as a document; DOCX is converted to text with mammoth.
2. **Facts.** An editable fact sheet. Facts you add are marked "from you" and treated as true.
3. **Requirements.** The link must be on the university's own site; listing sites (Yocket, Shiksha, LeverageEdu, Reddit, blogs and so on) are refused, and for a domain the app can't classify you are asked to confirm it. One call fetches the program page and searches the official domains (enforced with `allowed_domains` on web search and web fetch). A second call, with no tools, extracts each requirement with an exact quote and source link. Every quote is checked against the fetched text; items that fail are dropped and listed. You can edit, add or remove items, and "Check again" re-runs the search.
4. **Draft and review.** Optional questions cover what the instructions ask for that your facts don't. Then: draft, humanizer pass (the vendored `skills/humanizer/SKILL.md` is the system prompt), a deterministic lint, and the review loop. The reviewer is a separate conversation that never sees the writer's prompts. A draft passes only on `NO_CORRECTIONS` with `HIGH` confidence. A correction whose text occurs exactly once is applied by exact replacement; otherwise the writer makes that one change.
5. **Download.** Both files are built in the browser from the same document model.

After that, "Ask for a change" makes the smallest edit, applies the humanizer rules to the edited paragraphs, and continues the review (3 rounds per edit). "Retry" writes a fresh draft from the same inputs. Every output is saved as a version you can compare and restore.

**No silent fallback.** The default structure is used only after the program page was fetched and the searches ran and found no statement instructions. A failed fetch, a timeout or a blocked site is shown as an error with a retry button and a box to paste the instructions yourself.

## Files

- `.docx` is built with `docx`, then its zip is rebuilt with JSZip: `docProps/core.xml`, `app.xml` and `custom.xml` are empty, entry timestamps are fixed, and there are no directory entries.
- `.pdf` is built with `pdf-lib` and a small layout engine (`src/lib/files/layout.ts`). It has no Info dictionary, no XMP metadata and no Producer or Creator.
- Fonts in the PDF are open-license and metric-compatible with the ones the Word file names: Liberation Sans for Arial, Liberation Serif for Times New Roman, Carlito for Calibri (in `public/fonts`, with their licenses).
- A heading never ends a page, paragraphs never leave a single line at the top or bottom of a page, and the last section is pulled back from a page of its own when a small spacing change allows it. Official type size, spacing and margins are never changed to make text fit; the writer trims the text instead.
- Hidden characters (zero-width, bidi controls, tag characters, variation selectors, soft hyphens, private-use) are removed from the resume text at intake and from the final statement, and unusual spaces become normal spaces. Visible text is not changed.

The app removes hidden characters and file metadata only. It does not rewrite text to defeat AI-text detectors, and it makes no claim about how a statement will be classified. If a program's instructions include an AI-use or authorship policy, the Requirements panel shows it; following it is up to you.

## Storage and privacy

Projects (inputs, resume file, facts, research with fetched page text, drafts, versions, review logs, the reviewer conversation and the change requests) are stored in IndexedDB in your browser. The passcode and preferences are in localStorage. Clearing browser data deletes them; "Export project" saves a JSON copy and "Import project" loads one. If storage is blocked, the app works in memory and says so. The server stores nothing.

Fetched web pages are treated as data: prompts wrap them in tagged blocks and tell the model to ignore instructions inside them, and pages off the official domains are discarded in code as well.

## Tests

```bash
npm test          # vitest: unit tests plus the whole pipeline in mock mode
npm run e2e       # Playwright against the dev server in mock mode
npm run build
npm run smoke     # live run on three programs; needs ANTHROPIC_API_KEY and spends credits
```

`npm run e2e` starts its own dev server on port 3210 and writes screenshots of every step at 1440 px and 390 px, in both themes, to `e2e/screenshots/`. It also checks that nothing scrolls horizontally and that keyboard focus follows reading order.

`npm run smoke` writes its files to `smoke-output/`. Links (b) and (c) are best guesses; set `SMOKE_URL_B` and `SMOKE_URL_C` if they have moved.

All committed fixtures use a made-up resume (`fixtures/resume.txt`).

## Defaults chosen

These were not specified, so sensible defaults were picked:

- **Location.** The app lives in `sop-desk/` inside the existing repository.
- **Web tools.** `web_search_20250305` and `web_fetch_20250910`, the versions Claude calls directly, so every fetched page comes back in full and its text can be checked. Up to 8 searches and 10 fetches per research run, 30,000 tokens per fetched page.
- **Refusal fallback.** Not enabled. A `refusal` stop reason is shown as an error for that step. Server-side fallback would run a stage on a different model than the one configured.
- **Precedence** is applied per kind of requirement: a program-level word limit beats a graduate-school one, but a graduate-school formatting rule still applies if the program gives none.
- **A document name or AI policy alone** does not count as "statement instructions"; prompts, limits, formatting, topics and things to avoid do.
- **Word counts** cover paragraph text. The title, header block and section headings are not counted.
- **Header block** (name, program, university, school, entry term) is built by code from your inputs and the verified names, not by the model.
- **Shapes.** Official prompts give one numbered section per prompt. Official instructions without prompts give a single essay with no headings; double-spaced essays get 0.5-inch first-line indents. Otherwise the default seven sections.
- **Paper.** US Letter for US universities (by country, or a `.edu` domain), A4 elsewhere.
- **Declining corrections.** The app declines a correction only when it would break an official word limit, or when the writer reports a conflict with an official requirement or with your notes.
- **Restoring a version** starts a new reviewer conversation the next time a review runs, because the old one was about a different text.
- **Mock fixtures** are hand-written, not recorded from the API.

## Credits

- Humanizer skill by blader, MIT: `skills/humanizer/` (https://github.com/blader/humanizer).
- Liberation fonts (SIL Open Font License) and Carlito (SIL Open Font License): `public/fonts/`.
