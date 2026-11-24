import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Verifies the bearer token against the current account state on every request:
 * deactivated accounts and tokens issued before a password reset/deactivation
 * (older tokenVersion) are rejected. Accounts with a temporary password may only
 * reach the password-change endpoint (`allowPasswordChange`).
 */
export function authenticateToken(prisma: PrismaClient, secret: string, options: { allowPasswordChange?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
    if (!match) return res.status(401).json({ error: "Bearer token gerekli" });
    let id: number, version: number;
    try {
      const payload = jwt.verify(match[1]!, secret, { algorithms: ["HS256"] });
      if (typeof payload === "string" || !Number.isSafeInteger(payload.id) || payload.id <= 0 ||
          typeof payload.exp !== "number" || (payload.v !== undefined && !Number.isSafeInteger(payload.v))) throw new Error("Invalid claims");
      // Tokens issued before versioning carry no "v" and correspond to version 0.
      id = payload.id; version = payload.v ?? 0;
    } catch {
      return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
    }
    try {
      // Güncel rolü veritabanından al: rol değişiklikleri mevcut tokenlara da uygulanır.
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, active: true, tokenVersion: true, mustChangePassword: true } });
      if (!user || user.active === false || (user.tokenVersion ?? 0) !== version) return res.status(401).json({ error: "Geçersiz kullanıcı" });
      if (user.mustChangePassword && !options.allowPasswordChange) return res.status(403).json({ error: "PASSWORD_CHANGE_REQUIRED" });
      req.user = { id: user.id, email: user.email, role: user.role };
      next();
    } catch (error) { next(error); }
  };
}

export const requireManager: RequestHandler = (req, res, next) => {
  if (req.user?.role !== "MANAGER") return res.status(403).json({ error: "Yönetici yetkisi gerekli" });
  next();
};
