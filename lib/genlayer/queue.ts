"use client";

/**
 * Per-browser Studio admission controller. It deliberately stays below 30 RPM:
 * 18 foreground requests + 6 reserved for receipt recovery. It cannot override
 * Studio's global limit, but prevents Kontyn itself from creating request bursts.
 */
type Priority = "user" | "recovery" | "keeper" | "read";
type Job<T> = { key: string; priority: number; run: () => Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
const STORAGE_KEY = "kontyn.pending-tx.v1";
const priority: Record<Priority, number> = { user: 0, recovery: 1, keeper: 2, read: 3 };

export class StudioQueue {
  private timestamps: number[] = [];
  private active = false;
  private jobs: Job<unknown>[] = [];
  private inflight = new Map<string, Promise<unknown>>();
  private readonly budget = Number(process.env.NEXT_PUBLIC_STUDIO_RPM ?? 18);

  enqueue<T>(key: string, kind: Priority, run: () => Promise<T>): Promise<T> {
    const prior = this.inflight.get(key); if (prior) return prior as Promise<T>;
    const task = new Promise<T>((resolve, reject) => { this.jobs.push({ key, priority: priority[kind], run, resolve, reject }); this.jobs.sort((a, b) => a.priority - b.priority); void this.drain(); });
    this.inflight.set(key, task); void task.finally(() => this.inflight.delete(key)); return task;
  }

  rememberTx(hash: string) { const current = this.pendingTxs(); if (!current.includes(hash)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, hash])); }
  forgetTx(hash: string) { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pendingTxs().filter((item) => item !== hash))); }
  pendingTxs(): string[] { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch { return []; } }

  private async drain() {
    if (this.active) return; this.active = true;
    while (this.jobs.length) {
      const now = Date.now(); this.timestamps = this.timestamps.filter((time) => now - time < 60_000);
      if (this.timestamps.length >= this.budget) { await new Promise((resolve) => setTimeout(resolve, 1_000)); continue; }
      const job = this.jobs.shift()!; this.timestamps.push(Date.now());
      try { job.resolve(await this.retry(job.run)); } catch (error) { job.reject(error); }
    }
    this.active = false;
  }

  private async retry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await run(); } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const retryable = message.includes("rate") || message.includes("busy") || message.includes("timeout") || message.includes("429") || message.includes("503");
        if (!retryable || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 500)));
      }
    }
  }
}
export const studioQueue = new StudioQueue();
