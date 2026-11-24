import { createPrismaClient } from "../database.js";
import { getDemoLanguage, getDemoMode } from "../config.js";
import { seedDemo } from "./seed.js";

// Usage: DEMO_MODE=true npm run demo:seed [-- --force]
// Wipes the database and loads demo data. --force also wipes non-demo accounts.
if (!getDemoMode()) {
  console.error("Refusing to seed: set DEMO_MODE=true. Seeding deletes every record in DATABASE_URL.");
  process.exit(1);
}
const prisma = createPrismaClient();
try {
  const result = await seedDemo(prisma, { language: getDemoLanguage(), force: process.argv.includes("--force") });
  console.log(`Demo data loaded: ${result.users} users, ${result.shifts} shifts, ${result.entries} entries.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
