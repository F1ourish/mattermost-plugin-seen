import { HTTPError, record } from "./transport.ts";
export const BATCH_SIZE = 50;
export const FLUSH_MS = 500;
export const DWELL_MS = 800;
export const VISIBILITY_RATIO = 0.5;
export const QUEUE_TTL_MS = 10 * 60 * 1000;
export type Summary = {
  count: number;
  saturated: boolean;
  state?: "tracked" | "expired" | "disabled" | "unknown";
};
export type Transport = (path: string, body?: unknown) => Promise<unknown>;
type Pending = { attempt: number; nextAt: number; expires: number };
type Deferred = {
  reason: string;
  retryAt: number;
  expires: number;
  blocked: boolean;
};

export class Runtime {
  pending = new Map<string, Pending>();
  deferred = new Map<string, Deferred>();
  confirmed = new Set<string>();
  terminal = new Map<string, number>();
  summaries = new Map<string, Summary>();
  listeners = new Map<string, Set<() => void>>();
  dirty = new Set<string>();
  timers = new Set<ReturnType<typeof setTimeout>>();
  sending = false;
  fetching = false;
  fetchScheduled = false;
  stopped = false;
  authBlocked = false;
  notBefore = 0;
  markTimer?: ReturnType<typeof setTimeout>;
  request: Transport;
  now: () => number;
  random: () => number;
  constructor(
    request: Transport,
    now = () => Date.now(),
    random = () => Math.random(),
  ) {
    this.request = request;
    this.now = now;
    this.random = random;
  }
  later(fn: () => void, delay: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, delay);
    this.timers.add(t);
  }
  prune() {
    const now = this.now();
    for (const [id, v] of this.pending)
      if (v.expires <= now) this.pending.delete(id);
    for (const [id, v] of this.deferred)
      if (v.expires <= now) this.deferred.delete(id);
    for (const [id, expires] of this.terminal)
      if (expires <= now) this.terminal.delete(id);
  }
  mark(id: string): boolean {
    if (this.stopped || this.authBlocked) return false;
    this.prune();
    if (
      this.confirmed.has(id) ||
      this.terminal.has(id) ||
      this.pending.has(id) ||
      this.deferred.has(id)
    )
      return true;
    if (this.pending.size + this.deferred.size >= 500) return false;
    this.pending.set(id, {
      attempt: 0,
      nextAt: this.now() + FLUSH_MS,
      expires: this.now() + QUEUE_TTL_MS,
    });
    this.schedule();
    return true;
  }
  schedule() {
    clearTimeout(this.markTimer);
    this.markTimer = undefined;
    if (this.stopped || this.sending || this.authBlocked || !this.pending.size)
      return;
    const at = Math.max(
      this.notBefore,
      Math.min(...[...this.pending.values()].map((v) => v.nextAt)),
    );
    // Periodic wake for very large Retry-After avoids timer overflow; flush still enforces notBefore.
    this.markTimer = setTimeout(
      () => {
        this.markTimer = undefined;
        void this.flush();
      },
      Math.min(60000, Math.max(1, at - this.now())),
    );
  }
  resume(force = false) {
    if (this.stopped || this.authBlocked) return;
    this.prune();
    for (const [id, v] of this.deferred) {
      if (
        !v.blocked &&
        (v.retryAt <= this.now() || (force && v.reason === "retry"))
      ) {
        this.deferred.delete(id);
        this.pending.set(id, {
          attempt: 0,
          nextAt: this.now() + FLUSH_MS,
          expires: v.expires,
        });
      }
    }
    this.schedule();
  }
  async flush() {
    if (this.sending || this.stopped || this.authBlocked) return;
    this.prune();
    if (this.now() < this.notBefore) {
      this.schedule();
      return;
    }
    const ids = [...this.pending]
      .filter(([, v]) => v.nextAt <= this.now())
      .slice(0, BATCH_SIZE)
      .map(([id]) => id);
    if (!ids.length) {
      this.schedule();
      return;
    }
    this.sending = true;
    let results: Record<string, unknown> = {};
    let error: unknown;
    try {
      const response = await this.request("/receipts/batch", { post_ids: ids });
      if (record(response) && record(response.results))
        results = response.results;
    } catch (e) {
      error = e;
    }
    if (this.stopped) return;
    if (error instanceof HTTPError) {
      if (error.status === 401) this.authBlocked = true;
      this.notBefore = Math.max(
        this.notBefore,
        this.now() + error.retryAfterMs,
      );
    }
    for (const id of ids) {
      const entry = this.pending.get(id);
      if (!entry) continue;
      const status = results[id];
      if (
        status === "ok" ||
        status === "recorded" ||
        status === "already_recorded"
      ) {
        this.pending.delete(id);
        this.confirmed.add(id);
        if (this.confirmed.size > 2000)
          this.confirmed.delete(this.confirmed.values().next().value!);
      } else if (
        status === "expired" ||
        status === "self" ||
        (error instanceof HTTPError && !error.retryable)
      ) {
        this.pending.delete(id);
        this.terminal.set(id, entry.expires);
        if (this.terminal.size > 2000)
          this.terminal.delete(this.terminal.keys().next().value!);
      } else if (status === "unavailable" || status === "capacity") {
        this.pending.delete(id);
        this.deferred.set(id, {
          reason: typeof status === "string" ? status : "http_rejected",
          retryAt: this.now() + 30000,
          expires: entry.expires,
          blocked: false,
        });
      } else {
        entry.attempt++;
        if (entry.attempt >= 5) {
          this.pending.delete(id);
          this.deferred.set(id, {
            reason: "retry",
            retryAt: this.now() + 30000,
            expires: entry.expires,
            blocked: false,
          });
        } else
          entry.nextAt =
            this.now() +
            Math.min(16000, FLUSH_MS * 2 ** entry.attempt) *
              (1 + this.random() * 0.25);
      }
    }
    this.sending = false;
    this.schedule();
  }
  subscribe(id: string, fn: () => void) {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(fn);
    this.refresh([id]);
    return () => {
      set!.delete(fn);
      if (!set!.size) {
        this.listeners.delete(id);
        this.summaries.delete(id);
        this.dirty.delete(id);
      }
    };
  }
  refresh(ids = [...this.listeners.keys()]) {
    for (const id of ids) if (this.listeners.has(id)) this.dirty.add(id);
    if (this.fetchScheduled || this.fetching || this.stopped) return;
    this.fetchScheduled = true;
    this.later(() => {
      this.fetchScheduled = false;
      void this.fetchSummaries();
    }, 100);
  }
  async fetchSummaries() {
    if (this.fetching || this.stopped) return;
    const ids = [...this.dirty].slice(0, BATCH_SIZE);
    if (!ids.length) return;
    ids.forEach((id) => this.dirty.delete(id));
    this.fetching = true;
    try {
      const response = await this.request("/summaries", { post_ids: ids });
      if (!record(response) || !record(response.summaries))
        throw Error("Invalid summary response");
      const data = response.summaries;
      if (!this.stopped)
        for (const id of ids) {
          if (!this.listeners.has(id)) continue;
          // Missing authorization must clear any previously displayed receipt.
          const item = data[id];
          if (item === undefined) this.summaries.delete(id);
          else if (
            record(item) &&
            Number.isInteger(item.count) &&
            (item.count as number) >= 0 &&
            typeof item.saturated === "boolean" &&
            (item.state === undefined ||
              ["tracked", "expired", "disabled"].includes(String(item.state)))
          )
            this.summaries.set(id, item as Summary);
          else
            this.summaries.set(id, {
              count: 0,
              saturated: false,
              state: "unknown",
            });
          this.listeners.get(id)?.forEach((fn) => fn());
        }
    } catch (error) {
      if (!this.stopped)
        for (const id of ids) {
          if (!this.listeners.has(id)) continue;
          if (
            error instanceof HTTPError &&
            [401, 403, 404].includes(error.status)
          )
            this.summaries.delete(id);
          else
            this.summaries.set(id, {
              count: 0,
              saturated: false,
              state: "unknown",
            });
          this.listeners.get(id)?.forEach((fn) => fn());
        }
      // Active refresh/reconnect retries; no fast infinite retry loop.
    }
    this.fetching = false;
    if (this.dirty.size) this.refresh([]);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.markTimer);
    this.deferred.clear();
    this.terminal.clear();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.pending.clear();
    this.confirmed.clear();
    this.summaries.clear();
    this.listeners.clear();
    this.dirty.clear();
  }
}

export class Dwell {
  timer?: ReturnType<typeof setTimeout>;
  done = false;
  visible = false;
  active = false;
  seen: () => boolean;
  constructor(seen: () => boolean) {
    this.seen = seen;
  }
  update(visible: boolean, active: boolean) {
    this.visible = visible;
    this.active = active;
    if (!visible || !active) {
      this.cancel();
      return;
    }
    if (this.timer || this.done) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.visible || !this.active) return;
      this.done = this.seen();
      // Queue rejection is not a completed observation. Retry only while visible/active.
      if (!this.done) this.update(this.visible, this.active);
    }, DWELL_MS);
  }
  reset() {
    this.cancel();
    this.done = false;
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
