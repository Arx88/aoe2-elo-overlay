'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sanitizeLogText,
  rotateLogFileIfOversized,
  createDiagnosticReporter,
} = require('../src/diagnostics');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
}

(async () => {
  await test('sanitizeLogText oculta usuarios Windows/Unix, emails, tokens Bearer, DPAPI y códigos OAuth', () => {
    const raw = [
      '[12:01:00] leyendo C:\\Users\\juanp\\AppData\\Roaming\\AoE2 ELO Overlay\\config.json',
      '[12:01:01] path unix /Users/marcelo/Documents y /home/pepe/file',
      '[12:01:02] auth header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
      '[12:01:03] session dpapi:AQAAANCMnd8BFdERjHoAwE/Cl+sBAAAA==',
      '[12:01:04] callback?code=4/0AeaYSHAbcDef123456&sessionToken=tok_secret_9999',
      '[12:01:05] cuenta usuario.real+test@gmail.com conectada',
    ].join('\n');
    const out = sanitizeLogText(raw);
    assert.ok(!out.includes('juanp'), 'no debe exponer usuario Windows');
    assert.ok(!out.includes('marcelo') && !out.includes('pepe'), 'no debe exponer usuarios Unix');
    assert.ok(!out.includes('eyJhbGci'), 'no debe exponer Bearer token');
    assert.ok(!out.includes('AQAAANCM'), 'no debe exponer blob dpapi');
    assert.ok(!out.includes('0AeaYSHAbcDef'), 'no debe exponer OAuth code');
    assert.ok(!out.includes('tok_secret_9999'), 'no debe exponer sessionToken');
    assert.ok(!out.includes('usuario.real+test@gmail.com'), 'no debe exponer email');
    assert.ok(out.includes('C:\\Users\\***\\AppData'), 'debe preservar estructura de ruta');
    assert.ok(out.includes('<email>'), 'debe reemplazar email por marcador');
  });

  await test('sanitizeLogText respeta tope de líneas y caracteres', () => {
    const many = Array.from({ length: 200 }, (_, i) => `[12:00:${String(i).padStart(2, '0')}] línea de prueba número ${i} ${'x'.repeat(40)}`).join('\n');
    const out = sanitizeLogText(many, { maxChars: 1200, maxLines: 50 });
    assert.ok(out.length <= 1200, `debe quedar <= 1200 chars (quedó ${out.length})`);
    assert.ok(out.split('\n').length <= 50, 'debe quedar <= 50 líneas');
    assert.ok(out.includes('número 199'), 'debe conservar las líneas más recientes');
  });

  await test('rotateLogFileIfOversized recorta archivos grandes conservando el final reciente', () => {
    const tmp = path.join(os.tmpdir(), `relic-diag-test-${Date.now()}.log`);
    try {
      const lines = Array.from({ length: 2000 }, (_, i) => `[00:00:00] entrada ${i} ${'a'.repeat(50)}`).join('\n') + '\n';
      fs.writeFileSync(tmp, lines, 'utf8');
      const before = fs.statSync(tmp).size;
      assert.ok(before > 100_000);
      const rotated = rotateLogFileIfOversized(tmp, 50_000, 20_000);
      assert.equal(rotated, true);
      const afterText = fs.readFileSync(tmp, 'utf8');
      assert.ok(afterText.length <= 20_000);
      assert.ok(afterText.includes('entrada 1999'), 'debe conservar la última línea');
      assert.ok(!afterText.includes('entrada 0 '), 'debe descartar el inicio viejo');
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  });

  await test('createDiagnosticReporter aplica cooldown, tope diario y permite manual bypass', async () => {
    let now = 1_000_000;
    const sent = [];
    const reporter = createDiagnosticReporter({
      submitFn: async (payload) => { sent.push(payload); return { ok: true, id: sent.length }; },
      getMetaFn: () => ({ appVersion: '3.2.3', profileId: 12345, alias: 'Tester' }),
      getLogTailFn: () => 'C:\\Users\\secretuser\\test.log',
      enabledFn: () => true,
      cooldownMs: 60_000,
      maxAutoPer24h: 2,
      nowFn: () => now,
    });

    const r1 = await reporter.report({ kind: 'ws_disconnect', fingerprint: 'ws:1006', summary: 'Caída 1006' });
    assert.equal(r1.ok, true);
    assert.ok(!sent[0].logTail.includes('secretuser'));

    // Misma huella dentro del cooldown → omitida
    const r2 = await reporter.report({ kind: 'ws_disconnect', fingerprint: 'ws:1006', summary: 'Caída 1006' });
    assert.equal(r2.skipped, 'cooldown');

    // Otra huella → permitida (2/2 diario)
    const r3 = await reporter.report({ kind: 'auth_error', fingerprint: 'auth:fail', summary: 'Error login' });
    assert.equal(r3.ok, true);

    // Tercera automática en 24h → bloqueada por tope diario
    now += 120_000;
    const r4 = await reporter.report({ kind: 'crash', fingerprint: 'crash:3', summary: 'Crash 3' });
    assert.equal(r4.skipped, 'daily-cap');

    // Reporte manual desde Feedback → siempre permitido aunque se alcance el tope automático
    const r5 = await reporter.report({ kind: 'user_report', manual: true, fingerprint: 'user:bug', summary: 'Reporte manual' });
    assert.equal(r5.ok, true);
    assert.equal(sent.length, 3);
  });

  console.log(`diagnostics-test: ${passed}/${passed} pruebas OK`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
