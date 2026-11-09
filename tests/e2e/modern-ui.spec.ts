import { test, expect, type Locator, type Page } from "@playwright/test";
import { navigate } from "./navigation.js";

const item = { id: 71, kind: "TASK", priority: "HIGH", title: "GT1 bearing inspection", description: "Confirm the next inspection result before closing the work.",
  equipmentCode: "GT1", createdAt: "2026-11-08T05:00:00Z", workStatus: "IN_PROGRESS", responsibleTeam: "Maintenance", nextStep: "Check the measurement", workVersion: 1 };
const summary = { revision: 1, equipment: ["GT1", "GT2", "ST"].map(code => ({ code, status: "ACTIVE", note: "Inspection result pending", version: 1 })),
  counts: { total: 1, important: 1, TASK: 1, VALVE: 0, ATTENTION: 0 }, openItems: [item], important: [item], tasks: [item], valves: [], attention: [], recent: [], activeShiftId: null, receipt: null };

async function open(page: Page) {
  await page.route("**/login", route => route.fulfill({ json: { token: "modern-ui-test-only", user: { id: 1, name: "Test Operator", role: "WORKER" } } }));
  await page.route("**/ai/status", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/shifts/current", route => route.fulfill({ json: { currentShift: null } }));
  await page.route(/\/shifts\?/, route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } }));
  await page.route("**/operations/**", route => route.fulfill({ json: route.request().url().endsWith("/summary") ? summary : { items: [item], total: 1, page: 1, pageSize: 20 } }));
  await page.goto("/app/");
}

async function settle(page: Page) {
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity));
}

async function login(page: Page) {
  await page.locator("#email").fill("modern-ui@example.invalid");
  await page.locator("#password").fill("modern-ui-password-only");
  await page.locator("#login-button").click();
  await expect(page.locator("#overview-important .observation-card")).toHaveCount(1);
  await settle(page);
}

async function appearance(control: Locator) {
  return control.evaluate(element => {
    const style = getComputedStyle(element), transform = style.transform === "none" ? new DOMMatrix() : new DOMMatrix(style.transform);
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
    const luminance = (color: number[]) => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
    const a = luminance(rgb(style.color)), b = luminance(rgb(style.backgroundColor));
    return { background: style.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), translateY: transform.m42,
      outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), focusVisible: element.matches(":focus-visible"),
      animation: style.animationName, transitionDurations: style.transitionDuration.split(",").map(value => parseFloat(value)) };
  });
}

for (const theme of ["light", "dark"] as const) test(`pointer feedback retains readable actions and keeps information-only cards still (${theme})`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
  await open(page); await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  expect(await page.evaluate(() => matchMedia("(hover:hover) and (pointer:fine)").matches)).toBe(true);
  const primary = page.locator("#login-button");
  await page.mouse.move(1, 1); await settle(page); const normal = await appearance(primary);
  expect(normal.contrast).toBeGreaterThanOrEqual(4.5);
  await primary.hover(); await settle(page); const hovered = await appearance(primary);
  expect(hovered.background).not.toBe(normal.background); expect(hovered.contrast).toBeGreaterThanOrEqual(4.5);
  await page.mouse.down();
  try {
    await settle(page); const pressed = await appearance(primary);
    expect(pressed.background).not.toBe(hovered.background); expect(pressed.contrast).toBeGreaterThanOrEqual(4.5);
  } finally { await page.mouse.move(1, 1); await page.mouse.up(); }
  await login(page);

  const secondary = page.locator("#overview-refresh");
  await page.mouse.move(1, 1); await settle(page); const secondaryNormal = await appearance(secondary);
  expect(secondaryNormal.contrast).toBeGreaterThanOrEqual(4.5);
  await secondary.hover(); await settle(page); const secondaryHover = await appearance(secondary);
  expect(secondaryHover.background).not.toBe(secondaryNormal.background); expect(secondaryHover.contrast).toBeGreaterThanOrEqual(4.5);
  await page.mouse.down();
  try {
    await settle(page); const secondaryPressed = await appearance(secondary);
    expect(secondaryPressed.background).not.toBe(secondaryHover.background); expect(secondaryPressed.contrast).toBeGreaterThanOrEqual(4.5);
  } finally { await page.mouse.move(1, 1); await page.mouse.up(); }

  const card = page.locator("#overview-important .observation-card").first();
  await card.scrollIntoViewIfNeeded(); await page.mouse.move(1, 1); await settle(page);
  const before = await card.boundingBox(); expect(before).not.toBeNull();
  await card.hover(); await settle(page); const after = await card.boundingBox(); expect(after).not.toBeNull();
  expect(after!.y - before!.y).toBeLessThanOrEqual(-1); expect(after!.y - before!.y).toBeGreaterThanOrEqual(-3);
  expect(after!.width).toBeCloseTo(before!.width, 1); expect(after!.height).toBeCloseTo(before!.height, 1);
  for (const selector of ["#overview-counts .overview-count", "#overview-equipment .equipment-card"]) {
    const information = page.locator(selector).first(); await information.scrollIntoViewIfNeeded();
    const original = await information.boundingBox(); await information.hover(); await settle(page);
    expect((await appearance(information)).translateY).toBe(0);
    expect(await information.boundingBox()).toEqual(original);
  }
});

