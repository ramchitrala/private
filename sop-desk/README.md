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

In test mode (`MOCK_ANTHROPIC=1`) every stage answers from built-in fixtures (an invented applicant and invented page texts), and a banner says so. Links containing `newhaven` give the "1-2 pages, double-spaced, 12 pt" shape, links containing `umbc` give the no-instructions fallback, links containing `fetchfail` give a failed fetch, and anything else gives question prompts with a word range.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | | Your Claude API key. Used only on the server; it never reaches the browser. |
| `APP_PASSCODE` | yes | | Every `/api/*` route compares the `x-app-passcode` header to this in constant time and answers 401 otherwise. If it is unset, every request is refused. |
| `MODEL_ID` | no | `claude-opus-5-5` | Model for all stages. |
| `EFFORT_WRITE` | no | `xhigh` | Draft, humanize, apply edits. |
| `EFFORT_CRITIQUE` | no | `max` (`xhigh` when `STAGE_TIME_LIMIT_S` is 300 or less) | Review loop. In live runs a first review at `max` always needed more than 300 s. |
| `STAGE_TIME_LIMIT_S` | no | `300` on Vercel, none locally | How long one step may run. Steps stop cleanly 20 s before it and are retried one effort level lower. Set `800` on the Pro plan (and raise `maxDuration` in each route). |
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

The app asks one thing per screen, with one main button, a "Step N of M" line and a Back link. Your resume is kept in the browser, so it is only asked for once.

**First visit (6 steps)**
1. **Start with your resume.** Upload a PDF or Word file (up to 3 MB) or paste the text. PDFs go to Claude as a document; Word files are converted to text with mammoth. A "Using a shared computer?" option keeps the resume in memory only.
2. **Check your details.** What was read from the resume, as plain lines in groups. Each group has Edit; you can add anything the resume leaves out and an optional writing sample. Anything you type is marked as yours and kept if the resume is read again.
3. **Which program is this statement for?** Paste the program's link. Listing sites (Yocket, Shiksha, LeverageEdu, Reddit, blogs and so on) are refused where you type them; for a site the app can't classify it asks "Is X the university's own website?" and remembers your answer. Entry term, track, other official pages and notes are optional, under "More about this program".
4. **What the university asks for.** One call fetches the program page and searches the official domains (enforced with `allowed_domains` on web search and web fetch). A second call, with no tools, extracts each instruction with an exact quote and source link, and every quote is checked against the fetched text. The screen shows a plain summary; "Where this came from" opens the quote and link; "Something is wrong or missing" opens the editor. If the site has no statement instructions, the screen says so and offers a paste box before using the standard layout. If the page can't be opened, you get one "Retry this step", a paste box and "Use a different link". It never falls back silently.
5. **A few optional questions**, only when the instructions ask for something your details don't cover. Leave a box empty to skip it. Answers you keep are saved to your details for later statements.
6. **Writing your statement**, then **Your statement is ready.** The draft, the natural-voice pass (the vendored `skills/humanizer/SKILL.md` is the system prompt), a deterministic lint and the review loop run as four plain stages, with a progress bar, a live feed of what SOP Desk is doing, and Stop. The reviewer is a separate conversation that never sees the writer's prompts. A draft passes only on `NO_CORRECTIONS` with `HIGH` confidence; a correction whose text occurs exactly once is applied by exact replacement, otherwise the writer makes that one change. The result screen leads with the download in the format the school asks for (PDF when it doesn't say), then the statement, then "Want something changed?".

**While anything runs**, the screen shows a progress bar and a live feed instead of a timer. The feed is Claude's own summary of its reasoning as it writes it (requests use adaptive thinking with `display: "summarized"`), plus each search it runs and each page it opens. The bar is built from the run's real steps (one per server call, plus building the files): it moves when a step finishes and, within a step, only as the answer is actually written. It holds still while Claude thinks and never moves backwards; when a check asks for changes, one more check is added to the plan.

**Switching apps.** Phones pause a page that is not on screen, which drops the connection. The app notices, says "Paused while you were away", and when you come back it carries on from the last finished step by itself (a finished draft is never rewritten). A dropped connection while the page is open is retried once automatically. Where the browser allows it, the screen is kept awake during a run.

**Every later statement (4 steps)** starts at "Which program is this statement for?": the resume, details, writing sample, trusted sites and last entry term are reused.

**On the result screen**, "Want something changed?" makes the smallest edit, smooths the edited paragraphs, and runs up to 3 more checks; "Undo this change" goes back. Facts you state there ("I also won the X award") are saved to your details, with Undo. "Not happy with it? Write a new version" writes a fresh draft with an optional note. "Show details" holds the evidence: what the program asks for and where it says so, length and layout, how SOP Desk checked it (the review log), earlier versions with compare and "Use this version", your change requests, what was searched, file notes and technical details (model, tokens, timings).

If the program has a rule about AI use or authorship, it is shown with its quote and you tick "I've read this program's rule about writing help" before downloading.

The Menu has: My statements, Your resume and details (replace the resume, edit details, delete them), Theme (match my device, light, dark), Download a backup, Restore from a backup, Sign out on this device, and Delete everything saved here.

