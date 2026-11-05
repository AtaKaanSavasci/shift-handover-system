import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";

type DatabaseTiming = { queries: number; durationMs: number };
export type PoolStats = { total: number; idle: number; waiting: number };
export type RequestMetrics = {
  event: "http_request"; method: string; route: string; status: number;
  completed: boolean; durationMs: number; database: DatabaseTiming;
  pool: PoolStats | null; rssBytes: number;
};
export type PerformanceLogger = (metrics: RequestMetrics) => void;
const requests = new AsyncLocalStorage<DatabaseTiming>();
const rounded = (value: number) => Math.round(value * 100) / 100;

// Prisma supplies durations; SQL text and parameters are never retained here.
export function recordDatabaseQuery(durationMs: number) {
  const timing = requests.getStore();
  if (timing && Number.isFinite(durationMs) && durationMs >= 0) {
    timing.queries++;
    timing.durationMs += durationMs;
  }
}

export function requestPerformance(logger: PerformanceLogger, poolStats: () => PoolStats | null): RequestHandler {
  return (req, res, next) => {
    if (req.path === "/app" || req.path.startsWith("/app/")) return next();
    const start = performance.now(), timing = { queries: 0, durationMs: 0 };
    const prefix = ["/operations", "/ai"].find(path => req.path.startsWith(path + "/")) ?? "";
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      res.off("finish", report); res.off("close", report);
      try {
        // Use route templates, never raw URLs, query strings, IDs or user data.
        const route = typeof req.route?.path === "string" ? prefix + req.route.path : "unmatched";
        logger({ event: "http_request", method: req.method, route, status: res.statusCode,
          completed: res.writableFinished, durationMs: rounded(performance.now() - start),
          database: { queries: timing.queries, durationMs: rounded(timing.durationMs) },
          pool: poolStats(), rssBytes: process.memoryUsage.rss() });
      } catch { /* Diagnostics must not change a response or crash the process. */ }
    };
    res.once("finish", report); res.once("close", report);
    requests.run(timing, next);
  };
}
