interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}

/**
 * Tiny in-process cache with request coalescing: within the TTL, every caller shares one
 * in-flight load. However many people watch the dashboard, each API instance queries the
 * database at most once per key per TTL.
 */
export class MicroCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key) as Entry<T> | undefined;
    if (current && current.expiresAt > this.now()) return current.value;

    const value = load();
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
    // Never cache failures.
    value.catch(() => this.entries.delete(key));
    return value;
  }
}
