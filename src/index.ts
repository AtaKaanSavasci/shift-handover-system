import { createPrismaClient } from "./database.js";
import { createApp } from "./app.js";
import { getJwtSecret, getRegistrationCode, getPerformanceLogging } from "./config.js";
import type { PerformanceLogger } from "./performance.js";

const secret = getJwtSecret();
const registrationCode = getRegistrationCode();
const performanceLogging = getPerformanceLogging();
const prisma = createPrismaClient(undefined, { measureQueries: performanceLogging });
const performanceLogger: PerformanceLogger = metrics => console.log(JSON.stringify(metrics));
const app = createApp(prisma, secret, { registrationCode, ...(performanceLogging ? { performanceLogger } : {}) });
app.listen(3000, () => { console.log("Server is running on port 3000"); });
