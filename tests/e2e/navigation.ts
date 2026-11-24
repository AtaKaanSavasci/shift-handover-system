import { expect, type Page } from "@playwright/test";
export async function navigate(page: Page, section: "overview" | "analytics" | "new-record" | "handover" | "history") {
  await page.locator(`[data-nav="${section}"]`).click();
  await expect(page.locator(`#page-${section}`)).toBeVisible();
}
