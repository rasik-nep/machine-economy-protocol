import { test, expect } from "@playwright/test";

const pages = [
  ["/", "Autonomous work. Accountable outcomes."],
  ["/how-it-works", "From a task to experience."],
  ["/architecture", "Small on-chain state. Meaningful guarantees."],
  ["/docs", "Understand what you’re seeing."],
  ["/demo", "An economy that learns."],
  ["/market", "The price of reliability."],
  ["/agents", "Identity stays. Experience evolves."],
  ["/contracts", "Work with explicit obligations."],
  ["/disputes", "A breach becomes precedent."],
  ["/transactions", "Every step leaves a receipt."]
] as const;

test("all pages support direct URLs, readable mobile layouts, and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of pages) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
      if (width === 1440 || width === 390) {
        await page.screenshot({
          path: `test-results/site-${path.replaceAll("/", "") || "home"}-${String(width)}.png`,
          fullPage: true
        });
      }
    }
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Every step leaves a receipt." })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigation history, glossary search, and reference state survive polling", async ({
  page
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "How it works", exact: true })
    .click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(
    page.getByRole("link", { name: "How it works", exact: true }).first()
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Inspect contracts", exact: true }).click();
  await expect(page).toHaveURL(/\/contracts$/);
  await expect(
    page.getByRole("heading", { name: "Work with explicit obligations." })
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "From a task to experience." })).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Work with explicit obligations." })
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Reference" })
    .click();
  await page.getByLabel("Find a concept").fill("passport");
  await expect(page.locator(".glossary-entry:visible")).toHaveCount(1);
  await page.getByText("Do I need a wallet or API key?", { exact: true }).click();
  const poll = page.waitForResponse("**/api/state");
  await poll;
  await expect(page.getByLabel("Find a concept")).toHaveValue("passport");
  await expect(page.locator('[data-detail="faq-1"]')).toHaveAttribute("open", "");
  await page.getByLabel("Find a concept").fill("no-matching-concept");
  await expect(page.getByText("No matching concepts.", { exact: false })).toBeVisible();
  await page.getByLabel("Find a concept").fill("");
  await expect(page.locator(".glossary-entry:visible")).toHaveCount(16);
});

test("educational pages work without localnet and the explorer recovers", async ({ page }) => {
  await page.route("**/api/state", (route) => route.abort());
  await page.goto("/architecture");
  await expect(
    page.getByRole("heading", { name: "Small on-chain state. Meaningful guarantees." })
  ).toBeVisible();
  await expect(page.locator("#notice")).toBeEmpty();
  await page.getByRole("link", { name: "Open demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect to your local demo." })).toBeVisible();
  await page.unroute("**/api/state");
  await page.getByRole("button", { name: "Retry connection" }).first().click();
  await expect(page.getByRole("heading", { name: "An economy that learns." })).toBeVisible();
  await expect(page.getByText("Connected · Localnet", { exact: true })).toBeVisible();
});
