'use strict';

/**
 * Coordina solicitudes con Token-Bucket (ráfaga inicial paralela hasta `maxConcurrent`,
 * recarga continua cada `intervalMs`, backoff AIMD ante HTTP 429 y cancelación por AbortSignal).
 */
class RequestScheduler {
  constructor({ intervalMs = 220, maxIntervalMs = 1000, maxConcurrent = 3, maxWaitMs = 8000, burstTokens = maxConcurrent } = {}) {
    this.baseIntervalMs = intervalMs;
    this.intervalMs = intervalMs;
    this.maxIntervalMs = maxIntervalMs;
    this.maxConcurrent = maxConcurrent;
    this.maxWaitMs = maxWaitMs;
    this.maxTokens = Math.max(1, Number(burstTokens) || maxConcurrent);
    this.tokens = this.maxTokens;
    this.lastRefillAt = Date.now();
    this.nextAt = 0;
    this.cooldownUntil = 0;
    this.active = 0;
    this.queue = [];
    this.timer = null;
  }

  _refill(now = Date.now()) {
    if (now <= this.lastRefillAt) return;
    const elapsed = now - this.lastRefillAt;
    const step = Math.max(1, this.intervalMs);
    const add = Math.floor(elapsed / step);
    if (add > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + add);
      this.lastRefillAt = this.tokens >= this.maxTokens ? now : (this.lastRefillAt + add * step);
    }
  }

  run(task, priority = 0, { signal = null } = {}) {
    if (signal && signal.aborted) {
      const err = new Error('Solicitud cancelada');
      err.name = 'AbortError';
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      const item = { task, priority, resolve, reject, signal, onAbort: null };
      if (signal) {
        item.onAbort = () => {
          const idx = this.queue.indexOf(item);
          if (idx >= 0) this.queue.splice(idx, 1);
          const err = new Error('Solicitud cancelada');
          err.name = 'AbortError';
          reject(err);
        };
        signal.addEventListener('abort', item.onAbort, { once: true });
      }
      this.queue.push(item);
      this.pump();
    });
  }

  pump() {
    if (this.timer || !this.queue.length || this.active >= this.maxConcurrent) return;
    const now = Date.now();
    this._refill(now);
    if (this.cooldownUntil - now > this.maxWaitMs) {
      const waiting = this.queue.splice(0);
      for (const item of waiting) {
        if (item.signal && item.onAbort) item.signal.removeEventListener('abort', item.onAbort);
        const error = new Error('HTTP 429 en /api/matches (servicio temporalmente limitado)');
        error.status = 429;
        error.retryAfterMs = this.cooldownUntil - now;
        item.reject(error);
      }
      return;
    }
    const cooldownPause = this.cooldownUntil - now;
    if (cooldownPause > 0) {
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, cooldownPause);
      return;
    }
    if (this.tokens < 1) {
      const waitForToken = Math.max(15, this.intervalMs - (now - this.lastRefillAt));
      this.nextAt = now + waitForToken;
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, waitForToken);
      return;
    }
    let first = 0;
    for (let i = 1; i < this.queue.length; i += 1) {
      if (Number(this.queue[i].priority) > Number(this.queue[first].priority)) first = i;
    }
    const item = this.queue.splice(first, 1)[0];
    if (item.signal && item.onAbort) item.signal.removeEventListener('abort', item.onAbort);
    if (item.signal && item.signal.aborted) {
      const err = new Error('Solicitud cancelada');
      err.name = 'AbortError';
      item.reject(err);
      this.pump();
      return;
    }
    if (this.tokens >= this.maxTokens) this.lastRefillAt = now;
    this.tokens -= 1;
    this.active += 1;
    this.nextAt = this.tokens >= 1 ? now : (now + this.intervalMs);
    Promise.resolve().then(item.task).then((value) => {
      if (this.intervalMs > this.baseIntervalMs) {
        this.intervalMs = Math.max(this.baseIntervalMs, Math.round(this.intervalMs * 0.85));
      }
      item.resolve(value);
    }, (error) => {
      if (error && error.status === 429) {
        const delay = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 5000;
        this.tokens = 0;
        this.lastRefillAt = Date.now();
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delay);
        this.intervalMs = Math.min(this.maxIntervalMs, Math.max(650, Math.round(this.intervalMs * 1.5)));
      }
      item.reject(error);
    }).finally(() => { this.active -= 1; this.pump(); });
    this.pump();
  }
}

module.exports = { RequestScheduler };
