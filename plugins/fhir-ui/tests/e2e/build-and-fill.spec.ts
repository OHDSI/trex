import { test, expect } from "@playwright/test";
test("build a questionnaire then fill it", async ({ page }) => {
  await page.goto("/e2e/Questionnaire/intake/build");
  await page.locator('[data-add-question]').click();
  await expect(page.locator('[data-q-row]')).toHaveCount(1);
  await page.locator('[data-publish]').click();
  await page.goto("/e2e/Questionnaire/intake/fill");
  await expect(page.locator('[data-submit]')).toBeVisible();
});
