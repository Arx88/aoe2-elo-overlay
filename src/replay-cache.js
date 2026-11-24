'use strict';

const fs = require('node:fs');
const path = require('node:path');
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
const MAX_BYTES = 8 * 1024 * 1024;
// Techo de memoria para TODAS las claves (elo1v1, rival, mine, scout...): el
// Map es compartido por toda la app y en sesiones largas de TG crecía sin
// límite. Solo las claves persistibles van a disco; el resto se evicta acá.
const MAX_MEMORY_ENTRIES = 300;
const KEY = /^scout:rows:v2:\d+:\d+:500$/;

/** Persist only public, parsed replay summaries, bounded by age and size. */
class ReplayCache extends Map {
  constructor(file, log = () => {}) {
    super();
    this.file = file;
    this.log = log;
    this.timer = null;
    this.dirty = false;
    this._flushing = false;
    try {
      if (fs.statSync(file).size > MAX_BYTES) return;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.entries)) return;
      for (const [key, entry] of data.entries.slice(-MAX_ENTRIES)) {
        if (KEY.test(key) && entry && Number.isFinite(entry.ts) &&
            Date.now() - entry.ts >= 0 && Date.now() - entry.ts <= MAX_AGE &&
            Array.isArray(entry.rows) && entry.rows.length <= 500) super.set(key, entry);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') this.log(`caché de replays no disponible: ${err.message}`);
    }
  }

  _serialize() {
    const now = Date.now();
    const entries = [...this.entries()].filter(([key, entry]) => KEY.test(String(key)) &&
      entry && Number.isFinite(entry.ts) && now - entry.ts <= MAX_AGE &&
      Array.isArray(entry.rows) && entry.rows.length <= 500)
      .sort((a, b) => a[1].ts - b[1].ts).slice(-MAX_ENTRIES);
    const json = JSON.stringify({ version: 1, entries });
    if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('límite de tamaño excedido');
    return json;
  }

  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    // LRU real: refrescar recencia en cada lectura para que claves calientes
    // (central:v6:*, mine:*, elo1v1:*) no sean evictadas por FIFO-300.
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    // Reinsertar para que el orden del Map refleje el uso reciente: el evict
    // saca siempre el más viejo.
    if (this.has(key)) super.delete(key);
    super.set(key, value);
    if (KEY.test(String(key))) {
      this.dirty = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.flushAsync().catch(() => {}); }, 800);
      if (this.timer.unref) this.timer.unref();
    }
    let evictedPersistable = false;
    while (this.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.keys().next().value;
      if (oldest === undefined) break;
      if (KEY.test(String(oldest))) evictedPersistable = true;
      super.delete(oldest);
    }
    if (evictedPersistable && this.dirty) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.flushAsync().catch(() => {}); }, 200);
      if (this.timer.unref) this.timer.unref();
    }
    return this;
  }

  async flushAsync() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty || this._flushing) return;
    this._flushing = true;
    this.dirty = false;
    try {
      const json = this._serialize();
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.promises.writeFile(tmp, json);
      await fs.promises.rename(tmp, this.file);
    } catch (err) {
      this.log(`no pude guardar caché de replays: ${err.message}`);
    } finally {
      this._flushing = false;
      if (this.dirty && !this.timer) {
        this.timer = setTimeout(() => { this.flushAsync().catch(() => {}); }, 800);
        if (this.timer.unref) this.timer.unref();
      }
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const json = this._serialize();
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch (err) { this.log(`no pude guardar caché de replays: ${err.message}`); }
  }
}

module.exports = { ReplayCache };
