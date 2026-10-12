import { test } from "node:test";
import assert from "node:assert/strict";
import { ViewerSession, parsePage } from "./viewer_session.ts";
import { HTTPError, ReadCooldown } from "./transport.ts";
import { ProfileCache } from "./profile_cache.ts";
import { translate, viewedLabel } from "./i18n.ts";
const id = (n: number) => String(n).padStart(26, "0");
const page = (offset: number, count: number) => ({
  count,
  saturated: false,
  has_more: offset + 50 < count,
  next_offset: Math.min(count, offset + 50),
  viewers: Array.from(
    { length: Math.max(0, Math.min(50, count - offset)) },
    (_, i) => ({ user_id: id(offset + i), seen_at: 1000 + offset + i }),
  ),
});

test("refresh preserves loaded pages until success; transient is stale, denied clears", async () => {
  let count = 70,
    failure: Error | undefined,
    resolve!: () => void;
  let wait = false;
  const s = new ViewerSession(
    async (offset) => {
      if (wait)
        await new Promise<void>((done) => {
          resolve = done;
        });
      if (failure) throw failure;
      return page(offset, count);
    },
    () => {},
  );
  await s.load();
  await s.load(true);
  assert.equal(s.state.page?.viewers.length, 70);
  wait = true;
  count = 71;
  const work = s.load();
  assert.equal(s.state.page?.viewers.length, 70);
  assert.equal(s.state.loading, true);
  wait = false;
  resolve();
  await work;
  assert.equal(s.state.page?.viewers.length, 71);
  failure = new HTTPError(503, 5000);
  await s.load();
  assert.equal(s.state.page?.viewers.length, 71);
  assert.equal(s.state.error, true);
  s.notBefore = 0;
  failure = new HTTPError(403);
  await s.load();
  assert.equal(s.state.page, undefined);
  s.stop();
});
test("continuous invalidations do not postpone refresh; late response is ignored", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0,
    resolve!: (value: unknown) => void;
  const s = new ViewerSession(
    () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
    () => {},
  );
  for (let i = 0; i < 10; i++) {
    s.invalidate();
    t.mock.timers.tick(20);
  }
  assert.equal(calls, 1);
  s.stop();
  resolve(page(0, 1));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(s.state.page, undefined);
});
test("invalid page is rejected and Retry-After gate is shared across reads", () => {
  assert.throws(() =>
    parsePage(
      { ...page(0, 1), viewers: [{ user_id: id(0), seen_at: NaN }] },
      0,
    ),
  );
  assert.throws(() => parsePage({ ...page(0, 70), next_offset: 0 }, 0));
  const gate = new ReadCooldown();
  gate.observe(new HTTPError(429, 4000), 100);
  assert.throws(
    () => gate.check(200),
    (e: unknown) => e instanceof HTTPError && e.retryAfterMs === 3900,
  );
  gate.check(4100);
});
test("profile requests deduplicate concurrent consumers and cannot restore stopped cache", async () => {
  let calls = 0,
    resolve!: (value: unknown) => void;
  const cache = new ProfileCache(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const first = cache.load([id(1)]),
    second = cache.load([id(1)]);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve([{ id: id(1), first_name: "Анна" }]);
  await Promise.all([first, second]);
  assert.equal(cache.get(id(1))?.first_name, "Анна");
  await cache.load([id(1)]);
  assert.equal(calls, 1);
  const late = cache.load([id(2)]);
  await Promise.resolve();
  cache.stop();
  resolve([{ id: id(2), first_name: "Late" }]);
  await late;
  assert.equal(cache.entries.size, 0);
});
test("Russian and English labels use current locale with English fallback", () => {
  assert.equal(translate("ru-RU", "empty"), "Пока не просмотрено");
  assert.equal(translate("en", "empty"), "Not viewed yet");
  assert.equal(viewedLabel("ru", 3), "Просмотрели: 3");
  assert.equal(translate("xx", "retry"), "Retry");
});

test("unchanged version refresh uses one request and keeps all loaded viewers", async () => {
  let calls = 0;
  const s = new ViewerSession(
    async (offset) => {
      calls++;
      return { ...page(offset, 120), version: "a".repeat(64) };
    },
    () => {},
  );
  await s.load();
  await s.load(true);
  await s.load(true);
  assert.equal(s.state.page?.viewers.length, 120);
  calls = 0;
  await s.load();
  assert.equal(calls, 1);
  assert.equal(s.state.page?.viewers.length, 120);
  s.stop();
});
test("closing a consumer skips queued profiles without cancelling another consumer", async () => {
  let calls = 0,
    resolve!: (v: unknown) => void;
  const cache = new ProfileCache(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const closed = new AbortController();
  const first = cache.load(
    Array.from({ length: 100 }, (_, n) => id(n)),
    closed.signal,
  );
  await Promise.resolve();
  const other = cache.load([id(60)]);
  closed.abort();
  resolve([]);
  // Drain the first work and start the queued, still-requested batch.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(calls, 2);
  resolve([{ id: id(60), first_name: "Still needed" }]);
  await Promise.all([first, other]);
  assert.equal(cache.get(id(60))?.first_name, "Still needed");
  assert.equal(cache.consumers.size, 0);
  const cancel = new AbortController();
  const skipped = cache.load([id(200)], cancel.signal);
  cancel.abort();
  await skipped;
  assert.equal(calls, 2);
  cache.stop();
});

test("five-row preview refresh does not drain additional pages", async () => {
  const offsets: number[] = [];
  let count = 70;
  const session = new ViewerSession(
    async (offset) => {
      offsets.push(offset);
      return {
        count,
        saturated: false,
        has_more: true,
        next_offset: offset + 5,
        viewers: Array.from({ length: 5 }, (_, i) => ({
          user_id: id(i),
          seen_at: 1000 + i,
        })),
      };
    },
    () => {},
    5,
  );
  await session.load();
  count = 71;
  await session.load();
  assert.deepEqual(offsets, [0, 0]);
  assert.equal(session.state.page?.viewers.length, 5);
  assert.equal(session.state.page?.count, 71);
  session.stop();
});
