import { selectProfiles } from "./profiles.ts";
import type { ViewerProfile } from "./profiles.ts";

export class ProfileCache {
  entries = new Map<string, { profile?: ViewerProfile; expires: number }>();
  consumers = new Map<string, number>();
  pending = new Map<string, Promise<void>>();
  tail = Promise.resolve();
  stopped = false;
  request: (ids: string[]) => Promise<unknown>;
  constructor(request: (ids: string[]) => Promise<unknown>) {
    this.request = request;
  }
  get(id: string): ViewerProfile | undefined {
    const entry = this.entries.get(id);
    if (entry && entry.expires <= Date.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry?.profile;
  }
  async load(ids: string[], signal?: AbortSignal): Promise<void> {
    if (this.stopped || signal?.aborted) return;
    const wanted = [...new Set(ids)]
      .filter((id) => /^[a-z0-9]{26}$/.test(id))
      .slice(0, 5000);
    for (const id of wanted)
      this.consumers.set(id, (this.consumers.get(id) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const id of wanted) {
        const remaining = (this.consumers.get(id) || 0) - 1;
        if (remaining > 0) this.consumers.set(id, remaining);
        else this.consumers.delete(id);
      }
    };
    signal?.addEventListener("abort", release, { once: true });
    const fresh = wanted
      .filter((id) => {
        this.get(id);
        return !this.entries.has(id) && !this.pending.has(id);
      })
      .slice(0, Math.max(0, 5000 - this.pending.size));
    for (let offset = 0; offset < fresh.length; offset += 50) {
      const batch = fresh.slice(offset, offset + 50);
      const work = this.tail
        .then(async () => {
          if (this.stopped) return;
          const active = batch.filter((id) => this.consumers.has(id));
          if (!active.length) return;
          let profiles: Record<string, ViewerProfile> = {};
          try {
            profiles = selectProfiles(await this.request(active), active);
          } catch {
            /* bounded negative cache, user_id fallback */
          }
          if (this.stopped) return;
          for (const id of active) {
            this.entries.set(id, {
              profile: profiles[id],
              expires: Date.now() + (profiles[id] ? 300000 : 30000),
            });
            if (this.entries.size > 5000)
              this.entries.delete(this.entries.keys().next().value!);
          }
        })
        .finally(() => {
          for (const id of batch) this.pending.delete(id);
        });
      this.tail = work;
      for (const id of batch) this.pending.set(id, work);
    }
    try {
      await Promise.all(wanted.map((id) => this.pending.get(id)));
    } finally {
      release();
      signal?.removeEventListener("abort", release);
    }
  }
  stop() {
    this.stopped = true;
    this.entries.clear();
    this.consumers.clear();
    this.pending.clear();
  }
}
