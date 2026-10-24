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

test("the 3D stage renders its canvas and nothing else", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /3D plant view/ }).click();
  await expect(page).toHaveURL(/\/plant$/);

  // The scene itself: a canvas, the breadcrumb, the ladder and the legend.
  const crumbs = page.getByRole("navigation", { name: "Camera levels" });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(crumbs).toBeVisible();
  await expect(page.getByRole("list", { name: "The seven levels" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Legend" })).toBeVisible();

  // No application shell: the presentation screen carries no navigation of its own.
  await expect(page.getByRole("link", { name: "Projects", exact: true })).toHaveCount(0);

  // The tour starts by itself and walks on without any input (T-6.6-1 and T-6.6-2).
  await expect(crumbs.getByRole("button", { name: "Cabinets", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(crumbs.getByRole("button", { name: "Cabinet interior", exact: true })).toBeVisible({ timeout: 20000 });

  // Skip hands control back, and the breadcrumb then jumps levels.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  await crumbs.getByRole("button", { name: "Plant", exact: true }).click();
  await expect(crumbs.getByRole("button", { name: "Cabinet interior", exact: true })).toHaveCount(0);
});
