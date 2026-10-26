import { build } from "vite";
import { spawn } from "node:child_process";

// Keep the established localhost:3000/app/ address and one-command Windows setup.
// Vite watches source components; Express continues to serve the compiled assets.
let api, watcher, stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api?.kill();
  Promise.resolve(watcher?.close()).finally(() => { process.exitCode = code; });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
watcher = await build({ build: { watch: {} } });
watcher.on("event", event => {
  if (event.code === "ERROR") console.error(event.error);
  if (event.code === "END" && !api && !stopping) {
    api = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "watch", "src/index.ts"], { stdio: "inherit" });
    api.on("exit", code => { if (!stopping) stop(code ?? 1); });
  }
});
