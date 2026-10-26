import { test, expect, type Page } from "@playwright/test";
import { navigate } from "./navigation.js";

async function setup(page: Page) {
  await page.route("**/login", route => route.fulfill({ json: { token: "react-browser-test-only", user: { id: 1, name: "Deniz Yılmaz", role: "WORKER" } } }));
  await page.route("**/ai/status", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/shifts/current", route => route.fulfill({ json: { currentShift: null } }));
  await page.route(/\/shifts\?/, route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }));
  await page.route("**/operations/**", route => route.fulfill({ json: route.request().url().endsWith("/summary")
    ? { revision: 1, equipment: [], counts: { total: 0, important: 0, VALVE: 0, ATTENTION: 0, TASK: 0 }, openItems: [], important: [], recent: [], activeShiftId: null, receipt: null }
    : { items: [], total: 0, page: 1, pageSize: 20 } }));
  await page.goto("/app/");
}
async function login(page: Page) {
  await page.locator("#email").fill("react@example.invalid"); await page.locator("#password").fill("react-browser-password");
  await page.locator("#login-button").click(); await expect(page.locator("#dashboard")).toBeVisible();
}

test("controlled fields preserve mid-text edits, selection and original photo previews through preference changes and navigation", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await setup(page); await login(page); await navigate(page, "new-record");
  const title = page.locator("#entry-title");
  await title.fill("GT1 bakım kontrolü"); await title.press("Home"); await title.pressSequentially("Yeni ");
  await expect(title).toHaveValue("Yeni GT1 bakım kontrolü");
  await title.evaluate((element: HTMLInputElement) => { element.setSelectionRange(5, 8); (window as any).originalReactField = element; });
  await page.locator("#entry-photos").setInputFiles({ name: "draft.png", mimeType: "image/png", buffer: Buffer.from("preview-only") });
  await page.locator("#dashboard [data-theme-toggle]").click(); await page.locator("#dashboard [data-language]").selectOption("en");
  expect(await title.evaluate(element => element === (window as any).originalReactField)).toBe(true);
  expect(await title.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([5, 8]);
  await navigate(page, "history"); await navigate(page, "new-record");
  await expect(title).toHaveValue("Yeni GT1 bakım kontrolü"); await expect(page.locator("#photo-previews figcaption")).toHaveText("draft.png");
  expect(errors).toEqual([]);
});

test("reload ends the in-memory session and clears private drafts while retaining language and theme preferences", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await setup(page); await login(page); await navigate(page, "new-record");
  await page.locator("#entry-title").fill("Private unsaved React draft"); await page.locator("#entry-description").fill("Must stay out of browser storage.");
  await page.locator("#entry-photos").setInputFiles({ name: "private.png", mimeType: "image/png", buffer: Buffer.from("private-preview") });
  await page.locator("#dashboard [data-language]").selectOption("en");
  if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.locator("#dashboard [data-theme-toggle]").click();
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => /Private unsaved|private-preview|react-browser-test-only/.test(value)))).toBe(false);
  page.once("dialog", dialog => dialog.accept()); await page.reload();
  await expect(page.locator("#auth-view")).toBeVisible(); await expect(page.locator("#dashboard")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("lang", "en"); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await login(page); await navigate(page, "new-record");
  await expect(page.locator("#entry-title")).toHaveValue(""); await expect(page.locator("#photo-previews figure")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("saved theme applies before the React bundle finishes loading", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vardiya-theme", "dark"));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/app/app.js", async route => { await gate; await route.continue(); });
  await page.goto("/app/", { waitUntil: "commit" });
  try {
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#root")).toBeEmpty();
  } finally { release(); }
  await expect(page.locator("#auth-view")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("connection timestamps use the same Istanbul timezone as plant data in both languages", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T05:00:00Z"));
  await setup(page); await login(page);
  await expect(page.locator("#connection-time")).toContainText("08:00:00");
  await expect(page.locator("#overview-updated")).toContainText("08:00");
  await page.locator("#dashboard [data-language]").selectOption("en");
  await expect(page.locator("#connection-time")).toContainText("Last server response: 08:00:00");
  await expect(page.locator("#overview-updated")).toContainText("08:00");
});
