import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Runtime, Dwell, VISIBILITY_RATIO } from "./runtime";
import { mountInline } from "./inline";
import { ReadCooldown, HTTPError, retryAfter } from "./transport";
import { viewedTime } from "./viewers";
import type { Page } from "./viewers";
import { displayName } from "./profiles";
import type { ViewerProfile } from "./profiles";

import { ViewerSession } from "./viewer_session";
import { ProfileCache } from "./profile_cache";
import { translate, viewedLabel } from "./i18n";
import type { TextKey } from "./i18n";

const ID = "ru.internal.mattermost.seen";
type Post = {
  id: string;
  user_id: string;
  channel_id: string;
  delete_at: number;
  type: string;
};
type State = {
  entities: {
    users: {
      currentUserId: string;
      profiles?: Record<
        string,
        ViewerProfile & {
          locale?: string;
          timezone?: {
            useAutomaticTimezone: boolean | string;
            automaticTimezone: string;
            manualTimezone: string;
          };
        }
      >;
    };
    channels?: { channels: Record<string, { type: string }> };
    posts: { posts: Record<string, Post> };
    general: { config: { SiteURL?: string; TeammateNameDisplay?: string } };
  };
};
type Store = { getState(): State; subscribe(fn: () => void): () => void };
type Registry = {
  registerPostMessageAttachmentComponent(
    c: React.ComponentType<{
      postId: string;
      onHeightChange?: (h: number) => void;
    }>,
  ): string;
  registerRootComponent(c: React.ComponentType): string;
  registerPostDropdownMenuAction(
    text: string,
    action: (id: string) => void,
    filter: (id: string) => boolean,
  ): string;
  registerWebSocketEventHandler(
    event: string,
    cb: (message: { data: { post_ids?: string[] } }) => void,
  ): void;
  registerReconnectHandler(cb: () => void): void;
};
const PREVIEW_LIMIT = 5;
const css = `
.mmseen-summary-sentinel{display:block;position:absolute;width:1px;height:1px;pointer-events:none}
.mmseen-anchor{display:block;min-height:1px;font-size:12px;line-height:18px}
.mmseen-anchor-inline{height:0;min-height:0;line-height:0}
.mmseen-inline{display:inline;white-space:nowrap;margin-inline-start:4px}
.mmseen-check{display:inline-flex;align-items:center;gap:3px;vertical-align:baseline;border:0;background:transparent;padding:0 2px;color:#4a9ddd;color:color-mix(in srgb,#55ace3 85%,var(--center-channel-color,#3f4350) 15%);cursor:pointer;font-size:12px;line-height:18px;white-space:nowrap}
.mmseen-check-icon{display:block;width:18px;height:12px;flex:none;overflow:visible}
.mmseen-check-count{font-variant-numeric:tabular-nums}
.mmseen-check-unread{color:rgba(var(--center-channel-color-rgb,63,67,80),.6)}
.mmseen-check:focus-visible,.mmseen-panel button:focus-visible,.mmseen-list:focus-visible{outline:2px solid var(--link-color,#1684d9);outline-offset:2px}
.mmseen-panel{box-sizing:border-box;width:300px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:10px;border:1px solid rgba(var(--center-channel-color-rgb,63,67,80),.2);border-radius:8px;background:var(--center-channel-bg,#fff);color:var(--center-channel-color,#333);box-shadow:0 4px 18px #0003;font-size:13px;line-height:20px;z-index:10000;text-align:start}
.mmseen-row{display:flex;align-items:center;gap:7px;min-height:30px}.mmseen-row img,.mmseen-avatar{width:22px;height:22px;border-radius:50%;flex-shrink:0}.mmseen-avatar{display:inline-flex;align-items:center;justify-content:center;background:rgba(var(--center-channel-color-rgb,63,67,80),.12);font-size:11px}.mmseen-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mmseen-time{flex-shrink:0;font-size:12px;font-variant-numeric:tabular-nums;color:rgba(var(--center-channel-color-rgb,63,67,80),.75)}
.mmseen-panel button{background:transparent;color:var(--link-color,#1668b2);border:0;padding:4px;cursor:pointer}.mmseen-panel h4{font-size:13px;margin:0;font-weight:600}.mmseen-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px}.mmseen-list{max-height:min(300px,55vh);overflow-y:auto;overscroll-behavior:contain;padding:2px}.mmseen-panel::backdrop{background:#0005}.mmseen-status{padding:4px 0;color:rgba(var(--center-channel-color-rgb,63,67,80),.8)}.mmseen-close{font-size:18px;line-height:18px}
.mmseen-panel.mmseen-preview{overflow:hidden;display:flex;flex-direction:column}
.mmseen-preview .mmseen-list{max-height:none;min-height:0;flex:0 1 auto}
.mmseen-panel .mmseen-show-all{display:block;width:100%;flex-shrink:0;text-align:start;border-top:1px solid rgba(var(--center-channel-color-rgb,63,67,80),.16);margin-top:6px;padding:9px 2px 2px;font:inherit}
.mmseen-show-all:hover{background:rgba(var(--center-channel-color-rgb,63,67,80),.06)}
.mmseen-panel.mmseen-full[open]{width:460px;max-height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;padding:14px}
.mmseen-full .mmseen-heading{flex-shrink:0;padding-bottom:8px;border-bottom:1px solid rgba(var(--center-channel-color-rgb,63,67,80),.16)}
.mmseen-full .mmseen-list{max-height:min(520px,65vh);min-height:0;flex:0 1 auto}
.mmseen-scope{flex-shrink:0;margin:8px 0 0;padding-top:6px;border-top:1px solid rgba(var(--center-channel-color-rgb,63,67,80),.16);font-size:11px;line-height:16px;color:rgba(var(--center-channel-color-rgb,63,67,80),.75)}
`;

