import { createPrismaClient } from "./database.js";
import { createApp } from "./app.js";
import { getJwtSecret, getRegistrationCode, getPerformanceLogging, getDemoMode, getDemoResetHours, getDemoLanguage, getPort, getTrustProxy } from "./config.js";
import type { PerformanceLogger } from "./performance.js";
import { demoNeedsReset, seedDemo } from "./demo/seed.js";

const secret = getJwtSecret();
const registrationCode = getRegistrationCode();
const performanceLogging = getPerformanceLogging();
const demo = getDemoMode();
const prisma = createPrismaClient(undefined, { measureQueries: performanceLogging });
const performanceLogger: PerformanceLogger = metrics => console.log(JSON.stringify(metrics));
const app = createApp(prisma, secret, { registrationCode, demo, trustProxy: getTrustProxy(), ...(performanceLogging ? { performanceLogger } : {}) });

if (demo) {
  const resetHours = getDemoResetHours(), language = getDemoLanguage();
  const resetIfDue = async () => {
    try {
      if (!await demoNeedsReset(prisma, resetHours)) return;
      const result = await seedDemo(prisma, { language });
      console.log(`Demo data reset: ${result.users} users, ${result.shifts} shifts, ${result.entries} entries.`);
    } catch (error) {
      console.error("Demo reset failed:", error instanceof Error ? error.message : error);
    }
  };
  await resetIfDue();
  // Hourly check; the data itself is replaced only every DEMO_RESET_HOURS.
  setInterval(() => { void resetIfDue(); }, 60 * 60 * 1000).unref();
}

const port = getPort();
app.listen(port, () => { console.log(`Server is running on port ${port}${demo ? " (demo mode)" : ""}`); });
