'use strict';

/**
 * Monitor liviano del estado de la ventana de Age of Empires II: DE en Windows.
 *
 * Se ejecuta ÚNICAMENTE cuando el usuario activa «Ocultar si AoE2 minimizado».
 * Lanza un solo proceso PowerShell oculto (sin crear procesos cada segundo) que
 * compila P/Invoke de User32 una única vez y emite una línea por stdout solo
 * cuando el estado cambia: `visible`, `minimized` o `not-running`.
 *
 * También contempla el modo Ventana sin bordes (Borderless): si otra aplicación
 * (que no sea AoE2 ni Relic) está maximizada tapando el MISMO monitor que AoE2,
 * se considera minimizado/tapado; en doble monitor, usar otra app en el segundo
 * monitor NO oculta el overlay sobre el juego.
 */

const { spawn } = require('node:child_process');

const DEFAULT_DELAY_MS = 5000;

function buildWatcherScript(ownPid) {
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RelicWin32 {
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
}
"@
$ownPid = ${Number(ownPid) || 0}
$lastState = ''
while ($true) {
  $procs = @(Get-Process -Name 'AoE2DE_s','AoE2DE' -ErrorAction SilentlyContinue)
  $state = 'not-running'
  if ($procs.Count -gt 0) {
    $p = $procs | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
    if ($null -eq $p) {
      $state = 'minimized'
    } else {
      $hwnd = $p.MainWindowHandle
      if ([RelicWin32]::IsIconic($hwnd) -or -not [RelicWin32]::IsWindowVisible($hwnd)) {
        $state = 'minimized'
      } else {
        $fg = [RelicWin32]::GetForegroundWindow()
        if ($fg -ne [IntPtr]::Zero -and $fg -ne $hwnd) {
          [uint32]$fgPid = 0
          [void][RelicWin32]::GetWindowThreadProcessId($fg, [ref]$fgPid)
          $isGameOrRelic = ($fgPid -eq [uint32]$p.Id) -or ($ownPid -gt 0 -and $fgPid -eq [uint32]$ownPid)
          if (-not $isGameOrRelic) {
            $aoeMon = [RelicWin32]::MonitorFromWindow($hwnd, 2)
            $fgMon = [RelicWin32]::MonitorFromWindow($fg, 2)
            if ($aoeMon -ne [IntPtr]::Zero -and $aoeMon -eq $fgMon -and [RelicWin32]::IsZoomed($fg)) {
              $state = 'minimized'
            } else {
              $state = 'visible'
            }
          } else {
            $state = 'visible'
          }
        } else {
          $state = 'visible'
        }
      }
    }
  }
  if ($state -ne $lastState) {
    $lastState = $state
    [Console]::Out.WriteLine($state)
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 1000
}
`.trim();
}

/**
 * Máquina de estados pura para el retardo de 5 segundos al minimizar AoE2.
 * Separada del proceso Windows para testearse determinísticamente en Node.
 */
function createMinimizeController({
  delayMs = DEFAULT_DELAY_MS,
  canHide = () => true,
  onHide = () => {},
  onShow = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let currentState = 'not-running';
  let timer = null;
  let hiddenByMinimized = false;
  let hiddenByNotRunning = false;
  let hideWhenMinimized = false;
  let hideWhenNotRunning = false;

  function clearPending() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function restoreIfNeeded() {
    clearPending();
    if (hiddenByMinimized || hiddenByNotRunning) {
      hiddenByMinimized = false;
      hiddenByNotRunning = false;
      onShow();
    }
  }

  function evaluate() {
    if (!hideWhenMinimized && !hideWhenNotRunning) {
      restoreIfNeeded();
      return;
    }
    if (!canHide()) {
      restoreIfNeeded();
      return;
    }
    if (currentState === 'not-running') {
      clearPending();
      if (hideWhenNotRunning) {
        hiddenByMinimized = false;
        if (!hiddenByNotRunning) {
          hiddenByNotRunning = true;
          onHide('not-running');
        }
      } else {
        restoreIfNeeded();
      }
      return;
    }
    if (currentState === 'minimized') {
      if (!hideWhenMinimized) {
        restoreIfNeeded();
        return;
      }
      if (hiddenByNotRunning) {
        hiddenByNotRunning = false;
        hiddenByMinimized = true;
        return;
      }
      if (hiddenByMinimized || timer != null) return;
      timer = setTimer(() => {
        timer = null;
        if (!hideWhenMinimized || currentState !== 'minimized' || !canHide()) return;
        if (!hiddenByMinimized) {
          hiddenByMinimized = true;
          onHide('minimized');
        }
      }, Math.max(0, Number(delayMs) || DEFAULT_DELAY_MS));
      return;
    }
    restoreIfNeeded();
  }

  return {
    setEnabled(next) {
      hideWhenMinimized = Boolean(next);
      if (!hideWhenMinimized && !hideWhenNotRunning) {
        currentState = 'not-running';
        restoreIfNeeded();
      } else {
        evaluate();
      }
    },
    setRules(rules = {}) {
      if (Object.prototype.hasOwnProperty.call(rules, 'hideWhenMinimized')) {
        hideWhenMinimized = Boolean(rules.hideWhenMinimized);
      }
      if (Object.prototype.hasOwnProperty.call(rules, 'hideWhenNotRunning')) {
        hideWhenNotRunning = Boolean(rules.hideWhenNotRunning);
      }
      if (!hideWhenMinimized && !hideWhenNotRunning) {
        restoreIfNeeded();
      } else {
        evaluate();
      }
    },
    shouldSuppressShow() {
      return Boolean(hideWhenNotRunning && currentState === 'not-running' && canHide());
    },
    markSuppressedAtBoot() {
      if (hideWhenNotRunning && currentState === 'not-running' && canHide()) {
        hiddenByNotRunning = true;
      }
    },
    updateState(nextState) {
      const normalized = ['visible', 'minimized', 'not-running'].includes(nextState)
        ? nextState
        : 'not-running';
      currentState = normalized;
      evaluate();
    },
    recheck() {
      evaluate();
    },
    cancelAndShow() {
      restoreIfNeeded();
    },
    isHiddenByMinimized() {
      return hiddenByMinimized || hiddenByNotRunning;
    },
    isHiddenByNotRunning() {
      return hiddenByNotRunning;
    },
    getState() {
      return currentState;
    },
    dispose() {
      hideWhenMinimized = false;
      hideWhenNotRunning = false;
      clearPending();
      hiddenByMinimized = false;
      hiddenByNotRunning = false;
    },
  };
}

class GameWindowWatcher {
  constructor({ onState = () => {}, log = () => {}, ownPid = process.pid } = {}) {
    this.onState = onState;
    this.log = log;
    this.ownPid = ownPid;
    this.proc = null;
    this.running = false;
    this.restartTimer = null;
    this.buffer = '';
  }

  start() {
    if (process.platform !== 'win32' || this.running) return;
    this.running = true;
    this._spawn();
  }

  _spawn() {
    if (!this.running || this.proc) return;
    const script = buildWatcherScript(this.ownPid);
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      this.proc = child;
      this.buffer = '';

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || '';
        for (const raw of lines) {
          const state = raw.trim();
          if (state === 'visible' || state === 'minimized' || state === 'not-running') {
            this.onState(state);
          }
        }
      });

      child.on('error', (err) => {
        this.log(`watcher AoE2 minimizado: error (${err.message})`);
      });

      child.on('exit', () => {
        if (this.proc === child) this.proc = null;
        if (this.running) {
          clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this._spawn();
          }, 5000);
        }
      });
    } catch (err) {
      this.log(`watcher AoE2 minimizado: no pude iniciar (${err.message})`);
    }
  }

  stop() {
    this.running = false;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* ya terminado */
      }
      this.proc = null;
    }
    this.buffer = '';
  }
}

module.exports = {
  DEFAULT_DELAY_MS,
  createMinimizeController,
  GameWindowWatcher,
};
