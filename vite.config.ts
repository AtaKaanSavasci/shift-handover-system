import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("./frontend", import.meta.url));
const themeFile = fileURLToPath(new URL("./frontend/static/theme.js", import.meta.url));
function compressedAssets(): Plugin {
  return {
    name: "versioned-precompressed-assets", apply: "build", enforce: "post",
    buildStart() { this.addWatchFile(themeFile); },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const theme = readFileSync(themeFile), hash = createHash("sha256").update(theme).digest("hex").slice(0, 12);
        const themeName = `assets/theme-${hash}.js`;
        this.emitFile({ type: "asset", fileName: themeName, source: theme });
        const html = bundle["index.html"];
        if (!html || html.type !== "asset") throw new Error("Frontend HTML was not emitted.");
        html.source = String(html.source).replace('src="/app/theme.js"', `src="/app/${themeName}"`);
        const originals = [...Object.values(bundle).filter(file => file.fileName !== themeName && /\.(?:html|js|css)$/.test(file.fileName)).map(file => ({
          fileName: file.fileName, bytes: Buffer.from(file.type === "chunk" ? file.code : file.source)
        })), { fileName: themeName, bytes: theme }];
        for (const { fileName, bytes } of originals) {
          this.emitFile({ type: "asset", fileName: fileName + ".gz", source: gzipSync(bytes, { level: 9 }) });
          this.emitFile({ type: "asset", fileName: fileName + ".br", source: brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 6 }
          }) });
        }
      }
    }
  };
}
export default defineConfig(({ command }) => ({
  root,
  plugins: [react(), compressedAssets()],
  base: "/app/",
  // Client assets never load the server's .env file or API credentials.
  envDir: root,
  publicDir: command === "serve" ? fileURLToPath(new URL("./frontend/static", import.meta.url)) : false,
  build: {
    outDir: fileURLToPath(new URL("./public", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./frontend/index.html", import.meta.url)),
        "photo-upload": fileURLToPath(new URL("./frontend/lib/photo-upload.ts", import.meta.url))
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: chunk => chunk.name === "index" ? "assets/app-[hash].js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  server: {
    host: "0.0.0.0",
    proxy: Object.fromEntries(["/login", "/register", "/users", "/shifts", "/operations", "/ai"].map(path => [path, "http://127.0.0.1:3000"]))
  }
}));
