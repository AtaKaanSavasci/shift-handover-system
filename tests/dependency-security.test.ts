import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("compressed requests with trailing bytes cannot crash the API or bypass its body limit", { timeout: 20000 }, async () => {
  // Isolate the availability regression: an unhandled decoder error must fail
  // this test instead of terminating the parent test runner.
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", fileURLToPath(new URL("./fixtures/compressed-requests.mjs", import.meta.url))
  ], { timeout: 15000 });
  assert.match(stdout, /Compressed request checks passed/);
});
