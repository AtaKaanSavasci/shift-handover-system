import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { gzipSync, deflateSync } from "node:zlib";
import { createApp } from "../../src/app.ts";

let lookups = 0;
const db = { user: { findUnique: async () => { lookups++; return null; } } };
const server = createApp(db, "dependency-regression-test-only-".repeat(2)).listen(0, "127.0.0.1");
await once(server, "listening");

function post(encoding, data, trailing = false) {
  // The zero byte ends the compressed member before the later garbage chunk.
  // See GHSA-27r3-jxmh-p828 and body-parser's upstream regression coverage.
  const first = trailing ? Buffer.concat([data, Buffer.from([0])]) : data;
  const tail = trailing ? Buffer.alloc(100 * 1024, 0x58) : Buffer.alloc(0);
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.address().port, path: "/login", method: "POST",
      agent: false, headers: { "Content-Type": "application/json", "Content-Encoding": encoding,
        "Content-Length": first.length + tail.length } }, res => {
      let text = "";
      res.setEncoding("utf8"); res.on("data", chunk => { text += chunk; });
      res.on("error", reject); res.on("end", () => {
        // Late decoder errors must also fail the isolated process.
        setTimeout(() => resolve({ status: res.statusCode, body: JSON.parse(text) }), trailing ? 200 : 0);
      });
    });
    req.on("error", reject);
    req.write(first);
    // A separate network chunk exercises errors arriving after decoder EOF.
    if (trailing) setTimeout(() => req.end(tail), 30);
    else req.end();
  });
}

try {
  const login = Buffer.from(JSON.stringify({ email: "missing@example.invalid", password: "test-only-password" }));
  for (const [encoding, compress] of [["gzip", gzipSync], ["deflate", deflateSync]]) {
    assert.equal((await post(encoding, compress(login))).status, 401);
    const before = lookups;
    const trailing = await post(encoding, compress(login), true);
    assert.deepEqual(trailing, { status: 401, body: { error: "Email veya şifre hatalı" } });
    assert.equal(lookups - before, 1);
    const large = await post(encoding, compress(Buffer.from(JSON.stringify({ data: "x".repeat(17000) }))));
    assert.deepEqual(large, { status: 413, body: { error: "İstek boyutu çok büyük." } });
    assert.equal(lookups - before, 1);
    assert.equal((await post(encoding, compress(login))).status, 401);
  }
  console.log("Compressed request checks passed");
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
