'use strict';

/** Coordina solicitudes de historial con cadencia adaptativa y cancelación por AbortSignal. */
class RequestScheduler {
  constructor({ intervalMs = 320, maxIntervalMs = 1000, maxConcurrent = 3, maxWaitMs = 8000 } = {}) {
    this.baseIntervalMs = intervalMs;
    this.intervalMs = intervalMs;
    this.maxIntervalMs = maxIntervalMs;
    this.maxConcurrent = maxConcurrent;
    this.maxWaitMs = maxWaitMs;
    this.nextAt = 0;
    this.cooldownUntil = 0;
    this.active = 0;
    this.queue = [];
    this.timer = null;
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
    const pause = Math.max(this.nextAt, this.cooldownUntil) - now;
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
    if (pause > 0) {
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, pause);
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
    this.active += 1;
    this.nextAt = Date.now() + this.intervalMs;
    Promise.resolve().then(item.task).then((value) => {
      // Recuperación suave hacia la cadencia base tras respuestas limpias
      if (this.intervalMs > this.baseIntervalMs) {
        this.intervalMs = Math.max(this.baseIntervalMs, Math.round(this.intervalMs * 0.85));
      }
      item.resolve(value);
    }, (error) => {
      if (error && error.status === 429) {
        const delay = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 5000;
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delay);
        this.intervalMs = Math.min(this.maxIntervalMs, Math.max(650, Math.round(this.intervalMs * 1.5)));
      }
      item.reject(error);
    }).finally(() => { this.active -= 1; this.pump(); });
    this.pump();
  }
}

module.exports = { RequestScheduler };