## Files

- `.docx` is built with `docx`, then its zip is rebuilt with JSZip: `docProps/core.xml`, `app.xml` and `custom.xml` are empty, entry timestamps are fixed, and there are no directory entries.
- `.pdf` is built with `pdf-lib` and a small layout engine (`src/lib/files/layout.ts`). It has no Info dictionary, no XMP metadata and no Producer or Creator.
- Fonts in the PDF are open-license and metric-compatible with the ones the Word file names: Liberation Sans for Arial, Liberation Serif for Times New Roman, Carlito for Calibri (in `public/fonts`, with their licenses).
- A heading never ends a page, paragraphs never leave a single line at the top or bottom of a page, and the last section is pulled back from a page of its own when a small spacing change allows it. Official type size, spacing and margins are never changed to make text fit; the writer trims the text instead.
- Hidden characters (zero-width, bidi controls, tag characters, variation selectors, soft hyphens, private-use) are removed from the resume text at intake and from the final statement, and unusual spaces become normal spaces. Visible text is not changed.

The app removes hidden characters and file metadata only. It does not rewrite text to defeat AI-text detectors, and it makes no claim about how a statement will be classified. If a program's instructions include an AI-use or authorship policy, the Requirements panel shows it; following it is up to you.

## Storage and privacy

Everything is stored in your browser's IndexedDB (database `sop-desk`, version 2):

- **Profile** (one record): the resume file or text, the details read from it and where each came from, the writing sample, the last entry term and the sites you confirmed as a university's own. A new statement copies it. Changes to the profile reach statements that have no draft yet; a statement that already has a draft is never rewritten and offers "Write a new version with your new details" instead.
- **Statements** (one per program): the program link and options, the research with fetched page text, questions and answers, drafts, versions, the review log and the reviewer conversation needed to continue it, and change requests.

The passcode and preferences (theme, preview mode) are in localStorage. When you first open the new version, the profile is built from your most recent project that has details, and every older project becomes a statement; nothing is deleted.

Clearing browser data deletes everything; "Download a backup" saves one JSON file with the profile and all statements, and "Restore from a backup" reads it (older single-project exports work too). If storage is blocked, the app works in memory and says so. The server stores nothing.

Fetched web pages are treated as data: prompts wrap them in tagged blocks and tell the model to ignore instructions inside them, and pages off the official domains are discarded in code as well.

## Default format

Used only when the program's official pages give neither format rules (length, font, spacing, margins) nor anything about what the statement should cover. A file type, a document name or an AI-use rule alone does not count as instructions. A school's own questions, limits or formatting always come first.

- **Structure:** the title "Statement of Purpose", a header block (name in bold; Program, Concentration only if there is one, University, School only when relevant, Entry Term, each label in bold), then seven numbered sections in sentence case:
  1. Background and motivation (one paragraph, about 90 to 120 words)
  2. Academic background and technical projects (one paragraph, about 150 to 180)
  3. Professional experience (two paragraphs, about 195 to 210)
  4. Why [field]? (three paragraphs, about 280 to 350)
  5. Career goals (one paragraph, about 55)
  6. Why [university]? (two or three paragraphs, about 230 to 290), for example "6. Why the University of New Haven?"
  7. Conclusion (one paragraph, about 75 to 115)

  About 1,200 words in all; "Why [field]?" and "Why [university]?" together are about half. Course, lab and faculty names come only from the university's own pages; dated developments in the field are kept only when they are certain.
- **Page:** US Letter (A4 outside the US), 1-inch margins, 11 pt Arial (Liberation Sans in the PDF), lines of exactly 14.6 pt, 11 pt after each paragraph, no first-line indent. Title 23 pt bold with 14 pt above and 16 pt below; header lines 14.6 pt with no space between; section headings 13 pt bold with 15 pt above and 10 pt below, kept with the next paragraph. About 1,200 words fill three pages.

The same title, header block and page settings are used when a school gives questions but no formatting rules.

## Tests

```bash
npm test          # vitest: unit tests plus the whole pipeline in mock mode
npm run e2e       # Playwright against the dev server in mock mode
npm run build
npm run smoke     # live run on three programs; needs ANTHROPIC_API_KEY and spends credits
SOP_DESK_URL=https://sop-desk.vercel.app SOP_DESK_PASSCODE=... npm run smoke:remote -- a   # live run through a deployment
```

`smoke:remote` runs the same browser-side pipeline against a deployed app over HTTPS (so the deployment's own key is used) and writes the files, the text and a log to `smoke-output/`. The API routes accept the passcode in `x-app-passcode` or as `Authorization: Bearer <passcode>`.

`npm run e2e` starts its own dev server on port 3210 and walks a first visit and a second statement at 1440 px and 390 px in both themes, plus 360 px, the no-instructions and page-failed cases, Stop and Continue, the passcode, keyboard focus and theme. It writes screenshots of every screen to `e2e/screenshots/`, and on each screen checks that nothing scrolls sideways and that no technical words appear outside "Show details".

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
