import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL("./frontend", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  base: "/app/",
  // Client assets never load the server's .env file or API credentials.
  envDir: root,
  publicDir: fileURLToPath(new URL("./frontend/static", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./public", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./frontend/index.html", import.meta.url)),
        "photo-upload": fileURLToPath(new URL("./frontend/lib/photo-upload.ts", import.meta.url))
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: chunk => chunk.name === "index" ? "app.js" : "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: asset => asset.names.some(name => name.endsWith(".css")) ? "styles.css" : "assets/[name]-[hash][extname]"
      }
    }
  },
  server: {
    host: "0.0.0.0",
    proxy: Object.fromEntries(["/login", "/register", "/users", "/shifts", "/operations", "/ai"].map(path => [path, "http://127.0.0.1:3000"]))
  }
});
