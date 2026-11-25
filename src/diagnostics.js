'use strict';

/**
 * Recolector liviano y privado de diagnósticos de Relic.
 *
 * - Sanitiza cualquier dato personal antes de salir de la PC del usuario
 *   (rutas de Windows/Unix con usuario, emails, tokens Bearer/DPAPI, códigos OAuth).
 * - Recorta `overlay.log` si supera 1,5 MB conservando el tramo más reciente (400 KB)
 *   para no acumular espacio en disco ni perder contexto reciente.
 * - Limita reportes automáticos por huella (cooldown 10 min) y tope diario (4/24h),
 *   mientras que los reportes manuales adjuntos desde Feedback siempre se permiten.
 */

const fs = require('node:fs');

const DEFAULT_MAX_LOG_CHARS = 5500;
const DEFAULT_MAX_LOG_LINES = 120;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_MAX_AUTO_24H = 4;

function sanitizeLogText(raw, { maxChars = DEFAULT_MAX_LOG_CHARS, maxLines = DEFAULT_MAX_LOG_LINES } = {}) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/\r\n/g, '\n');

  // Rutas con nombre de usuario del sistema operativo
  text = text.replace(/([A-Za-z]:\\Users\\)([^\\/\s"']+)/gi, '$1***');
  text = text.replace(/([A-Za-z]:\/Users\/)([^\\/\s"']+)/gi, '$1***');
  text = text.replace(/(\/(?:Users|home)\/)([^/\s"']+)/g, '$1***');

  // Tokens, cabeceras y secretos frecuentes
  text = text.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***');
  text = text.replace(/(dpapi:)[A-Za-z0-9+/=]{8,}/gi, '$1***');
  text = text.replace(
    /((?:sessionToken|access_token|refresh_token|id_token|token|code|secret|authorization)\s*[:=]\s*["']?)([^\s&"',;}\]]{6,})/gi,
    '$1***',
  );

  // Correos electrónicos
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>');

  const lines = text.split('\n');
  const slicedLines = maxLines > 0 && lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;
  let out = slicedLines.join('\n').trim();
  if (maxChars > 0 && out.length > maxChars) {
    out = out.slice(out.length - maxChars);
    const firstNl = out.indexOf('\n');
    if (firstNl > 0 && firstNl < 160) {
      out = out.slice(firstNl + 1);
    }
  }
  return out;
}

function rotateLogFileIfOversized(logPath, maxBytes = 1_500_000, keepBytes = 400_000) {
  if (!logPath) return false;
  try {
    const st = fs.statSync(logPath);
    if (!st || st.size <= maxBytes) return false;
    const safeKeep = Math.max(16 * 1024, Math.min(keepBytes, st.size));
    const fd = fs.openSync(logPath, 'r');
    let tail;
    try {
      const buf = Buffer.alloc(safeKeep);
      fs.readSync(fd, buf, 0, safeKeep, st.size - safeKeep);
      tail = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    const nl = tail.indexOf('\n');
    const clean = nl >= 0 && nl < 400 ? tail.slice(nl + 1) : tail;
    fs.writeFileSync(logPath, clean, 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function createDiagnosticReporter({
  submitFn,
  getMetaFn = () => ({}),
  getLogTailFn = () => '',
  logFn = () => {},
  enabledFn = () => true,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  maxAutoPer24h = DEFAULT_MAX_AUTO_24H,
  nowFn = () => Date.now(),
} = {}) {
  const lastSentByFp = new Map();
  let autoSentAt = [];

  async function report({
    kind = 'user_report',
    fingerprint = '',
    summary = '',
    extraDetail = '',
    manual = false,
  } = {}) {
    if (typeof submitFn !== 'function') return { ok: false, skipped: 'no-submit' };
    if (!manual && !enabledFn()) return { ok: false, skipped: 'disabled' };

    const cleanSummary = sanitizeLogText(String(summary || '').replace(/\s+/g, ' ').trim(), {
      maxChars: 240,
      maxLines: 1,
    });
    if (cleanSummary.length < 4) return { ok: false, skipped: 'empty-summary' };

    const fp = String(fingerprint || `${kind}:${cleanSummary.slice(0, 48).toLowerCase()}`).trim().slice(0, 96);
    const now = nowFn();

    if (!manual) {
      const prev = lastSentByFp.get(fp) || 0;
      if (now - prev < cooldownMs) {
        return { ok: false, skipped: 'cooldown' };
      }
      autoSentAt = autoSentAt.filter((ts) => now - ts < 24 * 60 * 60 * 1000);
      if (autoSentAt.length >= maxAutoPer24h) {
        return { ok: false, skipped: 'daily-cap' };
      }
      lastSentByFp.set(fp, now);
      autoSentAt.push(now);
    }

    const rawTail = String(getLogTailFn() || '');
    const combinedTail = extraDetail ? `${rawTail}\n--- detalle ---\n${String(extraDetail)}` : rawTail;
    const logTail = sanitizeLogText(combinedTail);
    const meta = getMetaFn() || {};

    try {
      const res = await submitFn({
        kind,
        fingerprint: fp,
        summary: cleanSummary,
        logTail,
        appVersion: meta.appVersion || '0.0.0',
        profileId: meta.profileId ?? null,
        alias: meta.alias || '',
      });
      if (res && res.ok) {
        logFn(`diagnóstico enviado (${kind}${res.deduplicated ? ', agrupado' : ''})`);
      }
      return res || { ok: false };
    } catch (err) {
      return { ok: false, error: err?.message || 'submit-failed' };
    }
  }

  return { report };
}

module.exports = {
  DEFAULT_MAX_LOG_CHARS,
  DEFAULT_MAX_LOG_LINES,
  sanitizeLogText,
  rotateLogFileIfOversized,
  createDiagnosticReporter,
};
