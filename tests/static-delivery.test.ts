import { test } from "node:test";
import assert from "node:assert/strict";
import { get, type IncomingHttpHeaders } from "node:http";
import { readFile, mkdtemp, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import express from "express";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { frontendAssets } from "../src/frontend-assets.js";
import { builtFrontend } from "./frontend-assets.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
const secret = "static-delivery-test-only-".repeat(3);
function setup() {
  return createApp({ user: { findUnique: async () => ({ id: 1, role: "WORKER", email: "static@example.invalid" }) },
    shift: { findFirst: async () => null } } as unknown as PrismaClient, secret, { analyzer: null });
}
async function server(app: ReturnType<typeof express>, run: (request: (path: string, headers?: Record<string, string>, method?: string) => Promise<{status: number; headers: IncomingHttpHeaders; body: Buffer}>) => Promise<void>) {
  const instance = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => instance.once("listening", resolve));
  const address = instance.address(); assert.ok(address && typeof address !== "string");
  const request = (path: string, headers: Record<string,string> = {}, method = "GET") => new Promise<{status: number; headers: IncomingHttpHeaders; body: Buffer}>((resolve, reject) => {
    const req = get({ hostname: "127.0.0.1", port: address.port, path, headers, method, agent: false }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk)); res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }); req.on("error", reject);
  });
  try { await run(request); } finally { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); }
}

test("built HTML references versioned entry, CSS and prepaint theme; every sidecar decodes to its original", async () => {
  const paths = builtFrontend();
  for (const path of Object.values(paths)) {
    assert.match(path, /^\/app\/assets\/.+-[\w-]{8,}\.(js|css)$/);
    const file = new URL("../public/" + path.slice(5), import.meta.url), original = await readFile(file);
    assert.deepEqual(gunzipSync(await readFile(new URL(file.href + ".gz"))), original);
    assert.deepEqual(brotliDecompressSync(await readFile(new URL(file.href + ".br"))), original);
  }
  const html = new URL("../public/index.html", import.meta.url);
  assert.deepEqual(gunzipSync(await readFile(new URL(html.href + ".gz"))), await readFile(html));
  assert.deepEqual(brotliDecompressSync(await readFile(new URL(html.href + ".br"))), await readFile(html));
});

test("Brotli, gzip and identity serve identical scripts with correct MIME, variant lengths and quality negotiation", async () => server(setup(), async request => {
  const path = builtFrontend().script, original = await readFile(new URL("../public/" + path.slice(5), import.meta.url));
  for (const [header, encoding] of [["br", "br"], ["gzip", "gzip"], ["identity", "identity"], ["br;q=0, gzip;q=1", "gzip"], ["br;q=1, gzip;q=.2", "br"], ["gzip;q=.2, identity;q=1", "identity"], ["*;q=1, identity;q=0", "br"]]) {
    const response = await request(path, { "Accept-Encoding": header! });
    assert.equal(response.status, 200); assert.match(response.headers["content-type"]!, /javascript/);
    assert.match(response.headers.vary!, /Accept-Encoding/i);
    assert.equal(response.headers["content-encoding"], encoding === "identity" ? undefined : encoding);
    const decoded = encoding === "br" ? brotliDecompressSync(response.body) : encoding === "gzip" ? gunzipSync(response.body) : response.body;
    assert.deepEqual(decoded, original); assert.equal(Number(response.headers["content-length"]), response.body.length);
    if (encoding !== "identity") assert.ok(response.body.length < original.length / 2);
  }
  assert.equal((await request(path)).headers["content-encoding"], undefined);
  assert.equal((await request(path, { "Accept-Encoding": "*;q=0" })).status, 406);
}));

test("only versioned public files are immutable; HTML revalidates and compressed HEAD/ETag variants stay correct", async () => server(setup(), async request => {
  for (const path of Object.values(builtFrontend())) {
    const response = await request(path, { "Accept-Encoding": "gzip" });
    assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
    const cached = await request(path, { "Accept-Encoding": "gzip", "If-None-Match": response.headers.etag! });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0); assert.match(cached.headers.vary!, /Accept-Encoding/i);
    const identity = await request(path, { "Accept-Encoding": "identity", "If-None-Match": response.headers.etag! });
    assert.equal(identity.status, 200);
    const head = await request(path, { "Accept-Encoding": "gzip" }, "HEAD");
    assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers["content-length"], response.headers["content-length"]);
  }
  const shell = await request("/app/", { "Accept-Encoding": "gzip" });
  assert.equal(shell.headers["cache-control"], "no-cache"); assert.equal(shell.headers["content-encoding"], "gzip");
  assert.equal((await request("/app/", { "Accept-Encoding": "gzip", "If-None-Match": shell.headers.etag! })).status, 304);
  const canonical = await request("/app"); assert.equal(canonical.status, 301); assert.equal(canonical.headers.location, "/app/");
}));

test("private success/error responses remain no-store and uncompressed; sidecars and local files are not exposed", async () => server(setup(), async request => {
  const token = jwt.sign({ id: 1 }, secret, { expiresIn: "1h" });
  for (const [path, headers, expected] of [["/shifts/current", { Authorization: "Bearer " + token }, 200], ["/operations/summary", {}, 401], ["/register", {}, 404]] as const) {
    const response = await request(path, { ...headers, "Accept-Encoding": "br,gzip" });
    assert.equal(response.status, expected); assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers["content-encoding"], undefined);
  }
  for (const path of [builtFrontend().script + ".br", builtFrontend().script + ".gz", "/app/.vite/manifest.json", "/app/.env", "/app/%2e%2e/.env", "/app/..%2f.env", "/app/%5c..%5c.env", "/app/assets/missing-12345678.js"]) {
    const response = await request(path, { "Accept-Encoding": "gzip" }); assert.equal(response.status, 404, path); assert.equal(response.headers["cache-control"], "no-store");
  }
}));

test("a cached HTML shell sees the next release while unchanged versioned assets remain cacheable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shift-static-")), app = express();
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }); app.use("/app", frontendAssets(directory));
  try {
    const index = join(directory, "index.html"); await writeFile(index, '<script src="/app/assets/app-version1.js"></script>');
    await server(app, async request => {
      const first = await request("/app/"); assert.equal(first.headers["cache-control"], "no-cache");
      await writeFile(index, '<script src="/app/assets/app-version2.js"></script>'); const later = new Date(Date.now() + 2000); await utimes(index, later, later);
      const second = await request("/app/", { "If-None-Match": first.headers.etag! });
      assert.equal(second.status, 200); assert.match(second.body.toString(), /version2/); assert.notEqual(second.headers.etag, first.headers.etag);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
