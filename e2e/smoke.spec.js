import { test, expect } from "@playwright/test";

test("landing page loads with its title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeVisible();
});

test("signed-out visit to a protected route redirects to sign-in", async ({ page }) => {
  await page.goto("/plant");
  await expect(page).toHaveURL(/returnTo=%2Fplant/);
});

test("regression: /login shows the same landing view", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeVisible();
});

/** Signs in through the real form, so the stage is reached the way a presenter reaches it. */
async function signIn(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
}

test("3D explorer opens with explicit data loading and no automatic tour", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /3D plant view/ }).click();
  await expect(page).toHaveURL(/\/plant$/);
  await expect(page.getByRole("heading", { name: "IO Signal Sudoku" })).toBeVisible();
  await expect(page.getByLabel("Excel workbook")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toHaveCount(0);
});
