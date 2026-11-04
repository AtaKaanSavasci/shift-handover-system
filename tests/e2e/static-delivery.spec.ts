import { test, expect } from "@playwright/test";

test("a repeat visit reuses versioned startup assets while HTML and private requests remain fresh", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const responses: Array<{path: string; cache: string | undefined; encoding: string | undefined}> = [];
  page.on("response", response => {
    if (response.url().includes("/app/assets/")) {
      const headers = response.headers(); responses.push({path: new URL(response.url()).pathname, cache: headers["cache-control"], encoding: headers["content-encoding"]});
    }
  });
  // Do not route/mock requests in this test: Playwright routing disables HTTP cache.
  const first = await page.goto("/app/"); await expect(page.locator("#auth-view")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(first!.headers()["cache-control"]).toBe("no-cache");
  const initial = await page.evaluate(() => performance.getEntriesByType("resource").filter(item => new URL(item.name).pathname.startsWith("/app/assets/")).map(item => {
    const entry = item as PerformanceResourceTiming; return {path: new URL(entry.name).pathname, transfer: entry.transferSize, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize};
  }));
  expect(initial).toHaveLength(4);
  for (const item of initial) { expect(item.path).toMatch(/-[\w-]{8,}\.(js|css)$/); expect(item.transfer).toBeGreaterThan(0); }
  expect(initial.reduce((sum, item) => sum + item.encoded, 0)).toBeLessThan(initial.reduce((sum, item) => sum + item.decoded, 0) / 2);
  for (const response of responses) { expect(response.cache).toBe("public, max-age=31536000, immutable"); expect(["gzip", "br"]).toContain(response.encoding); }
  await page.goto("about:blank"); const revisit = await page.goto("/app/"); await expect(page.locator("#auth-view")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(revisit!.headers()["cache-control"]).toBe("no-cache");
  const cached = await page.evaluate(() => performance.getEntriesByType("resource").filter(item => new URL(item.name).pathname.startsWith("/app/assets/")).map(item => (item as PerformanceResourceTiming).transferSize));
  expect(cached).toHaveLength(4); expect(cached.every(bytes => bytes === 0)).toBe(true);
  const privateResponses = await page.evaluate(async () => {
    const result = [];
    for (let i = 0; i < 2; i++) {
      const response = await fetch("/operations/summary"); await response.text();
      result.push({status: response.status, cache: response.headers.get("cache-control"), encoding: response.headers.get("content-encoding")});
    }
    return result;
  });
  expect(privateResponses).toEqual(Array(2).fill({status: 401, cache: "no-store", encoding: null}));
  expect(errors).toEqual([]);
});
