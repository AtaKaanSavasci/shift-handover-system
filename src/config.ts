import "dotenv/config";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET en az 32 bayt olmalıdır.");
  }
  return secret;
}

export function getRegistrationCode(): string | null {
  const code = process.env.REGISTRATION_CODE;
  if (!code || code.trim().length === 0) return null;
  if (code.length < 12 || code.length > 128) {
    throw new Error("REGISTRATION_CODE 12–128 karakter olmalıdır; kaydı kapatmak için boş bırakın.");
  }
  return code;
}

function flag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} true veya false olmalıdır.`);
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || parsed < min || parsed > max) throw new Error(`${name} ${min}–${max} arasında bir tam sayı olmalıdır.`);
  return parsed;
}

export const getPerformanceLogging = () => flag("PERFORMANCE_LOGGING");

/** Public demo: one-click demo sign-in and periodic data reset. Never enable on a real database. */
export const getDemoMode = () => flag("DEMO_MODE");
export const getDemoResetHours = () => integer("DEMO_RESET_HOURS", 24, 1, 168);
export function getDemoLanguage(): "tr" | "en" {
  const value = process.env.DEMO_LANGUAGE?.trim().toLowerCase() || "tr";
  if (value !== "tr" && value !== "en") throw new Error("DEMO_LANGUAGE tr veya en olmalıdır.");
  return value;
}

export const getPort = () => integer("PORT", 3000, 1, 65535);
/** Number of reverse proxies in front of the app (e.g. 1 on Render/Railway/Fly) so rate limits see real client IPs. */
export const getTrustProxy = () => integer("TRUST_PROXY", 0, 0, 10);
