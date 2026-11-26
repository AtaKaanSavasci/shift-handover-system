import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "../../src/database.js";
import { createApp } from "../../src/app.js";
const secret = "data-quality-secret-".repeat(3);
const code = "data-quality-registration-code";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must identify a disposable test database.");

test("emails are case-insensitive for registration and sign-in, and stored lowercase", async () => {
  const db = createPrismaClient(url), app = createApp(db, secret, { registrationCode: code }), tag = randomUUID().slice(0, 8);
  try {
    const made = await request(app).post("/register").send({ email: `Mixed-${tag}@Example.COM`, name: "Mixed Case", password: "mixed-case-password", registrationCode: code }).expect(201);
    assert.equal(made.body.email, `mixed-${tag}@example.com`);
    await request(app).post("/register").send({ email: `mixed-${tag}@example.com`, name: "Again", password: "mixed-case-password", registrationCode: code }).expect(409);
    await request(app).post("/login").send({ email: `MIXED-${tag}@EXAMPLE.com`, password: "mixed-case-password" }).expect(200);
    // The database refuses mixed-case addresses even from code that bypasses the API.
    await assert.rejects(db.user.create({ data: { email: `Direct-${tag}@example.com`, name: "Direct", password: "unused" } }));
  } finally {
    await db.user.deleteMany({ where: { email: { contains: tag } } });
    await db.$disconnect();
  }
});

test("the summary answers 304 while nothing changed, and responses stay uncacheable", async () => {
  const db = createPrismaClient(url), app = createApp(db, secret), tag = randomUUID().slice(0, 8);
  const user = await db.user.create({ data: { email: `etag-${tag}@example.com`, name: "Etag", password: "unused" } });
  const auth = `Bearer ${jwt.sign({ id: user.id }, secret, { expiresIn: "1h" })}`;
  try {
    const first = await request(app).get("/operations/summary").set("Authorization", auth).expect(200);
    const etag = first.headers.etag;
    assert.match(etag, /^W\/".+"$/);
    const same = await request(app).get("/operations/summary").set("Authorization", auth).set("If-None-Match", etag).expect(304);
    assert.equal(same.text, "");

    // Starting a shift and adding a record each change what this user's summary shows.
    await request(app).post("/shifts/start").set("Authorization", auth).send({}).expect(201);
    const afterShift = await request(app).get("/operations/summary").set("Authorization", auth).set("If-None-Match", etag).expect(200);
    assert.notEqual(afterShift.headers.etag, etag);
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    const entry = await request(app).post("/operations/entries").set("Authorization", auth)
      .field("kind", "TASK").field("title", `Etag ${tag}`).field("description", "Changes the summary")
      .attach("photos", image, { filename: "p.png", contentType: "image/png" }).expect(201);
    const afterEntry = await request(app).get("/operations/summary").set("Authorization", auth).set("If-None-Match", afterShift.headers.etag).expect(200);
    assert.notEqual(afterEntry.headers.etag, afterShift.headers.etag);
    assert.equal(afterEntry.body.activeShiftId !== null, true);

    const photo = await request(app).get(`/operations/photos/${entry.body.photos[0].id}`).set("Authorization", auth).expect(200);
    // Private plant photos and summaries are never written to the browser cache.
    assert.equal(photo.headers["cache-control"], "no-store");
    assert.equal(afterEntry.headers["cache-control"], "no-store");
  } finally {
    await db.operationEntry.deleteMany({ where: { authorId: user.id } });
    await db.handoverRead.deleteMany({ where: { userId: user.id } });
    await db.shift.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
