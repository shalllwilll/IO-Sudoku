import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations, results.violations.map(({ id, description, nodes }) =>
    `${id}: ${description}\n${nodes.map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`).join("\n")}`,
  ).join("\n\n")).toEqual([]);
}

test("landing page has no axe WCAG 2.1 A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);
});

test("sign-in can be completed using the keyboard", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await email.fill("demo@example.com");
  await password.fill("demo-password");
  await password.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("signed-in dashboard and history have no axe WCAG 2.1 A/AA violations", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("iosudoku.session", JSON.stringify({ email: "demo@example.com" })));
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/history");
  await expect(page.getByText("No projects yet")).toBeVisible();
  await expectAccessible(page);
});

test("small screens announce the larger-screen layout and remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem("iosudoku.session", JSON.stringify({ email: "demo@example.com" })));
  await page.goto("/projects");
  await expect(page.getByRole("note")).toContainText("designed for larger screens");
  await expectAccessible(page);
});

test("3D view controls and text alternatives have no axe WCAG 2.1 A/AA violations", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("iosudoku.session", JSON.stringify({ email: "demo@example.com" })));
  await page.goto("/plant");
  await expect(page.getByRole("navigation", { name: "Camera levels" })).toBeVisible({ timeout: 15000 });
  await expectAccessible(page);
});
