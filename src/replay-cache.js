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
const KEY = /^scout:rows:v2:\d+:\d+:(60|500)$/;

/** Persist only public, parsed replay summaries, bounded by age and size. */
class ReplayCache extends Map {
  constructor(file, log = () => {}) {
    super();
    this.file = file;
    this.log = log;
    this.timer = null;
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

  set(key, value) {
    // Reinsertar para que el orden del Map refleje el uso reciente: el evict
    // saca siempre el más viejo.
    if (this.has(key)) super.delete(key);
    super.set(key, value);
    if (KEY.test(String(key))) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 800);
      if (this.timer.unref) this.timer.unref();
    }
    while (this.size > MAX_MEMORY_ENTRIES) {
      const oldest = this.keys().next().value;
      if (oldest === undefined) break;
      // Lo persistible se baja a disco ANTES de soltarlo, si aún no se fue.
      if (KEY.test(String(oldest))) this.flush();
      super.delete(oldest);
    }
    return this;
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      const entries = [...this.entries()].filter(([key, entry]) => KEY.test(String(key)) &&
        entry && Number.isFinite(entry.ts) && Date.now() - entry.ts <= MAX_AGE &&
        Array.isArray(entry.rows) && entry.rows.length <= 500)
        .sort((a, b) => a[1].ts - b[1].ts).slice(-MAX_ENTRIES);
      const json = JSON.stringify({ version: 1, entries });
      if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('límite de tamaño excedido');
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    } catch (err) { this.log(`no pude guardar caché de replays: ${err.message}`); }
  }
}

module.exports = { ReplayCache };
