import { test, expect } from "@playwright/test";
// Requires a running fhir-fn with a seeded dataset "e2e" and a Patient "p1".
test("edit and save a Patient", async ({ page }) => {
  await page.goto("/e2e/Patient/p1/edit");
  await expect(page.locator('[data-field="Patient.birthDate"]')).toBeVisible();
  await page.locator('[data-save]').click();
  await expect(page.locator('.v-alert')).toHaveCount(0);
});
