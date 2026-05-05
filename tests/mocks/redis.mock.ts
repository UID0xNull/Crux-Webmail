// ============================================================================
// Crux-Webmail — Redis Mock para Testing
// ============================================================================

export class RedisMock {
  private store: Map<string, string> = new Map();
  private expires: Map<string, number> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  async ping(): Promise<string> {
    return 'PONG';
  }

  async connect(): Promise<this> {
    return this;
  }

  async get(key: string): Promise<string | null> {
    this.checkExpiry(key);
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<string> {
    this.store.set(key, value);
    if (mode === 'PX' && ttl) {
      this.expires.set(key, Date.now() + ttl);
    } else if (mode === 'EX' && ttl) {
      this.expires.set(key, Date.now() + ttl * 1000);
    }
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
      this.expires.delete(key);
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0', 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key)) {
      this.expires.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    const exp = this.expires.get(key);
    if (!exp) return -2;
    const remaining = Math.ceil((exp - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    for (const member of members) {
      set.add(member);
    }
    return members.length;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async quit(): Promise<void> {
    this.store.clear();
    this.expires.clear();
    this.sets.clear();
  }

  reset(): void {
    this.store.clear();
    this.expires.clear();
    this.sets.clear();
  }

  private checkExpiry(key: string): void {
    const exp = this.expires.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.expires.delete(key);
    }
  }
}