test("keyboard users can identify focus, open an observation and return to it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); await open(page); await login(page);
  const card = page.locator("#overview-important .observation-card").first();
  await page.locator("#overview-refresh").focus();
  for (let i = 0; i < 12 && !await card.evaluate(element => element === document.activeElement); i++) await page.keyboard.press("Tab");
  await expect(card).toBeFocused();
  const focus = await appearance(card);
  expect(focus.focusVisible).toBe(true); expect(focus.outlineStyle).not.toBe("none"); expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Enter"); await expect(page.locator("#overview-dialog")).toBeVisible();
  await expect(page.locator("#overview-detail-description")).toHaveText(item.description);
  await page.keyboard.press("Escape"); await expect(page.locator("#overview-dialog")).toBeHidden();
  await expect(card).toBeFocused();
});

test("touch controls retain native feedback, pressed fallback and activation without hover movement", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light", reducedMotion: "no-preference" });
  try {
    const page = await context.newPage(); await open(page); await login(page);
    expect(await page.evaluate(() => matchMedia("(hover:hover)").matches)).toBe(false);
    const card = page.locator("#overview-important .observation-card").first();
    await card.scrollIntoViewIfNeeded(); await settle(page); const normal = await appearance(card);
    await card.hover(); await settle(page); const hover = await appearance(card);
    expect(hover.background).toBe(normal.background); expect(hover.translateY).toBe(0);
    const highlight = await card.evaluate(element => (getComputedStyle(element).webkitTapHighlightColor.match(/[\d.]+/g) || []).map(Number));
    expect(highlight.length).toBeGreaterThanOrEqual(3); expect(highlight[3] ?? 1).toBeGreaterThan(0);

    // Chromium exposes :active through compatibility mouse events after touchend.
    // Check that fallback with a held mouse input; actual touch activation is tested below.
    await page.mouse.down();
    try {
      await settle(page); expect((await appearance(card)).background).not.toBe(normal.background);
      expect((await appearance(card)).translateY).toBe(0);
    } finally { await page.mouse.move(1, 1); await page.mouse.up(); }
    await settle(page); expect((await appearance(card)).background).toBe(normal.background);
    await card.tap();
    await expect(page.locator("#overview-dialog")).toBeVisible();
    await expect(page.locator("#overview-detail-description")).toHaveText(item.description);
    await page.keyboard.press("Escape"); await expect(page.locator("#overview-dialog")).toBeHidden(); await settle(page);
    expect((await appearance(card)).translateY).toBe(0); expect((await appearance(card)).background).toBe(normal.background);
  } finally { await context.close(); }
});

test("reduced motion removes movement while hover, theme selection and navigation remain usable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" }); await open(page); await login(page);
  const card = page.locator("#overview-important .observation-card").first(), original = await appearance(card);
  await card.hover(); const hovered = await appearance(card);
  expect(hovered.background).not.toBe(original.background); expect(hovered.translateY).toBe(0);
  expect(hovered.transitionDurations.every(value => value === 0)).toBe(true);
  expect((await appearance(page.locator("#page-overview"))).animation).toBe("none");
  const toggle = page.locator("#dashboard [data-theme-toggle]");
  await toggle.focus(); await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); await expect(toggle).toBeChecked();
  await navigate(page, "new-record");
  expect((await appearance(page.locator("#page-new-record"))).animation).toBe("none");
  await page.locator("#entry-title").fill("Accessible inspection draft");
  await navigate(page, "overview"); await navigate(page, "new-record");
  await expect(page.locator("#entry-title")).toHaveValue("Accessible inspection draft");
});
