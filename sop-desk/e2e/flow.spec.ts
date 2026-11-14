import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const RESUME = readFileSync(path.join(__dirname, "..", "fixtures", "resume.txt"), "utf8"); // made-up applicant
const SHOTS = path.join(__dirname, "screenshots");
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const SCU = "https://www.scu.edu/business/ms/ms-information-systems/";
const NEW_HAVEN = "https://www.newhaven.edu/engineering/graduate-programs/cybersecurity/";

/** Words that must not appear in the main path, outside "Show details" and the statement itself. */
const JARGON = /\b(requirements?|humanizer|verdict|reviewer|lint|style flags|tokens?|fixtures|registrable|domain|Passed review|Not passed|Not met|Must fix|review round)\b/i;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

async function plainWords(page: Page) {
  const text = await page.evaluate(() => {
    const main = document.querySelector("main")!.cloneNode(true) as HTMLElement;
    main.querySelectorAll(".sheet, details:not([open]) > :not(summary)").forEach((el) => el.remove());
    return main.innerText;
  });
  const hit = text.match(JARGON);
  expect(hit?.[0] ?? "", `jargon on screen: "${hit?.[0]}"`).toBe("");
}

async function shot(page: Page, name: string, opts: { jargon?: boolean } = {}) {
  await noHorizontalScroll(page);
  if (opts.jargon !== false) await plainWords(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Open or close a disclosure by its exact summary text. */
async function toggle(page: Page, name: string) {
  await page.locator("summary").filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
}

async function focusedIsH1(page: Page, name: string | RegExp) {
  const h1 = page.getByRole("heading", { level: 1, name });
  await expect(h1).toBeVisible();
  await expect(h1).toBeFocused();
}

async function unlock(page: Page) {
  await page.goto("/");
  await page.getByLabel("Passcode").fill("test-passcode");
  await page.getByRole("button", { name: "Continue" }).click();
}

/** First visit: resume, details, then the program screen of the first statement. */
async function onboard(page: Page, tag = "") {
  await focusedIsH1(page, "Start with your resume");
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  if (tag) await shot(page, `${tag}-01-resume`);

  // Pressing Continue with nothing gives a clear message, not a disabled button.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Upload your resume or paste its text first." })).toBeVisible();

  await toggle(page, "Paste the text instead");
  await page.getByLabel("Your resume text").fill(RESUME);
  await page.getByRole("button", { name: "Continue" }).click();

  await focusedIsH1(page, "Check your details");
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Maya Okafor");
  if (tag) await shot(page, `${tag}-02-details`);
  await page.getByRole("button", { name: "Looks right" }).click();
  await focusedIsH1(page, "Which program is this statement for?");
  await expect(page.getByText("Step 3 of 6")).toBeVisible();
}

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"] as const;

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`first visit to download, then a second statement, ${vp.name}px, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const tag = `${vp.name}-${theme}`;

      await page.goto("/");
      await expect(page.getByRole("heading", { name: "SOP Desk" })).toBeVisible();
      await shot(page, `${tag}-00-passcode`);
      await page.getByLabel("Passcode").fill("test-passcode");
      await page.getByRole("button", { name: "Continue" }).click();

      await onboard(page, tag);

      // Program: the only thing a statement asks for is the link.
      await expect(page.getByText(/Using your resume: Pasted resume text/)).toBeVisible();
      await page.getByLabel("Link to the program's page").fill(SCU);
      await shot(page, `${tag}-03-program`);
      await page.getByRole("button", { name: "Find the instructions" }).click();

      // Instructions: a plain summary, evidence one tap away.
      await focusedIsH1(page, "What Fixture University asks for");
      await expect(page.getByText("Step 4 of 6")).toBeVisible();
      await expect(page.getByText("What excites you about information systems?", { exact: true })).toBeVisible();
      await expect(page.getByText("400 to 500 words in total", { exact: true })).toBeVisible();
      await toggle(page, "Where this came from");
      await expect(page.getByText("Statement of Purpose: answer each of the following questions.", { exact: false })).toBeVisible();
      await toggle(page, "Instructions we couldn't confirm (1)");
      await expect(page.getByText("Quantum Ledger Design")).toBeVisible();
      await shot(page, `${tag}-04-instructions`);
      await page.getByRole("button", { name: "Looks right, continue" }).click();

      // Questions: optional, no Skip boxes.
      await focusedIsH1(page, "A few optional questions");
      await expect(page.getByText("Step 5 of 6")).toBeVisible();
      await page.getByRole("textbox", { name: "Have you received any scholarships or fellowships?" }).fill("Regional Fellowship, 2024");
      await shot(page, `${tag}-05-questions`);
      await page.getByRole("button", { name: "Write my statement" }).click();

      // Writing: four plain stages.
      await expect(page.getByRole("heading", { level: 1, name: "Writing your statement" })).toBeVisible();
      await expect(page.getByText("1. Writing your first draft")).toBeVisible();
      await shot(page, `${tag}-06-writing`);

      // Result.
      await focusedIsH1(page, "Your statement is ready");
      await expect(page.getByText("Step 6 of 6")).toBeVisible();
      await expect(page.getByText(/Follows all 7 instructions we found · \d+ words \(limit 400 to 500\) · \d pages?/)).toBeVisible();
      await expect(page.getByText("Fixture University asks for a PDF.", { exact: false })).toBeVisible();
      await expect(page.getByTestId("textview")).toBeVisible();
      await expect(page.getByTestId("textview")).toContainText("Maya Okafor");
      await shot(page, `${tag}-07-result`);

      const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
      expect(pdf.suggestedFilename()).toBe("Statement of Purpose - Fixture University.pdf");
      await expect(page.getByText("Downloaded. Applying somewhere else?")).toBeVisible();
      const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Word file (.docx)" }).click()]);
      expect(docx.suggestedFilename()).toBe("Statement of Purpose - Fixture University.docx");

      // As printed: the real PDF pages, with a text summary.
      await page.getByRole("button", { name: "As printed" }).click();
      await expect(page.locator('[data-testid="pages"] canvas').first()).toBeVisible();
      await expect(page.getByText(/\d pages?, US Letter, 11 pt, 14\.6 pt lines/)).toBeVisible();
      await page.getByRole("button", { name: "Easy to read" }).click();

      // Details are one tap away, in plain words.
      await toggle(page, "How SOP Desk checked it");
      await expect(page.getByText("Check 1: 2 changes suggested")).toBeVisible();
      await expect(page.getByText("Check 2: nothing to change")).toBeVisible();
      await toggle(page, "What the program asks for, and where it says so");
      await expect(page.getByText("Follows").first()).toBeVisible();
      await shot(page, `${tag}-08-result-details`, { jargon: false });
      await toggle(page, "How SOP Desk checked it");
      await toggle(page, "What the program asks for, and where it says so");

      // A change: a stated award is saved for later statements, with Undo.
      await page.getByRole("button", { name: "Make it shorter" }).click();
      await expect(page.getByLabel("Describe it in your own words")).toHaveValue("Make it shorter");
      await page.getByLabel("Describe it in your own words").fill("I also won the Regional Data Prize in 2024.");
      await page.getByRole("button", { name: "Make this change" }).click();
      await expect(page.getByText("Changed: I added the award to the closing paragraph.")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("#change-result")).toBeFocused();
      await expect(page.getByText(/Saved to your details for future statements: “Received the Regional Data Prize in 2024”/)).toBeVisible();
      await expect(page.getByText("Underlined words changed with your last request.")).toBeVisible();
      await expect(page.locator('[data-testid="textview"] mark').first()).toBeVisible();
      await toggle(page, "Show what changed");
      await expect(page.locator(".diffbox ins.add").first()).toContainText("Regional Data Prize");
      await shot(page, `${tag}-09-change`);

      // Earlier versions.
      await toggle(page, "Earlier versions");
      await expect(page.getByText(/Version 2 · after your change "I also won the Regional Data Prize in 2024\."/)).toBeVisible();
      await expect(page.getByText(/Version 1 · first draft/)).toBeVisible();
      await toggle(page, "Earlier versions");

      // Menu, then home.
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("button", { name: "Download a backup" })).toBeVisible();
      await shot(page, `${tag}-10-menu`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
      await page.getByRole("button", { name: /SOP Desk/ }).click();
      await focusedIsH1(page, "My statements");
      await expect(page.getByText(/Your resume: Pasted resume text · saved .* · 13 details/)).toBeVisible();
      await expect(page.getByText(/Fixture University · Ready to download/)).toBeVisible();
      await shot(page, `${tag}-11-home`);

      // State survives a reload.
      await page.reload();
      await focusedIsH1(page, "My statements");

      // A second statement: no resume step, only the link.
      await page.getByRole("button", { name: "Start a new statement" }).click();
      await focusedIsH1(page, "Which program is this statement for?");
      await expect(page.getByText("Step 1 of 4")).toBeVisible();
      await expect(page.getByText(/Using your resume: Pasted resume text/)).toBeVisible();
      await page.getByLabel("Link to the program's page").fill(NEW_HAVEN);
      await shot(page, `${tag}-12-second-program`);
      await page.getByRole("button", { name: "Find the instructions" }).click();
      await focusedIsH1(page, "What Fixture University asks for");
      await expect(page.getByText("Step 2 of 4")).toBeVisible();
      await expect(page.getByText("This program has a rule about writing help")).toBeVisible();
      await page.getByRole("button", { name: "Looks right, continue" }).click();
      // Test mode always asks the same two questions; the real question step skips anything the details answer.
      await focusedIsH1(page, "A few optional questions");
      await page.getByRole("button", { name: "Write my statement" }).click();
      await focusedIsH1(page, "Your statement is ready");

      // The rule about writing help must be acknowledged before downloading.
      await page.getByRole("button", { name: "Download PDF" }).click();
      await expect(page.getByText("Tick the box above first.")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "I've read this program's rule about writing help." })).toBeFocused();
      await page.getByRole("checkbox", { name: "I've read this program's rule about writing help." }).check();
      const [pdf2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
      expect(pdf2.suggestedFilename()).toBe("Personal Statement - Fixture University.pdf");
      await shot(page, `${tag}-13-second-result`);

      // Your resume and details.
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("button", { name: "Your resume and details" }).click();
      await focusedIsH1(page, "Your resume and details");
      await expect(page.getByText("Received the Regional Data Prize in 2024")).toBeVisible();
      await expect(page.getByText("(from a change you asked for)")).toBeVisible();
      await expect(page.getByText("(from your answer)")).toBeVisible();
      await shot(page, `${tag}-14-profile`);
    });
  }
}

test("a narrow phone at 360px never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await unlock(page);
  await onboard(page, "360-light");
  await page.getByLabel("Link to the program's page").fill(SCU);
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await focusedIsH1(page, "What Fixture University asks for");
  await toggle(page, "Where this came from");
  await toggle(page, "Pages we searched and read");
  await shot(page, "360-light-04-instructions");
  await page.getByRole("button", { name: "Looks right, continue" }).click();
  await page.getByRole("button", { name: "Write my statement" }).click();
  await focusedIsH1(page, "Your statement is ready");
  await toggle(page, "Technical details");
  await toggle(page, "Earlier versions");
  await shot(page, "360-light-07-result", { jargon: false });
});

test("no instructions on the site: say so, offer the paste box, then the standard layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill("https://umbc.edu/programs/data-science-mps/");
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await focusedIsH1(page, "We didn't find instructions for this statement");
  await expect(page.getByText(/We searched umbc.edu and read 1 page/)).toBeVisible();
  await expect(page.getByLabel("The program's instructions")).toBeVisible();
  await shot(page, "1440-light-fallback-no-instructions");
  await page.getByRole("button", { name: "Continue with a standard layout" }).click();
  await focusedIsH1(page, "Your statement is ready");
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  await expect(page.getByText("Written in a standard layout because the program's instructions weren't found.")).toBeVisible();
  await expect(page.getByTestId("textview")).toContainText("7. Conclusion");
  await shot(page, "1440-light-fallback-result");
});

test("a page that can't be opened: one Retry, a paste box, never a silent fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill("https://fetchfail.example.edu/program");
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't open that page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry this step" })).toHaveCount(1);
  await expect(page.getByText("standard layout")).toHaveCount(0);
  await expect(page.getByText("program_page_not_fetched")).toBeHidden();
  await shot(page, "1440-light-research-error");

  // Retrying fails the same way and still offers exactly one Retry.
  await page.getByRole("button", { name: "Retry this step" }).click();
  await expect(page.getByRole("button", { name: "Retry this step" })).toHaveCount(1);

  await page.getByLabel("Or paste the instructions from the program's page").fill("Your statement of purpose must not exceed 800 words.");
  await page.getByRole("button", { name: "Use these instructions" }).click();
  await focusedIsH1(page, "What the program asks for");
  await expect(page.getByText("at most 800 words")).toBeVisible();

  // Home shows what happened to each statement.
  await page.getByRole("button", { name: /SOP Desk/ }).click();
  await expect(page.getByText(/fetchfail.example.edu · Waiting for you/)).toBeVisible();
});

test("a listing site is refused where the link is typed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  const field = page.getByLabel("Link to the program's page");
  await field.fill("https://yocket.com/universities/santa-clara-university");
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await expect(page.getByText("yocket.com is a listing or discussion site, not the university.", { exact: false }).first()).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Which program is this statement for?" })).toBeVisible();

  // A site it can't classify gets a neutral question instead of an error.
  await field.fill("https://www.mcgill.ca/gradapplicants/");
  await field.blur();
  await expect(page.getByText("Is mcgill.ca the university's own website?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, it is" }).click();
  await expect(page.getByText("Is mcgill.ca the university's own website?")).toHaveCount(0);
});

test("Stop keeps finished work and Continue picks up from there", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill(SCU);
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await page.getByRole("button", { name: "Looks right, continue" }).click();
  await page.getByRole("button", { name: "Write my statement" }).click();
  // Stop once the first draft exists.
  await expect(page.locator('.stages li[aria-current="step"]').filter({ hasText: /Making it sound natural|Checking it against/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await focusedIsH1(page, "Stopped");
  await expect(page.getByText("Everything finished so far is saved.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await focusedIsH1(page, "Your statement is ready");
  await toggle(page, "Earlier versions");
  // Continuing reused the first draft rather than writing a new one.
  await expect(page.getByText(/Version 1 · first draft/)).toBeVisible();
  await expect(page.getByText(/Version 2/)).toHaveCount(0);
});

test("the passcode is checked by the server and explained on the gate", async ({ page, request }) => {
  const res = await request.post("/api/draft", { headers: { "x-app-passcode": "nope" }, data: {} });
  expect(res.status()).toBe(401);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your passcode first.")).toBeVisible();
  await page.getByLabel("Passcode").fill("wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That passcode didn't work. Check it and try again.")).toBeVisible();
  await expect(page.getByLabel("Passcode")).toHaveAttribute("aria-invalid", "true");
});

test("keyboard: skip link first, visible focus on every control, focus follows the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await focusedIsH1(page, "Start with your resume");
  // The skip link is the first stop: going back from the first control in the header reaches it.
  await page.getByRole("button", { name: /SOP Desk/ }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeInViewport();
  const seen: string[] = [];
  // The six controls of the first screen, in reading order.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        const ring = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
        return `${(el.innerText || el.getAttribute("aria-label") || el.id || el.tagName).trim().slice(0, 30)}${ring ? "" : " [no focus ring]"}`;
      }),
    );
  }
  expect(seen.join(" | ")).not.toContain("[no focus ring]");
  const order = ["SOP Desk", "Menu", "Upload your resume", "Paste the text instead", "Using a shared computer?", "Continue"];
  const idx = order.map((o) => seen.findIndex((s) => s.startsWith(o)));
  expect(idx.every((i) => i >= 0), seen.join(" | ")).toBe(true);
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
});

test("theme follows the device and can be set in the menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await unlock(page);
  await onboard(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe("rgb(22, 21, 18)");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "Light" }).check();
  expect(await bg()).toBe("rgb(246, 243, 236)");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await bg()).toBe("rgb(246, 243, 236)");
});

test("deleting your resume and details stays deleted after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Your resume and details" }).click();
  await focusedIsH1(page, "Your resume and details");
  await page.getByRole("button", { name: "Delete my resume and details" }).click();
  await page.getByRole("button", { name: "Delete them" }).click();
  await focusedIsH1(page, "Start with your resume");
  await page.reload();
  await focusedIsH1(page, "Start with your resume");
});

test("the browser's Back button leaves the result, and a second statement has four steps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill(SCU);
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await page.getByRole("button", { name: "Looks right, continue" }).click();
  await page.getByRole("button", { name: "Write my statement" }).click();
  await focusedIsH1(page, "Your statement is ready");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "A few optional questions" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Your statement is ready" })).toBeVisible();

  // Starting another statement from the result: the first-visit steps are over.
  await page.getByRole("button", { name: "Download PDF" }).click();
  await page.getByRole("button", { name: "Start a new statement" }).click();
  await focusedIsH1(page, "Which program is this statement for?");
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Back to My statements" }).click();
  await focusedIsH1(page, "My statements");

  // Back through history to the first statement's result shows that statement, not an empty page.
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Your statement is ready" })).toBeVisible();
  await expect(page.getByTestId("textview")).toContainText("Maya Okafor");
});

test("the menu is there from the first screen, so a backup can be restored on a new computer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await focusedIsH1(page, "Start with your resume");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Restore from a backup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "My statements" })).toHaveCount(0);
  await shot(page, "1440-light-first-menu");
});

test("stopping a resume replacement keeps the details you had", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Your resume and details" }).click();
  await page.getByRole("button", { name: "Replace your resume" }).click();
  await focusedIsH1(page, "Replace your resume");
  await toggle(page, "Paste the text instead");
  await page.getByLabel("Your resume text").fill("A different resume with enough words to be read as a resume by the app.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Read my new resume" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Everything finished so far is saved.")).toBeVisible();
  await page.reload();
  await focusedIsH1(page, "My statements");
  await expect(page.getByText(/· 11 details ·/)).toBeVisible();
});

test("while writing: a live reasoning feed and a progress bar, no timers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill(SCU);
  await page.getByRole("button", { name: "Find the instructions" }).click();
  // Research shows what it searched and opened.
  await expect(page.getByRole("region", { name: "What SOP Desk is doing" })).toContainText("Searching the university's site for", { timeout: 20_000 });
  await page.getByRole("button", { name: "Looks right, continue" }).click();
  await page.getByRole("button", { name: "Write my statement" }).click();
  const feed = page.getByRole("region", { name: "What SOP Desk is doing" });
  await expect(feed).toContainText("Planning the answers");
  const bar = page.getByRole("progressbar", { name: "Progress" });
  await expect(bar).toBeVisible();
  await expect(page.getByText(/Time so far/)).toHaveCount(0);
  // The bar only moves forward.
  const values: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = await bar.getAttribute("aria-valuenow").catch(() => null);
    if (v === null) break;
    values.push(Number(v));
    await page.waitForTimeout(150);
  }
  expect([...values].sort((a, b) => a - b)).toEqual(values);
  await shot(page, "1440-light-06b-writing-feed");
  await focusedIsH1(page, "Your statement is ready");
});

test("switching to another app mid-run pauses, then carries on by itself", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await unlock(page);
  await onboard(page);
  await page.getByLabel("Link to the program's page").fill(SCU);
  await page.getByRole("button", { name: "Find the instructions" }).click();
  await page.getByRole("button", { name: "Looks right, continue" }).click();

  // The phone suspends the page while another app is open: the page is hidden and the connection drops.
  let dropped = false;
  await page.route("**/api/humanize", async (route) => {
    if (!dropped) {
      dropped = true;
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Write my statement" }).click();
  await expect(page.getByText("You left the page, so the connection paused.", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Retry this step" })).toHaveCount(0);
  await shot(page, "390-light-06c-paused");

  // Coming back: it carries on from the finished draft, with no button to press.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await focusedIsH1(page, "Your statement is ready");
  await toggle(page, "Earlier versions");
  await expect(page.getByText(/Version 1 · first draft/)).toBeVisible();
  await expect(page.getByText(/Version 2/)).toHaveCount(0);
  await toggle(page, "Technical details");
  // The draft was written once: only the interrupted step ran again.
  await expect(page.locator("table.runs td", { hasText: /^Draft$/ })).toHaveCount(1);
});
