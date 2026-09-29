import { expect, test, type Page } from "@playwright/test";

/**
 * PRD §113 — the critical product loop, end to end.
 *
 * Requires a running app with a migrated + seeded database and:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD  (a SUPER_ADMIN or ADMIN user)
 * Optionally E2E_BASE_URL (defaults to http://localhost:3000).
 */
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test.describe("product loop", () => {
  test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the admin loop.");

  test("admin creates, publishes; student submits; response, analytics and export reflect it", async ({ page, context }) => {
    const name = `E2E Loop ${Date.now()}`;

    await login(page);

    // Create campaign
    await page.goto("/admin/campaigns/new");
    await page.getByLabel("Campaign name").fill(name);
    await page.getByLabel("Internal goal").fill("End-to-end verification of the create → publish → collect → understand → export loop.");
    await page.getByRole("button", { name: /continue to form/i }).click();
    await expect(page.getByRole("heading", { name: /how would you like to create the form/i })).toBeVisible();

    // Start blank → builder
    await page.getByRole("button", { name: /start blank/i }).click();
    await expect(page.getByRole("heading", { name: /form builder/i })).toBeVisible();
    const campaignUrl = new URL(page.url());
    const campaignId = campaignUrl.pathname.split("/")[3];

    // Add a rating question
    await page.getByRole("button", { name: /\+ add/i }).click();
    await page.getByLabel("Question text").fill("How useful was the Orizenn analysis?");
    await page.getByRole("button", { name: /save question/i }).click();
    await expect(page.getByText(/question saved/i)).toBeVisible();

    // Add a long text question
    await page.getByRole("button", { name: /\+ add/i }).click();
    await page.getByLabel("Question text").fill("What was confusing?");
    await page.getByLabel("Type").selectOption("LONG_TEXT");
    await page.getByLabel("Required").uncheck();
    await page.getByRole("button", { name: /save question/i }).click();
    await expect(page.getByText(/question saved/i)).toBeVisible();

    // Preview uses the same renderer
    const previewPage = await context.newPage();
    await previewPage.goto(`/admin/campaigns/${campaignId}/preview`);
    await expect(previewPage.getByText(/preview of v1/i)).toBeVisible();
    await expect(previewPage.getByText("How useful was the Orizenn analysis?")).toBeVisible();
    await previewPage.close();

    // Publish
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByRole("heading", { name: /ready to publish/i })).toBeVisible();
    await page.getByRole("button", { name: /publish form/i }).click();
    await expect(page.getByRole("heading", { name: /feedback form published/i })).toBeVisible();
    const link = await page.locator("dialog code").innerText();
    expect(link).toMatch(/\/f\/[a-z0-9-]+$/);
    await page.getByRole("button", { name: /done/i }).click();

    // Student submits (fresh, unauthenticated context)
    const student = await context.browser()!.newContext();
    const studentPage = await student.newPage();
    await studentPage.goto(link);
    await expect(studentPage.getByText("How useful was the Orizenn analysis?")).toBeVisible();
    await studentPage.getByRole("radio", { name: /4 of 5/ }).click();
    await studentPage.getByLabel(/what was confusing/i).fill("The capability terminology was unclear at first.");
    const submit = studentPage.getByRole("button", { name: /submit feedback/i });
    await submit.dblclick();
    await expect(studentPage.getByRole("heading", { name: /thank you/i })).toBeVisible();
    await student.close();

    // Response appears once
    await page.goto(`/admin/campaigns/${campaignId}/responses`);
    await expect(page.getByText(/1 response\b/)).toBeVisible();

    // Analytics reflect the answer
    await page.goto(`/admin/campaigns/${campaignId}/analytics`);
    await expect(page.getByText("How useful was the Orizenn analysis?")).toBeVisible();
    await expect(page.getByText(/1 student responded/i)).toBeVisible();

    // Export downloads an .xlsx
    await page.goto(`/admin/campaigns/${campaignId}/export`);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /generate export/i }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    await expect(page.getByText(/export ready/i)).toBeVisible();
  });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}
