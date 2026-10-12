export class HTTPError extends Error {
  status: number;
  retryAfterMs: number;
  constructor(status: number, retryAfterMs = 0) {
    super(`Request failed (${status})`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
  get retryable() {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
export function retryAfter(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
}
export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Shared by summaries, viewers and native profile reads. Receipt delivery has
// its own backoff. Do not queue hidden panels while a server cooldown is active.
export class ReadCooldown {
  until = 0;
  status = 429;
  check(now = Date.now()) {
    if (now < this.until) throw new HTTPError(this.status, this.until - now);
  }
  observe(error: HTTPError, now = Date.now()) {
    if (error.status === 429 || error.status === 503) {
      this.status = error.status;
      this.until = Math.max(
        this.until,
        now + Math.max(1000, error.retryAfterMs),
      );
    }
  }
}
