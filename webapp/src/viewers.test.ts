import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeViewers, viewedTime } from "./viewers.ts";
test("viewer pages merge in first-view order without duplicating users", () => {
  const a = "a".repeat(26),
    b = "b".repeat(26),
    c = "c".repeat(26);
  assert.deepEqual(
    mergeViewers(
      [{ user_id: b, seen_at: 200 }],
      [
        { user_id: a, seen_at: 100 },
        { user_id: b, seen_at: 300 },
        { user_id: c, seen_at: 200 },
      ],
    ),
    [
      { user_id: a, seen_at: 100 },
      { user_id: b, seen_at: 200 },
      { user_id: c, seen_at: 200 },
    ],
  );
});
test("first-view time respects timezone; invalid values never display epoch", () => {
  const timestamp = Date.parse("2026-09-28T08:24:00Z");
  assert.equal(
    viewedTime(timestamp, "ru", "Europe/Moscow", timestamp).short,
    "Сегодня, 11:24",
  );
  assert.equal(
    viewedTime(timestamp, "en-GB", "UTC", timestamp).short,
    "Today, 08:24",
  );
  assert.equal(viewedTime(0).short, "—");
  assert.equal(viewedTime(NaN).short, "—");
  assert.ok(viewedTime(timestamp, "bad_locale", "Invalid/Zone").iso);
});

test("dates distinguish yesterday, earlier dates, years and timezone midnight", () => {
  const at = Date.parse("2026-09-28T08:24:00Z");
  assert.equal(
    viewedTime(at, "ru", "Europe/Moscow", Date.parse("2026-09-29T07:00Z"))
      .short,
    "Вчера, 11:24",
  );
  assert.equal(
    viewedTime(at, "ru", "Europe/Moscow", Date.parse("2026-09-30T07:00Z"))
      .short,
    "28.09, 11:24",
  );
  assert.equal(
    viewedTime(at, "ru", "Europe/Moscow", Date.parse("2027-01-01T07:00Z"))
      .short,
    "28.09.2026, 11:24",
  );
  const midnight = Date.parse("2026-09-28T21:15Z");
  assert.equal(
    viewedTime(midnight, "ru", "Europe/Moscow", Date.parse("2026-09-29T07:00Z"))
      .short,
    "Сегодня, 00:15",
  );
  assert.equal(
    viewedTime(
      Date.parse("2026-03-08T05:30Z"),
      "en",
      "America/New_York",
      Date.parse("2026-03-09T04:15Z"),
    ).short,
    "Yesterday, 00:30",
  );
});
