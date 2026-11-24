import { expect, type Page } from "@playwright/test";
export async function navigate(page: Page, section: "overview" | "analytics" | "new-record" | "handover" | "history") {
  await page.locator(`[data-nav="${section}"]`).click();
  await expect(page.locator(`#page-${section}`)).toBeVisible();
}
/** Response for GET /operations/units in suites that mock the operations API. */
export const unitCatalog = { items: ["GT1", "GT2", "ST"].map(code => ({ code, name: code, description: "", archivedAt: null })) };
