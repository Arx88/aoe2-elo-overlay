'use strict';

/** Coordina solicitudes de historial; la primera página tiene prioridad. */
class RequestScheduler {
  constructor({ intervalMs = 650, maxConcurrent = 2, maxWaitMs = 8000 } = {}) {
    this.intervalMs = intervalMs;
    this.maxConcurrent = maxConcurrent;
    this.maxWaitMs = maxWaitMs;
    this.nextAt = 0;
    this.cooldownUntil = 0;
    this.active = 0;
    this.queue = [];
    this.timer = null;
  }

  run(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, priority, resolve, reject });
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
    this.active += 1;
    this.nextAt = Date.now() + this.intervalMs;
    Promise.resolve().then(item.task).then(item.resolve, (error) => {
      if (error && error.status === 429) {
        const delay = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 5000;
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delay);
      }
      item.reject(error);
    }).finally(() => { this.active -= 1; this.pump(); });
    this.pump();
  }
}

module.exports = { RequestScheduler };
