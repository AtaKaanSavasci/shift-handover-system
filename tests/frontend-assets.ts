import { readFileSync } from "node:fs";

export function builtFrontend() {
  const directory = new URL("../public/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL(".vite/manifest.json", directory), "utf8"));
  const html = readFileSync(new URL("index.html", directory), "utf8");
  return {
    script: "/app/" + manifest["index.html"].file as string,
    photoUpload: "/app/" + manifest["lib/photo-upload.ts"].file as string,
    theme: /<script\s+src="([^"]+)"/.exec(html)![1]!,
    stylesheet: "/app/" + manifest["index.html"].css[0] as string
  };
}
