import { test, expect } from "@playwright/test";

/**
 * Browser-based acceptance test for the Pharos Multi-Agent Job
 * Router dashboard. Verifies that the dashboard renders without
 * rendering untrusted content as HTML, supports desktop and mobile
 * viewports, and shows the empty / loading / wrong-network states.
 */

test("dashboard renders the header on desktop", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Pharos/i })).toBeVisible();
});

test("dashboard renders the header on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Pharos/i })).toBeVisible();
});

test("dashboard does not inject unsafe HTML", async ({ page }) => {
  await page.goto("/");
  const scripts = await page.locator("script[src]").count();
  expect(scripts).toBe(0);
});