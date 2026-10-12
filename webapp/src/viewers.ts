import { translate } from "./i18n.ts";
export type Viewer = { user_id: string; seen_at: number };
export type Page = {
  version?: string;
  state?: "tracked" | "expired" | "disabled";
  viewers: Viewer[];
  count: number;
  saturated: boolean;
  next_offset: number;
  has_more: boolean;
};
export function mergeViewers(previous: Viewer[], incoming: Viewer[]): Viewer[] {
  const users = new Map(previous.map((v) => [v.user_id, v]));
  for (const v of incoming) {
    if (!v || !/^[a-z0-9]{26}$/.test(v.user_id)) continue;
    const old = users.get(v.user_id);
    if (!old || v.seen_at < old.seen_at) users.set(v.user_id, v);
  }
  return [...users.values()]
    .sort((a, b) => a.seen_at - b.seen_at || a.user_id.localeCompare(b.user_id))
    .slice(0, 5000);
}
export function viewedTime(
  timestamp: number,
  locale?: string,
  timeZone?: string,
  now = Date.now(),
) {
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    !Number.isFinite(new Date(timestamp).getTime())
  )
    return {
      short: "—",
      full: translate(locale, "invalidTime"),
      iso: undefined,
    };
  const date = new Date(timestamp);
  try {
    const calendar = (value: Date) => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
      }).formatToParts(value);
      const part = (name: string) => parts.find((p) => p.type === name)!.value;
      return { year: part("year"), month: part("month"), day: part("day") };
    };
    const seen = calendar(date);
    const today = calendar(new Date(now));
    // Calendar-day arithmetic: DST days need not contain 24 hours.
    const dayNumber = (p: typeof seen) =>
      Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000;
    const age = dayNumber(today) - dayNumber(seen);
    const prefix =
      age === 0
        ? translate(locale, "today") + ", "
        : age === 1
          ? translate(locale, "yesterday") + ", "
          : `${seen.day}.${seen.month}${seen.year !== today.year ? "." + seen.year : ""}, `;
    return {
      short:
        prefix +
        new Intl.DateTimeFormat(locale, {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone,
        }).format(date),
      full:
        translate(locale, "first") +
        new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
          timeZone,
        }).format(date),
      iso: date.toISOString(),
    };
  } catch {
    return viewedTime(
      timestamp,
      "en",
      undefined,
      Number.isFinite(now) ? now : Date.now(),
    );
  }
}
