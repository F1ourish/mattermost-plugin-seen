import { HTTPError, record } from "./transport.ts";
import { mergeViewers } from "./viewers.ts";
import type { Page } from "./viewers.ts";

export type ViewerState = { page?: Page; loading: boolean; error: boolean };
type RequestPage = (offset: number, signal: AbortSignal) => Promise<unknown>;

// One active request sequence per panel. Invalidation is a throttle, not a
// trailing debounce: continuous WS traffic cannot postpone the first refresh.
export class ViewerSession {
  state: ViewerState = { loading: false, error: false };
  request: RequestPage;
  changed: () => void;
  controller = new AbortController();
  timer?: ReturnType<typeof setTimeout>;
  dirty = false;
  busy = false;
  stopped = false;
  pageSize: number;
  failures = 0;
  notBefore = 0;

  constructor(request: RequestPage, changed: () => void, pageSize = 50) {
    this.pageSize = pageSize;
    this.request = request;
    this.changed = changed;
  }
  invalidate() {
    if (this.stopped) return;
    this.dirty = true;
    this.schedule();
  }
  schedule(delay = 100) {
    if (this.stopped || this.busy || this.timer) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        if (Date.now() < this.notBefore) {
          this.schedule();
          return;
        }
        if (this.dirty) void this.load(false);
      },
      Math.min(60000, Math.max(delay, this.notBefore - Date.now())),
    );
  }
  async load(append = false) {
    if (this.stopped || this.busy) return;
    if (Date.now() < this.notBefore) {
      this.invalidate();
      return;
    }
    if (append && (!this.state.page?.has_more || this.state.error)) return;
    this.busy = true;
    this.dirty = false;
    this.state = { ...this.state, loading: true };
    this.changed();
    const previous = this.state.page;
    // Refresh all loaded pages atomically, keeping the rendered rows and
    // their keyed DOM nodes until the entire authorized refresh succeeds.
    const target = Math.max(this.pageSize, previous?.viewers.length || 0);
    let offset = append ? previous!.next_offset : 0;
    let viewers = append ? previous!.viewers : [];
    try {
      let page: Page;
      do {
        const data = await this.request(offset, this.controller.signal);
        if (this.stopped) return;
        page = parsePage(data, offset);
        if (
          !append &&
          offset === 0 &&
          page.version &&
          page.version === previous?.version &&
          page.state === previous.state &&
          page.count === previous.count
        ) {
          this.failures = 0;
          this.state = { page: previous, loading: false, error: false };
          return;
        }
        viewers = mergeViewers(viewers, page.viewers);
        offset = page.next_offset;
      } while (!append && page.has_more && offset < target && offset < 5000);
      this.failures = 0;
      this.state = { page: { ...page, viewers }, loading: false, error: false };
    } catch (error) {
      if (this.stopped) return;
      const denied =
        error instanceof HTTPError && [401, 403, 404].includes(error.status);
      this.state = {
        page: denied ? undefined : previous,
        loading: false,
        error: true,
      };
      this.failures++;
      if (
        !denied &&
        (!(error instanceof HTTPError) || error.retryable) &&
        this.failures < 5
      ) {
        this.notBefore =
          Date.now() +
          Math.max(
            1000 * 2 ** (this.failures - 1),
            error instanceof HTTPError ? error.retryAfterMs : 0,
          );
        this.dirty = true;
      } else this.dirty = false;
    } finally {
      this.busy = false;
      if (!this.stopped) {
        this.changed();
        if (this.dirty) this.schedule();
      }
    }
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller.abort();
    this.state = { loading: false, error: false };
  }
}

export function parsePage(value: unknown, offset: number): Page {
  if (
    !record(value) ||
    !Array.isArray(value.viewers) ||
    (value.version !== undefined &&
      (typeof value.version !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.version))) ||
    value.viewers.length > 50 ||
    !Number.isInteger(value.count) ||
    (value.count as number) < 0 ||
    (value.count as number) > 5000 ||
    !Number.isInteger(value.next_offset) ||
    (value.next_offset as number) < 0 ||
    (value.next_offset as number) > 5000 ||
    typeof value.has_more !== "boolean" ||
    typeof value.saturated !== "boolean" ||
    (value.has_more && (value.next_offset as number) <= offset) ||
    (value.state !== undefined &&
      !["tracked", "expired", "disabled"].includes(String(value.state))) ||
    value.viewers.some(
      (v) =>
        !record(v) ||
        typeof v.user_id !== "string" ||
        !/^[a-z0-9]{26}$/.test(v.user_id) ||
        !Number.isFinite(v.seen_at) ||
        (v.seen_at as number) <= 0,
    )
  ) {
    throw Error("Invalid viewers page");
  }
  return value as Page;
}