class SeenPlugin {
  store!: Store;
  runtime!: Runtime;
  profiles!: ProfileCache;
  readCooldown = new ReadCooldown();
  locale = () =>
    this.store.getState().entities.users.profiles?.[this.user]?.locale ||
    document.documentElement.lang ||
    "en";
  text = (key: TextKey) => translate(this.locale(), key);
  controllers = new Set<AbortController>();
  generation = 0;
  panelSequence = 0;
  viewerListeners = new Map<string, Set<() => void>>();
  summaryElements = new Map<Element, { id: string; visible: boolean }>();
  observed = new Map<Element, { dwell: Dwell; visible: boolean }>();
  observer?: IntersectionObserver;
  interval?: ReturnType<typeof setInterval>;
  modalListeners = new Set<() => void>();
  modal?: string;
  modalReturnFocus?: HTMLElement;
  suppressHoverUntil = 0;
  stopped = false;
  unsubscribe?: () => void;
  user = "";
  base = "";
  active = () => document.visibilityState === "visible" && document.hasFocus();
  activity = () => {
    for (const v of this.observed.values())
      v.dwell.update(v.visible, this.active());
    if (this.active()) {
      this.runtime.resume();
      for (const v of this.observed.values()) {
        v.dwell.reset();
        v.dwell.update(v.visible, true);
      }
      this.refreshVisible();
    }
  };
  recover = () => {
    if (this.stopped) return;
    this.runtime.resume(true);
    this.runtime.refresh();
    this.activity();
    this.invalidateViewers();
  };
  refreshVisible = () => {
    this.runtime.refresh([
      ...new Set(
        [...this.summaryElements.values()]
          .filter((v) => v.visible)
          .map((v) => v.id),
      ),
    ]);
  };
  invalidateViewers = (ids = [...this.viewerListeners.keys()]) => {
    for (const id of ids) this.viewerListeners.get(id)?.forEach((fn) => fn());
  };
  watchViewers(id: string, fn: () => void) {
    let set = this.viewerListeners.get(id);
    if (!set) {
      set = new Set();
      this.viewerListeners.set(id, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.viewerListeners.delete(id);
    };
  }
  watchSummary(el: Element, id: string) {
    this.summaryElements.set(el, { id, visible: false });
    this.observer?.observe(el);
    return () => {
      this.summaryElements.delete(el);
      this.observer?.unobserve(el);
    };
  }
  request(path: string, body?: unknown, signal?: AbortSignal): Promise<any> {
    return this.requestJSON(`/plugins/${ID}/api/v1${path}`, body, signal);
  }
  async requestJSON(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<any> {
    if (this.stopped) throw new Error("disabled");
    const generation = this.generation;
    const isRead = !path.endsWith("/receipts/batch");
    if (isRead) this.readCooldown.check();
    const controller = new AbortController();
    this.controllers.add(controller);
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 15000);
    const token = document.cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("MMCSRF="))
      ?.slice(7);
    try {
      const response = await fetch(`${this.base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { "X-CSRF-Token": decodeURIComponent(token) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const error = new HTTPError(
          response.status,
          retryAfter(response.headers.get("Retry-After")),
        );
        if (isRead && generation === this.generation && !this.stopped)
          this.readCooldown.observe(error);
        throw error;
      }
      const data = await response.json();
      if (this.stopped || generation !== this.generation)
        throw new Error("Stale session");
      return data;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      this.controllers.delete(controller);
    }
  }
  isDM = (id: string) => {
    const state = this.store.getState();
    const post = state.entities.posts.posts[id];
    return Boolean(
      post && state.entities.channels?.channels[post.channel_id]?.type === "D",
    );
  };
  open = (id?: string, returnFocus?: HTMLElement) => {
    if (id)
      this.modalReturnFocus =
        returnFocus || (document.activeElement as HTMLElement);
    if (!id) this.suppressHoverUntil = Date.now() + 250;
    this.modal = id;
    this.modalListeners.forEach((fn) => fn());
  };
  own = (id: string) => {
    const state = this.store.getState();
    const p = state.entities.posts.posts[id];
    return Boolean(
      p &&
        !p.delete_at &&
        !p.type?.startsWith("system_") &&
        p.user_id === state.entities.users.currentUserId,
    );
  };
  initialize(registry: Registry, store: Store) {
    this.generation++;
    this.stopped = false;
    this.store = store;
    this.user = store.getState().entities.users.currentUserId;
    const siteURL = store.getState().entities.general.config.SiteURL;
    this.base = siteURL
      ? new URL(siteURL, window.location.origin).pathname.replace(/\/$/, "")
      : "";
    this.runtime = new Runtime((path, body) => this.request(path, body));
    this.readCooldown = new ReadCooldown();
    this.profiles = new ProfileCache((ids) =>
      this.requestJSON("/api/v4/users/ids", ids),
    );
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const summary = this.summaryElements.get(e.target);
          if (summary)
            summary.visible =
              e.isIntersecting && e.intersectionRatio >= VISIBILITY_RATIO;
          const v = this.observed.get(e.target);
          if (!v) continue;
          v.visible =
            e.isIntersecting && e.intersectionRatio >= VISIBILITY_RATIO;
          v.dwell.update(v.visible, this.active());
        }
      },
      { threshold: [0, VISIBILITY_RATIO] },
    );
    registry.registerPostMessageAttachmentComponent((props) => (
      <Attachment plugin={this} {...props} />
    ));
    registry.registerRootComponent(() => <Root plugin={this} />);
    registry.registerPostDropdownMenuAction(
      this.text("menu"),
      (id) => this.open(id),
      this.own,
    );
    registry.registerWebSocketEventHandler(`custom_${ID}_changed`, (msg) => {
      if (!this.stopped && Array.isArray(msg.data?.post_ids)) {
        const ids = msg.data.post_ids.slice(0, 50);
        this.runtime.refresh(ids);
        this.invalidateViewers(ids);
      }
    });
    registry.registerReconnectHandler(this.recover);
    window.addEventListener("online", this.recover);
    document.addEventListener("visibilitychange", this.activity);
    window.addEventListener("focus", this.activity);
    window.addEventListener("blur", this.activity);
    this.interval = setInterval(() => {
      if (this.active()) {
        this.runtime.resume();
        for (const v of this.observed.values()) {
          v.dwell.reset();
          v.dwell.update(v.visible, true);
        }
        this.refreshVisible();
        this.invalidateViewers();
      }
    }, 30000);
    this.unsubscribe = store.subscribe(() => {
      if (this.modal && !this.own(this.modal)) this.open();
      // A full application reload is required after a user change; clear sensitive state immediately.
      if (store.getState().entities.users.currentUserId !== this.user) {
        this.open();
        this.uninitialize();
      }
    });
  }
  observe(el: Element, id: string) {
    const dwell = new Dwell(() => this.active() && this.runtime.mark(id));
    this.observed.set(el, { dwell, visible: false });
    this.observer?.observe(el);
    return () => {
      dwell.cancel();
      this.observed.delete(el);
      this.observer?.unobserve(el);
    };
  }
  uninitialize() {
    this.generation++;
    this.stopped = true;
    this.open();
    this.runtime?.stop();
    this.profiles?.stop();
    this.observer?.disconnect();
    this.observed.forEach((v) => v.dwell.cancel());
    this.observed.clear();
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    clearInterval(this.interval);
    document.removeEventListener("visibilitychange", this.activity);
    window.removeEventListener("focus", this.activity);
    window.removeEventListener("blur", this.activity);
    window.removeEventListener("online", this.recover);
    this.summaryElements.clear();
    this.viewerListeners.clear();
    this.unsubscribe?.();
    this.modalListeners.clear();
  }
}
function useLocale(plugin: SeenPlugin) {
  const [locale, setLocale] = useState(plugin.locale);
  useEffect(
    () => plugin.store.subscribe(() => setLocale(plugin.locale())),
    [plugin],
  );
  return locale;
}
function Attachment({
  plugin,
  postId,
  onHeightChange,
}: {
  plugin: SeenPlugin;
  postId: string;
  onHeightChange?: (h: number) => void;
}) {
  const locale = useLocale(plugin);
  const text = (key: TextKey) => translate(locale, key);
  const [hoverId] = useState(() => `mmseen-hover-${++plugin.panelSequence}`);
  const sentinel = useRef<HTMLSpanElement>(null);
  const [, render] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const post = plugin.store.getState().entities.posts.posts[postId];
  const own = plugin.own(postId);
  const hasPost = Boolean(post);
  const activePost = Boolean(
    post && !post.delete_at && !post.type?.startsWith("system_"),
  );
  const summary = plugin.runtime.summaries.get(postId);
  const count = summary?.count || 0;
  const hasSummary = Boolean(summary);
  const [inlineContainer, setInlineContainer] = useState<HTMLElement>();
  const stateText =
    summary?.state === "expired"
      ? text("expired")
      : summary?.state === "disabled"
        ? text("disabled")
        : summary?.state === "unknown"
          ? text("unknown")
          : undefined;
  useEffect(() => {
    if (own && sentinel.current)
      return plugin.watchSummary(sentinel.current, postId);
  }, [plugin, postId, own, hasPost, post?.delete_at]);
  useEffect(() => {
    let previous = plugin.store.getState().entities.posts.posts[postId];
    let user = plugin.store.getState().entities.users.currentUserId;
    return plugin.store.subscribe(() => {
      const state = plugin.store.getState();
      const next = state.entities.posts.posts[postId];
      if (next !== previous || state.entities.users.currentUserId !== user) {
        previous = next;
        user = state.entities.users.currentUserId;
        render((n) => n + 1);
      }
    });
  }, [plugin, postId]);
  useEffect(() => {
    if (!activePost || plugin.stopped) return;
    if (own)
      return plugin.runtime.subscribe(postId, () => render((n) => n + 1));
    if (ref.current) return plugin.observe(ref.current, postId);
  }, [plugin, postId, own, activePost]);
  useLayoutEffect(() => {
    if (!own || !hasSummary || !ref.current || plugin.stopped) return;
    const mounted = mountInline(ref.current, postId, () =>
      onHeightChange?.(ref.current?.offsetHeight || 0),
    );
    // In an unknown host layout render in the attachment itself.
    if (!mounted.container.parentElement)
      ref.current.appendChild(mounted.container);
    setInlineContainer(mounted.container);
    return () => {
      mounted.dispose();
      mounted.container.remove();
      setInlineContainer(undefined);
    };
  }, [plugin, postId, own, hasSummary, onHeightChange]);
  useLayoutEffect(() => {
    onHeightChange?.(ref.current?.offsetHeight || 0);
  }, [count, inlineContainer, onHeightChange]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const enter = () => {
    clearTimeout(closeTimer.current);
    if (!plugin.modal) setHover(true);
  };
  useEffect(() => {
    const close = () => {
      if (plugin.modal) setHover(false);
      render((n) => n + 1);
    };
    plugin.modalListeners.add(close);
    return () => {
      plugin.modalListeners.delete(close);
    };
  }, [plugin]);
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (
        !panel.current?.contains(document.activeElement) &&
        document.activeElement !== button.current
      )
        setHover(false);
    }, 180);
  };
  useEffect(() => {
    if (!hover) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        button.current?.focus();
        setHover(false);
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !button.current?.contains(event.target as Node)
      )
        setHover(false);
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [hover]);
  if (!post || post.delete_at || plugin.stopped) return null;
  const indicator =
    own && summary ? (
      <>
        <button
          ref={button}
          className={`mmseen-check${count ? "" : " mmseen-check-unread"}`}
          aria-label={
            stateText || (count ? viewedLabel(locale, count) : text("empty"))
          }
          title={stateText || (count ? undefined : text("empty"))}
          aria-haspopup="dialog"
          aria-expanded={plugin.modal === postId || (hover && count > 0)}
          aria-controls={
            plugin.modal === postId
              ? `mmseen-modal-${postId}`
              : hover && count > 0
                ? hoverId
                : undefined
          }
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHover(false);
              plugin.open(postId, button.current || undefined);
            }
          }}
          onMouseEnter={count ? enter : undefined}
          onMouseLeave={leave}
          onFocus={
            count
              ? () => {
                  if (Date.now() >= plugin.suppressHoverUntil) enter();
                }
              : undefined
          }
          onBlur={leave}
          onClick={() => {
            setHover(false);
            plugin.open(postId, button.current || undefined);
          }}
        >
          {stateText ? (
            summary?.state === "unknown" ? (
              "?"
            ) : (
              "—"
            )
          ) : (
            <svg
              className="mmseen-check-icon"
              viewBox="0 0 20 12"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M1.5 6.5 5 10 13 2 M8.5 8 10.5 10 18.5 2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {count > 0 && !plugin.isDM(postId) && (
            <span className="mmseen-check-count" aria-hidden="true">
              {count}
            </span>
          )}
        </button>
        {count > 0 && hover && button.current && (
          <Hover
            panelId={hoverId}
            plugin={plugin}
            id={postId}
            anchor={button.current}
            panelRef={panel}
            enter={enter}
            leave={leave}
          />
        )}
      </>
    ) : null;
  return (
    <div ref={ref} className="mmseen-anchor">
      {own && (
        <span
          ref={sentinel}
          className="mmseen-summary-sentinel"
          aria-hidden="true"
        />
      )}
      {inlineContainer ? createPortal(indicator, inlineContainer) : indicator}
    </div>
  );
}
function Avatar({
  plugin,
  id,
  name,
  inactive,
}: {
  plugin: SeenPlugin;
  id: string;
  name: string;
  inactive: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return inactive || failed ? (
    <span className="mmseen-avatar" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img
      alt=""
      src={`${plugin.base}/api/v4/users/${id}/image`}
      onError={() => setFailed(true)}
    />
  );
}
function Rows({ page, plugin }: { page: Page; plugin: SeenPlugin }) {
  const [state, setState] = useState(() => plugin.store.getState());
  const [, profilesChanged] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => profilesChanged((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const update = () =>
      setState((previous) => {
        const next = plugin.store.getState();
        return next.entities.users.profiles !==
          previous.entities.users.profiles ||
          next.entities.users.currentUserId !==
            previous.entities.users.currentUserId ||
          next.entities.general.config.TeammateNameDisplay !==
            previous.entities.general.config.TeammateNameDisplay
          ? next
          : previous;
      });
    const unsubscribe = plugin.store.subscribe(update);
    update();
    return unsubscribe;
  }, [plugin]);
  const profiles = state.entities.users.profiles;
  const setting = state.entities.general.config.TeammateNameDisplay;
  const missingKey = [...new Set(page.viewers.map((v) => v.user_id))]
    .filter((id) => /^[a-z0-9]{26}$/.test(id) && !profiles?.[id])
    .slice(0, 5000)
    .join(",");
  useEffect(() => {
    let live = true;
    const consumer = new AbortController();
    if (missingKey)
      void plugin.profiles
        .load(missingKey.split(","), consumer.signal)
        .then(() => {
          if (live && !plugin.stopped) profilesChanged((n) => n + 1);
        });
    return () => {
      live = false;
      consumer.abort();
    };
  }, [plugin, missingKey, page]);
  if (plugin.stopped || state.entities.users.currentUserId !== plugin.user)
    return null;
  return (
    <>
      {page.viewers.map((v) => {
        const profile = profiles?.[v.user_id] || plugin.profiles.get(v.user_id);
        const name = displayName(v.user_id, profile, setting);
        const me = profiles?.[plugin.user];
        const tz = me?.timezone;
        const zone = tz
          ? tz.useAutomaticTimezone === true ||
            tz.useAutomaticTimezone === "true"
            ? tz.automaticTimezone
            : tz.manualTimezone
          : undefined;
        const time = viewedTime(v.seen_at, me?.locale, zone || undefined);
        return (
          <div
            className="mmseen-row"
            data-viewer-id={v.user_id}
            key={v.user_id}
          >
            <Avatar
              plugin={plugin}
              id={v.user_id}
              name={name}
              inactive={!profile || profile.delete_at > 0}
            />
            <span className="mmseen-name" title={name}>
              {name}
            </span>
            <time
              className="mmseen-time"
              dateTime={time.iso}
              title={time.full}
              aria-label={time.full}
            >
              {time.short}
            </time>
          </div>
        );
      })}
    </>
  );
}
function useViewers(plugin: SeenPlugin, id: string, limit = 50) {
  const [, render] = useState(0);
  const session = useRef<ViewerSession>();
  useEffect(() => {
    const current = new ViewerSession(
      (offset, signal) =>
        plugin.request(
          `/viewers?post_id=${encodeURIComponent(id)}&offset=${offset}&limit=${limit}`,
          undefined,
          signal,
        ),
      () => render((n) => n + 1),
      limit,
    );
    session.current = current;
    const off = plugin.watchViewers(id, () => current.invalidate());
    void current.load();
    return () => {
      off();
      current.stop();
    };
  }, [plugin, id, limit]);
  const state = session.current?.state || { loading: true, error: false };
  const more = useCallback(() => {
    void session.current?.load(true);
  }, []);
  return {
    ...state,
    more,
    retry: () => session.current?.invalidate(),
  };
}
function ViewerContent({
  plugin,
  id,
  close,
  onShowAll,
}: {
  plugin: SeenPlugin;
  id: string;
  close?: () => void;
  onShowAll?: () => void;
}) {
  const locale = useLocale(plugin);
  const text = (key: TextKey) => translate(locale, key);
  const preview = Boolean(onShowAll);
  const { page, error, loading, more, retry } = useViewers(
    plugin,
    id,
    preview ? PREVIEW_LIMIT : 50,
  );
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      preview ||
      !list.current ||
      !end.current ||
      !page?.has_more ||
      loading ||
      error
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more();
      },
      { root: list.current, rootMargin: "80px" },
    );
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [page, loading, error, more, preview]);
  return (
    <>
      <div className="mmseen-heading">
        <h4>
          {page
            ? page.state === "expired"
              ? text("expired")
              : page.state === "disabled"
                ? text("disabled")
                : page.count
                  ? viewedLabel(locale, page.count)
                  : text("empty")
            : text("viewers")}
        </h4>
        {close && Boolean(page?.count) && (
          <button
            className="mmseen-close"
            aria-label={text("close")}
            onClick={close}
          >
            ×
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="mmseen-status">
          {text(page ? "stale" : "error")}{" "}
          <button onClick={retry}>{text("retry")}</button>
        </div>
      )}
      <>
        <div
          ref={list}
          className="mmseen-list"
          role="region"
          aria-label={text("order")}
          aria-busy={loading}
          tabIndex={page?.count ? 0 : undefined}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (
              !preview &&
              el.scrollHeight - el.scrollTop - el.clientHeight < 80
            )
              more();
          }}
        >
          {page && <Rows page={page} plugin={plugin} />}
          {loading && (
            <div role="status" className="mmseen-status">
              {text(page ? "refreshing" : "loading")}
            </div>
          )}
          {!preview && page?.has_more && (
            <div ref={end} style={{ height: 1 }} />
          )}
        </div>
        {preview && page && page.count > PREVIEW_LIMIT && (
          <button
            className="mmseen-show-all"
            onClick={onShowAll}
            aria-haspopup="dialog"
          >
            {text("showAll")} · {page.count} <span aria-hidden="true">→</span>
          </button>
        )}
        {page?.saturated && <small>{text("limit")}</small>}
      </>
      <p className="mmseen-scope" role="note">
        {text("clientScope")}
      </p>
    </>
  );
}
function Hover({
  plugin,
  id,
  anchor,
  panelRef,
  enter,
  leave,
  panelId,
}: {
  panelId: string;
  plugin: SeenPlugin;
  id: string;
  anchor: HTMLElement;
  panelRef: React.RefObject<HTMLDivElement>;
  enter: () => void;
  leave: () => void;
}) {
  useLocale(plugin);
  const [pos, setPos] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight || 100;
      const width = panelRef.current?.offsetWidth || 300;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: Math.max(
          8,
          Math.min(
            r.bottom + h + 12 <= window.innerHeight
              ? r.bottom + 4
              : r.top - h - 4,
            window.innerHeight - h - 8,
          ),
        ),
      });
    };
    place();
    const resize = new ResizeObserver(place);
    if (panelRef.current) resize.observe(panelRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, panelRef]);
  return createPortal(
    <div
      id={panelId}
      ref={panelRef}
      className="mmseen-panel mmseen-preview"
      role="dialog"
      aria-label={plugin.text("viewers")}
      style={{ position: "fixed", ...pos }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <ViewerContent
        plugin={plugin}
        id={id}
        onShowAll={() => plugin.open(id, anchor)}
      />
    </div>,
    document.body,
  );
}
function FullList({ plugin, id }: { plugin: SeenPlugin; id: string }) {
  useLocale(plugin);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous =
      plugin.modalReturnFocus || (document.activeElement as HTMLElement | null);
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, [plugin]);
  return (
    <dialog
      id={`mmseen-modal-${id}`}
      ref={ref}
      className="mmseen-panel mmseen-full"
      tabIndex={-1}
      aria-label={plugin.text("viewers")}
      onCancel={(e) => {
        e.preventDefault();
        plugin.open();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current!.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            plugin.open();
        }
      }}
    >
      <ViewerContent plugin={plugin} id={id} close={() => plugin.open()} />
    </dialog>
  );
}
function Root({ plugin }: { plugin: SeenPlugin }) {
  const [, render] = useState(0);
  useEffect(() => {
    const fn = () => render((n) => n + 1);
    plugin.modalListeners.add(fn);
    return () => {
      plugin.modalListeners.delete(fn);
    };
  }, [plugin]);
  return (
    <>
      <style>{css}</style>
      {plugin.modal && (
        <FullList key={plugin.modal} plugin={plugin} id={plugin.modal} />
      )}
    </>
  );
}
declare global {
  interface Window {
    registerPlugin(id: string, plugin: SeenPlugin): void;
  }
}
window.registerPlugin(ID, new SeenPlugin());
