import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import request from "supertest";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { createWorkLimit, WorkloadBusyError } from "../src/workload.js";
import { createApp } from "../src/app.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const secret = "workload-unit-test-secret-".repeat(3);
const auth = `Bearer ${jwt.sign({ id: 1 }, secret, { expiresIn: "1h" })}`;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const user = { findUnique: async () => ({ id: 1, name: "Operator", role: "WORKER" }) };
const body = { kind: "NOTE", title: "Inspection", description: "Retain this draft" };

test("work slots reject immediately, release after failure and remain bounded across retries", async () => {
  const limit = createWorkLimit(), held = deferred<void>();
  const running = limit.run(() => held.promise);
  let started = false;
  await assert.rejects(limit.run(async () => { started = true; }), WorkloadBusyError);
  assert.equal(started, false);
  held.resolve(); await running;
  await assert.rejects(limit.run(async () => { throw new Error("failed work"); }), /failed work/);
  assert.equal(await limit.run(async () => 42), 42);
  assert.throws(() => createWorkLimit(0), /positive integer/);
});

test("busy exports skip the database, retain authorization/filter checks and leave reads available", { timeout: 10000 }, async () => {
  const entered = deferred<void>(), held = deferred<never[]>(); let calls = 0;
  const db = { user, shift: { findFirst: async () => null, findMany: async () => { calls++; entered.resolve(); return held.promise; } } };
  const app = createApp(db as unknown as PrismaClient, secret);
  const first = request(app).get("/shifts/export").set("Authorization", auth).then(response => response);
  try {
    await entered.promise;
    const busy = await request(app).get("/shifts/export").set("Authorization", auth).expect(503).expect("Retry-After", "3").expect("Cache-Control", "no-store");
    assert.deepEqual(busy.body, { error: new WorkloadBusyError().message }); assert.equal(calls, 1);
    await request(app).get("/shifts/export").expect(401);
    await request(app).get("/shifts/export?scope=all").set("Authorization", auth).expect(403);
    await request(app).get("/shifts/export?from=bad").set("Authorization", auth).expect(400);
    await request(app).get("/shifts/current").set("Authorization", auth).expect(200);
  } finally { held.resolve([]); }
  assert.equal((await first).status, 200);
  await request(app).get("/shifts/export").set("Authorization", auth).expect(200);
  assert.equal(calls, 2);
});

test("upload admission runs before parsing, lets JSON-only entries through and recovers from failures", { timeout: 10000 }, async () => {
  const entered = deferred<void>(), held = deferred<void>(); let uploads = 0, notes = 0, block = true;
  const tx = { operationRevision: { update: async () => ({}) }, shift: { findFirst: async () => null }, operationEntry: {
    create: async ({ data }: any) => {
      if (data.photos.create.length) { uploads++; entered.resolve(); if (block) await held.promise; }
      else notes++;
      return { id: uploads + notes, ...body };
    }
  } };
  const db = { user, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) };
  const app = createApp(db as unknown as PrismaClient, secret);
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#335577" } }).png().toBuffer();
  const upload = (bytes = image) => request(app).post("/operations/entries").set("Authorization", auth)
    .field("kind", "NOTE").field("title", body.title).field("description", body.description)
    .attach("photos", bytes, { filename: "sample.png", contentType: "image/png" });
  const first = upload().then(response => response);
  try {
    await entered.promise;
    // This damaged photo would fail validation if the excess request reached parsing/processing.
    await upload(Buffer.from("damaged")).expect(503).expect("Retry-After", "3");
    assert.equal(uploads, 1);
    await request(app).post("/operations/entries").send(body).expect(401);
    await request(app).post("/operations/entries").set("Authorization", auth).send(body).expect(201);
    assert.equal(notes, 1);
  } finally { block = false; held.reject(new Error("Simulated database failure")); }
  assert.equal((await first).status, 500);
  await upload().expect(201);
  await upload(Buffer.from("damaged")).expect(400);
  await upload().expect(201);
  assert.equal(uploads, 3);
});

test("disconnecting an export cannot free a slot while its database work is still running", { timeout: 10000 }, async () => {
  const entered = deferred<void>(), held = deferred<never[]>(); let block = true;
  const db = { user, shift: { findMany: async () => { entered.resolve(); return block ? held.promise : []; } } };
  const app = createApp(db as unknown as PrismaClient, secret), server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const first = httpRequest({ hostname: "127.0.0.1", port: address.port, path: "/shifts/export", headers: { Authorization: auth } });
  first.on("error", () => {}); first.end();
  try {
    await entered.promise;
    const closed = new Promise<void>(resolve => first.once("close", resolve)); first.destroy(); await closed;
    await request(app).get("/shifts/export").set("Authorization", auth).expect(503);
    block = false; held.reject(new Error("Disconnected work completed with an error"));
    await new Promise(resolve => setImmediate(resolve));
    await request(app).get("/shifts/export").set("Authorization", auth).expect(200);
  } finally {
    first.destroy(); held.resolve([]); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
