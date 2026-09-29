import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the public student form.
 *
 * Requires a running app with a database and a published campaign. Point
 * E2E_FORM_SLUG at that campaign's public link slug; the suite is skipped
 * otherwise so CI without a database stays green.
 */
const slug = process.env.E2E_FORM_SLUG;

test.skip(!slug, "Set E2E_FORM_SLUG to a published feedback link slug to run the public form e2e suite.");

/** Answer every question on the current page, whatever its type. */
async function answerVisibleQuestions(page: Page) {
  // Respondent context (skipped when the campaign does not collect it).
  for (const [label, value] of [
    ["Name", "E2E Student"],
    ["Email", `e2e+${Date.now()}@example.edu`],
    ["College", "Test College"],
    ["Branch", "Computer Science"],
    ["Year", "Third"],
    ["Project type", "Capstone"],
  ] as const) {
    const input = page.getByLabel(new RegExp(`^${label}`));
    if (await input.count()) await input.first().fill(value);
  }

  // Rating / scale: pick the highest option in every numeric radiogroup.
  for (const group of await page.getByRole("radiogroup").all()) {
    const numeric = group.getByRole("radio", { name: /^\d+ of \d+$/ });
    if (await numeric.count()) {
      await numeric.last().click();
      continue;
    }
    // Yes/No, single choice and consent all use native radios.
    const radios = group.locator('input[type="radio"]');
    if (await radios.count()) await radios.first().check();
  }

  // Multiple choice groups.
  for (const group of await page.getByRole("group").all()) {
    const boxes = group.locator('input[type="checkbox"]');
    if (await boxes.count()) await boxes.first().check();
  }

  // Dropdowns.
  for (const select of await page.locator("select").all()) {
    const options = await select.locator("option:not([value=''])").all();
    if (options.length) await select.selectOption({ index: 1 });
  }

  // Text and numbers.
  for (const input of await page.locator('input[type="text"]:not([name="website"])').all()) {
    if (await input.isVisible()) await input.fill("Playwright answer");
  }
  for (const area of await page.locator("textarea").all()) {
    await area.fill("A longer answer written by the end-to-end test.");
  }
  for (const num of await page.locator('input[type="number"]').all()) {
    const min = await num.getAttribute("min");
    await num.fill(min ?? "1");
  }
}

test.describe("public feedback form", () => {
  test("renders the form with the Orizenn header", async ({ page }) => {
    await page.goto(`/f/${slug}`);
    await expect(page.getByText("Orizenn", { exact: true })).toBeVisible();
    await expect(page.getByText("Student Feedback")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/\d+ minutes? · \d+ questions?/)).toBeVisible();
  });

  test("fills everything and submits successfully", async ({ page }) => {
    await page.goto(`/f/${slug}`);

    // Works for both layouts: keep answering and pressing Next until Submit appears.
    for (let i = 0; i < 40; i++) {
      await answerVisibleQuestions(page);
      const next = page.getByRole("button", { name: "Next" });
      if (await next.count()) {
        await next.click();
        continue;
      }
      break;
    }

    await page.getByRole("button", { name: "Submit Feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/f/${slug}/success$`));
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    await expect(page.getByText("Your feedback has been recorded.")).toBeVisible();
  });

  test("double-clicking submit still results in exactly one submission", async ({ page }) => {
    const submits: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes(`/api/public/forms/${slug}/submit`)) submits.push(req.url());
    });

    await page.goto(`/f/${slug}`);
    for (let i = 0; i < 40; i++) {
      await answerVisibleQuestions(page);
      const next = page.getByRole("button", { name: "Next" });
      if (await next.count()) {
        await next.click();
        continue;
      }
      break;
    }

    await page.getByRole("button", { name: "Submit Feedback" }).dblclick();
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    expect(submits).toHaveLength(1);
  });

  test("an unknown slug renders not found", async ({ page }) => {
    const res = await page.goto("/f/this-slug-does-not-exist");
    expect(res?.status()).toBe(404);
  });
});
