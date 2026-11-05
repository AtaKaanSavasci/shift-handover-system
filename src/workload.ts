import { RequestError } from "./services/shift-query.js";

export class WorkloadBusyError extends RequestError {
  readonly retryAfterSeconds = 3;
  constructor() { super("Sunucu şu anda yoğun. Birkaç saniye sonra tekrar deneyin.", 503); }
}

// Reject excess work before buffering uploads or building workbooks. No queue
// retains request bodies. A disconnected response does not release running work.
export function createWorkLimit(limit = 1) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Work limit must be a positive integer.");
  let active = 0;
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (active >= limit) throw new WorkloadBusyError();
      active++;
      try { return await work(); }
      finally { active--; }
    }
  };
}
