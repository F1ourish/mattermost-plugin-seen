import { test } from "node:test";
import assert from "node:assert/strict";
import { HTTPError, retryAfter } from "./transport.ts";
import { Runtime, Dwell, DWELL_MS } from "./runtime.ts";

test("20 visible messages use one batch; confirmed duplicates do not send", async () => {
  let now = 0;
  const calls: string[][] = [];
  const r = new Runtime(
    async (_p, body: any) => {
      calls.push(body.post_ids);
      return {
        results: Object.fromEntries(
          body.post_ids.map((id: string) => [id, "ok"]),
        ),
      };
    },
    () => now,
    () => 0,
  );
  for (let i = 0; i < 20; i++) r.mark(String(i));
  now = 500;
  await r.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 20);
  r.mark("0");
  await r.flush();
  assert.equal(calls.length, 1);
  r.stop();
});
test("queue is bounded; retry exhaustion preserves pending intent and reconnect recovers", async () => {
  let now = 0,
    calls = 0,
    offline = true;
  const r = new Runtime(
    async (_p, body: any) => {
      calls++;
      if (offline) throw Error("offline");
      return {
        results: Object.fromEntries(
          body.post_ids.map((id: string) => [id, "ok"]),
        ),
      };
    },
    () => now,
    () => 0,
  );
  for (let i = 0; i < 600; i++) r.mark(String(i));
  assert.equal(r.pending.size, 500);
  assert.equal(r.mark("extra"), false);
  // Process all 10 batches at each backoff boundary.
  for (let attempt = 0; attempt < 5; attempt++) {
    now += 20000;
    for (let batch = 0; batch < 10; batch++) await r.flush();
  }
  assert.equal(calls, 50);
  assert.equal(r.pending.size, 0);
  assert.equal(r.deferred.size, 500);
  assert.equal(r.confirmed.size, 0);
  offline = false;
  r.resume(true);
  now += 500;
  await r.flush();
  assert.equal(r.confirmed.size, 50);
  assert.equal(r.mark("extra"), true);
  r.stop();
});
test("only explicit success confirms; unavailable recovers and Retry-After is respected", async () => {
  let now = 0,
    calls = 0;
  let result: unknown = { results: { p: "unavailable" } };
  const r = new Runtime(
    async () => {
      calls++;
      if (result instanceof Error) throw result;
      return result;
    },
    () => now,
    () => 0,
  );
  r.mark("p");
  now = 500;
  await r.flush();
  assert.equal(r.confirmed.size, 0);
  assert.equal(r.deferred.size, 1);
  now += 30000;
  r.resume();
  now += 500;
  result = new HTTPError(429, 60000);
  await r.flush();
  r.resume(true);
  now += 10000;
  await r.flush();
  assert.equal(calls, 2);
  now += 60000;
  result = { results: { p: "future_unknown_status" } };
  await r.flush();
  assert.equal(r.confirmed.size, 0);
  now += 10000;
  result = { results: { p: "ok" } };
  await r.flush();
  assert.equal(r.confirmed.has("p"), true);
  r.stop();
  assert.equal(retryAfter("2"), 2000);
  assert.equal(retryAfter("invalid"), 0);
});
test("401 pauses delivery and deferred entries expire without extending TTL", async () => {
  let now = 0,
    calls = 0;
  const r = new Runtime(
    async () => {
      calls++;
      throw new HTTPError(401);
    },
    () => now,
  );
  r.mark("p");
  now = 500;
  await r.flush();
  r.resume(true);
  assert.equal(r.mark("q"), false);
  await r.flush();
  assert.equal(calls, 1);
  now = 600001;
  r.prune();
  assert.equal(r.deferred.size, 0);
  r.stop();
});
test("summary failure is unknown, permission rejection clears private cache", async () => {
  let error = new HTTPError(503);
  const r = new Runtime(async () => {
    throw error;
  });
  r.subscribe("p", () => {});
  await r.fetchSummaries();
  assert.equal(r.summaries.get("p")?.state, "unknown");
  error = new HTTPError(403);
  r.refresh(["p"]);
  await r.fetchSummaries();
  assert.equal(r.summaries.has("p"), false);
  r.stop();
});
test("queue rejection does not complete dwell", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let accept = false,
    n = 0;
  const d = new Dwell(() => {
    n++;
    return accept;
  });
  d.update(true, true);
  t.mock.timers.tick(DWELL_MS);
  assert.equal(d.done, false);
  accept = true;
  t.mock.timers.tick(DWELL_MS);
  assert.equal(d.done, true);
  assert.equal(n, 2);
  d.cancel();
});
test("remount refetches; missing authorization clears cache", async () => {
  let n = 0;
  const r = new Runtime(async () => ({
    summaries: ++n === 1 ? { post: { count: 2, saturated: false } } : {},
  }));
  const off = r.subscribe("post", () => {});
  await r.fetchSummaries();
  assert.equal(r.summaries.get("post")?.count, 2);
  off();
  assert.equal(r.summaries.has("post"), false);
  r.subscribe("post", () => {});
  await r.fetchSummaries();
  assert.equal(r.summaries.has("post"), false);
  r.stop();
});
test("fast scrolling, blur, hidden state reset uninterrupted dwell", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let n = 0;
  const d = new Dwell(() => {
    n++;
    return true;
  });
  d.update(true, true);
  t.mock.timers.tick(DWELL_MS - 1);
  d.update(false, true);
  t.mock.timers.tick(1000);
  assert.equal(n, 0);
  d.update(true, true);
  t.mock.timers.tick(400);
  d.update(true, false);
  t.mock.timers.tick(1000);
  assert.equal(n, 0);
  d.update(true, true);
  t.mock.timers.tick(DWELL_MS);
  assert.equal(n, 1);
  d.update(true, true);
  t.mock.timers.tick(DWELL_MS);
  assert.equal(n, 1);
  d.cancel();
});
test("disable prevents in-flight summary response restoring private cache", async () => {
  let resolve!: (v: any) => void;
  const r = new Runtime(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  r.subscribe("post", () => {});
  const pending = r.fetchSummaries();
  r.stop();
  resolve({ summaries: { post: { count: 1 } } });
  await pending;
  assert.equal(r.summaries.size, 0);
});
test("500 terminal receipts do not block a fresh view or count as confirmed", async () => {
  let now = 0,
    calls = 0;
  const r = new Runtime(
    async (_p, body: any) => {
      calls++;
      return {
        results: Object.fromEntries(
          body.post_ids.map((id: string) => [
            id,
            id === "fresh" ? "ok" : "expired",
          ]),
        ),
      };
    },
    () => now,
  );
  for (let i = 0; i < 500; i++) r.mark(String(i));
  now = 500;
  for (let i = 0; i < 10; i++) await r.flush();
  assert.equal(r.pending.size + r.deferred.size, 0);
  assert.equal(r.terminal.size, 500);
  assert.equal(r.confirmed.size, 0);
  r.mark("1");
  await r.flush();
  assert.equal(calls, 10);
  assert.equal(r.mark("fresh"), true);
  now += 500;
  await r.flush();
  assert.equal(r.confirmed.has("fresh"), true);
  now = 600001;
  r.prune();
  assert.equal(r.terminal.size, 0);
  r.stop();
});
test("late receipt response after stop cannot populate a new runtime", async () => {
  let now = 0,
    resolve!: (value: unknown) => void;
  const old = new Runtime(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    () => now,
  );
  old.mark("post");
  now = 500;
  const work = old.flush();
  old.stop();
  const next = new Runtime(async () => ({ results: {} }));
  resolve({ results: { post: "ok" } });
  await work;
  assert.equal(old.confirmed.size, 0);
  assert.equal(next.confirmed.size, 0);
  next.stop();
});
