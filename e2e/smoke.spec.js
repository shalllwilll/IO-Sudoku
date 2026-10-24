import { test, expect } from "@playwright/test";

test("landing page loads with its title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeVisible();
});

test("signed-out visit to a protected route redirects to sign-in", async ({ page }) => {
  await page.goto("/plant");
  await expect(page).toHaveURL(/\/$/);
});

test("regression: /login shows the same landing view", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeVisible();
});
