import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const RESUME = readFileSync(path.join(__dirname, "..", "fixtures", "resume.txt"), "utf8"); // made-up applicant
const SHOTS = path.join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"] as const;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  await noHorizontalScroll(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function openApp(page: Page, theme: string) {
  await page.addInitScript((t) => {
    if (!localStorage.getItem("sopdesk.theme")) localStorage.setItem("sopdesk.theme", t);
  }, theme);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SOP Desk" })).toBeVisible();
}

async function unlock(page: Page) {
  await page.getByLabel("Passcode").fill("test-passcode");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
}

async function intake(page: Page, link: string) {
  await page.getByLabel("Or paste the resume text").fill(RESUME);
  await page.getByLabel("Program link").fill(link);
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`full run, ${vp.name}px, ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const tag = `${vp.name}-${theme}`;
      const mobile = vp.width < 820;
      const tab = async (name: string) => {
        if (mobile) await page.getByRole("tab", { name }).click();
      };

      await openApp(page, theme);
      await shot(page, `${tag}-0-passcode`);
      await unlock(page);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);

      // 1. Resume and program
      await intake(page, "https://www.scu.edu/business/ms/ms-information-systems/");
      await shot(page, `${tag}-1-resume-and-program`);
      await page.getByRole("button", { name: "Read resume", exact: true }).click();

      // 2. Facts
      await expect(page.getByLabel("Your name")).toHaveValue("Maya Okafor");
      await shot(page, `${tag}-2-facts`);
      await page.getByRole("button", { name: "Find requirements" }).click();

      // 3. Requirements
      await expect(page.getByText("Following the official instructions on scu.edu.").first()).toBeVisible();
      await expect(page.getByText("What excites you about information systems?").first()).toBeVisible();
      // The invented course with an unverifiable quote was dropped, and the UI says so.
      await expect(page.getByText(/item(s)? dropped/)).toBeVisible();
      await shot(page, `${tag}-3-requirements`);
      await page.getByRole("button", { name: "Continue to draft" }).click();

      // 4. Draft and review
      await page.getByRole("button", { name: "Check for missing details" }).click();
      await expect(page.getByText("A few optional questions")).toBeVisible();
      await page.getByRole("checkbox", { name: "Skip" }).first().check();
      await shot(page, `${tag}-4-draft-questions`);
      await page.getByRole("button", { name: "Write draft" }).click();

      // 5. Download (the run moves here when it finishes)
      await expect(page.getByRole("button", { name: "Download .pdf" })).toBeEnabled({ timeout: 60_000 });
      await expect(page.getByText("Passed review").first()).toBeVisible();
      await expect(page.locator('[data-testid="pages"] canvas').first()).toBeVisible();
      await shot(page, `${tag}-5-download-page-view`);

      const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .pdf" }).click()]);
      expect(pdf.suggestedFilename()).toBe("Statement of Purpose - Fixture University.pdf");
      const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .docx" }).click()]);
      expect(docx.suggestedFilename()).toBe("Statement of Purpose - Fixture University.docx");

      // Review log: round 1 corrections, round 2 clean pass.
      await tab("Review");
      await expect(page.getByText("Round 1", { exact: true })).toBeVisible();
      await expect(page.getByText("Applied word for word").first()).toBeVisible();
      await expect(page.getByText("Applied by the writer").first()).toBeVisible();
      await expect(page.getByText("Round 2", { exact: true })).toBeVisible();
      await shot(page, `${tag}-6-review-log`);

      // Checklist
      await tab("Checklist");
      await expect(page.getByText("Met").first()).toBeVisible();
      if (mobile) await shot(page, `${tag}-7-checklist`);

      // Edit chat: a stated fact becomes a user fact and the change is reviewed again.
      await tab("Changes");
      await page.getByLabel("Ask for a change").fill("I also won the Regional Data Prize in 2024.");
      await page.getByRole("button", { name: "Make change" }).click();
      await expect(page.getByText("Added the new fact to the closing paragraph.", { exact: false })).toBeVisible({ timeout: 60_000 });
      await page.getByText("Show what changed").click();
      await expect(page.locator(".chatlog ins.add").first()).toContainText("Regional Data Prize");
      await shot(page, `${tag}-8-change-request`);

      // Text view marks the words the last edit changed.
      await page.getByRole("button", { name: "Text view" }).click();
      await expect(page.locator('[data-testid="textview"] mark').first()).toBeVisible();
      await shot(page, `${tag}-9-text-view`);

      // Versions are kept, and the state survives a reload (IndexedDB).
      await page.reload();
      await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
      await tab("Steps");
      await expect(page.getByText("Edit 1")).toBeVisible();
      await expect(page.getByText("Draft 1")).toBeVisible();
      await noHorizontalScroll(page);
    });
  }
}

test("default structure when the site has no statement instructions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "light");
  await unlock(page);
  await intake(page, "https://umbc.edu/programs/data-science-mps/");
  await page.getByRole("button", { name: "Read resume", exact: true }).click();
  await page.getByRole("button", { name: "Find requirements" }).click();
  await expect(page.getByText("No statement instructions found on umbc.edu, so this uses the default structure, tailored with the program details.").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue to draft" }).click();
  await page.getByRole("button", { name: "Write draft" }).click();
  await expect(page.getByRole("button", { name: "Download .pdf" })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Text view" }).click();
  await expect(page.getByText("7. Conclusion")).toBeVisible();
  await shot(page, "1440-light-fallback-default-structure");
});

test("a failed fetch is an error with retry and a paste box, never a silent fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "light");
  await unlock(page);
  await intake(page, "https://fetchfail.example.edu/program");
  await page.getByRole("button", { name: "Read resume", exact: true }).click();
  await page.getByRole("button", { name: "Find requirements" }).click();
  await expect(page.getByText("The program page could not be fetched", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry this step" })).toBeVisible();
  await expect(page.getByPlaceholder("Paste the statement instructions exactly as the university gives them")).toBeVisible();
  await expect(page.getByText("default structure")).toHaveCount(0);
  await shot(page, "1440-light-research-error");

  // Pasting the instructions is the way forward.
  await page.getByPlaceholder("Paste the statement instructions exactly as the university gives them").fill("Your statement of purpose must not exceed 800 words.");
  await page.getByRole("button", { name: "Use these instructions" }).click();
  await expect(page.getByText("Following the instructions you entered.").first()).toBeVisible();
});

test("an aggregator link is refused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "light");
  await unlock(page);
  await intake(page, "https://yocket.com/universities/santa-clara-university");
  await expect(page.getByText("yocket.com is a listing or discussion site", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Read resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find requirements" })).toBeDisabled();
});

test("a wrong passcode is rejected by the API", async ({ page, request }) => {
  const res = await request.post("/api/draft", { headers: { "x-app-passcode": "nope" }, data: {} });
  expect(res.status()).toBe(401);
  await openApp(page, "light");
  await page.getByLabel("Passcode").fill("wrong");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Wrong passcode.")).toBeVisible();
});

test("keyboard focus moves through the page in reading order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "light");
  await unlock(page);
  await page.getByRole("button", { name: "Got it" }).click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  const names: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    names.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const label = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) || el.closest("label")?.querySelector("span")?.textContent || el.textContent || "";
        // Every focused control must show a visible focus ring.
        const ring = getComputedStyle(el).outlineStyle !== "none";
        return `${label.trim().slice(0, 40)}${ring ? "" : " [no focus ring]"}`;
      }),
    );
  }
  expect(names.join(" | ")).not.toContain("[no focus ring]");
  const order = ["Project", "New project", "Dark theme", "More", "Stop", "Resume and program", "Resume", "Or paste the resume text", "Program link"];
  const seen = order.filter((o) => names.some((n) => n.startsWith(o))).map((o) => names.findIndex((n) => n.startsWith(o)));
  expect(seen.length).toBeGreaterThanOrEqual(7);
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
});
