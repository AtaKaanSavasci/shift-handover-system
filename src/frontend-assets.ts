import express, { type RequestHandler, type Response } from "express";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

const encodedTypes = new Map([["br", ".br"], ["gzip", ".gz"], ["identity", ""]]);
const versioned = /^assets\/[\w/-]+-[\w-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/;

// Only public build output is eligible for caching/compression. API responses and
// protected photos retain createApp's no-store policy.
export function frontendAssets(directory: string): RequestHandler {
  const root = resolve(directory);
  const handlers = new Map([...encodedTypes].map(([encoding, suffix]) => [encoding, express.static(root, {
    index: false, redirect: false, dotfiles: "ignore", fallthrough: true,
    setHeaders(response, file) {
      const original = suffix ? file.slice(0, -suffix.length) : file;
      const asset = relative(root, original).replaceAll("\\", "/");
      const res = response as Response;
      res.setHeader("Cache-Control", versioned.test(asset) ? "public, max-age=31536000, immutable" : "no-cache");
      res.vary("Accept-Encoding");
      if (suffix) { res.setHeader("Content-Encoding", encoding); res.type(extname(original)); }
    }
  })]));
  // Preserve Express's canonical /app -> /app/ redirect.
  const directoryRedirect = express.static(root, { index: false, dotfiles: "ignore" });
  async function exists(file: string) {
    try { return (await stat(file)).isFile(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return false;
      throw error;
    }
  }
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const originalUrl = req.url, query = originalUrl.indexOf("?");
    const pathname = query === -1 ? originalUrl : originalUrl.slice(0, query);
    const search = query === -1 ? "" : originalUrl.slice(query);
    if (pathname === "/" && !req.originalUrl.split("?")[0]!.endsWith("/")) return directoryRedirect(req, res, next);
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); }
    catch { res.status(400).end(); return; }
    if (decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").some(part => part.startsWith(".")) || /\.(?:br|gz)$/i.test(decoded)) return next();
    const target = decoded === "/" ? "/index.html" : decoded;
    const file = resolve(root, "." + target), local = relative(root, file);
    if (local.startsWith("..") || isAbsolute(local)) return next();
    try {
      if (!await exists(file)) return next();
      const compressible = /\.(?:html|js|css)$/i.test(target);
      const choices = await Promise.all([...encodedTypes].map(async ([encoding, suffix]) =>
        encoding === "identity" || compressible && await exists(file + suffix) ? encoding : null));
      const available = choices.filter((value): value is string => value !== null);
      // Express's negotiation honors q=0, quality, wildcard and identity rules.
      const encoding = req.acceptsEncodings(...available);
      if (!encoding) { res.status(406).end(); return; }
      const restore = () => { req.url = originalUrl; res.off("finish", restore); res.off("close", restore); };
      res.once("finish", restore); res.once("close", restore);
      req.url = (decoded === "/" ? "/index.html" : pathname) + encodedTypes.get(encoding)! + search;
      handlers.get(encoding)!(req, res, error => { restore(); next(error); });
    } catch (error) { next(error); }
  };
}
