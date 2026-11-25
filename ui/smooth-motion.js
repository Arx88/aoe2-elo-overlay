'use strict';

(function initRelicSmoothMotion(root) {
  /**
   * Relic · Motor Global de Movimiento Sedoso e Indicadores Deslizantes
   * (Liviano, seguro para monitores 4K / 175 % DPI, cero capas GPU gigantes y cero loops infinitos)
   *
   * - Rueda vertical: amortiguación exponencial directa sobre `scrollTop` con watchdog de
   *   seguridad (jamás transforma `.page.active` completo para no crear texturas GPU de 50+ MB).
   * - Arrastre horizontal con inercia suave en tiras horizontales.
   * - Indicador dorado deslizante (`syncGlideIndicator`) en menú lateral y subpestañas.
   */

  if (!root || !root.document) return;
  if (root._relicSmoothMotionBound) return;
  root._relicSmoothMotionBound = true;

  const prefersReduced = () => {
    try {
      return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  };

  function isVertScrollable(el) {
    if (!el || el === root.document.documentElement || el === root.document.body) return false;
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    const cs = root.getComputedStyle(el);
    return cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay';
  }

  function isHorizScrollable(el) {
    if (!el || el === root.document.documentElement || el === root.document.body) return false;
    if (el.id === 'ttLanesScroll') return false;
    if (el.scrollWidth <= el.clientWidth + 8) return false;
    const cs = root.getComputedStyle(el);
    return cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'overlay';
  }

  function findVertTarget(startEl, deltaY) {
    let cur = startEl && startEl.nodeType === 1 ? startEl : startEl?.parentElement;
    while (cur && cur !== root.document.body) {
      if (cur.tagName === 'TEXTAREA' || cur.tagName === 'SELECT') return null;
      if (isVertScrollable(cur)) {
        const atTop = cur.scrollTop <= 0.5;
        const atBottom = cur.scrollTop + cur.clientHeight >= cur.scrollHeight - 1.5;
        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findHorizDragTarget(startEl) {
    let cur = startEl && startEl.nodeType === 1 ? startEl : startEl?.parentElement;
    while (cur && cur !== root.document.body) {
      if (cur.id === 'ttLanesScroll') return null;
      if (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA' || cur.tagName === 'SELECT') return null;
      if (isHorizScrollable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // ==================== 1. RUEDA VERTICAL SEDOSA GLOBAL (ESTILO ÁRBOL TECNOLÓGICO) ====================
  const wheelStates = new WeakMap();
  let activeVertEl = null;

  function cancelVertState(el) {
    if (!el) return;
    const st = wheelStates.get(el);
    if (!st) return;
    if (st.raf) {
      cancelAnimationFrame(st.raf);
      st.raf = null;
    }
    if (activeVertEl === el) activeVertEl = null;
  }

  root.document.addEventListener('wheel', (ev) => {
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.shiftKey || prefersReduced()) return;
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
    if (!ev.deltaY) return;

    let dy = ev.deltaY;
    if (ev.deltaMode === 1) dy *= 38;
    else if (ev.deltaMode === 2) dy *= 360;
    else dy *= 1.18;

    const targetEl = findVertTarget(ev.target, dy);
    if (!targetEl) return;

    ev.preventDefault();
    const maxScroll = Math.max(0, targetEl.scrollHeight - targetEl.clientHeight);
    const nowTs = performance.now();
    let st = wheelStates.get(targetEl);
    if (!st) {
      st = {
        target: targetEl.scrollTop,
        current: targetEl.scrollTop,
        maxScroll,
        raf: null,
        lastFrame: nowTs,
        lastInputAt: nowTs,
        prevApplied: targetEl.scrollTop,
      };
      wheelStates.set(targetEl, st);
    }
    st.maxScroll = maxScroll;
    st.lastInputAt = nowTs;
    if (!st.raf) {
      st.current = targetEl.scrollTop;
      st.target = targetEl.scrollTop;
      st.prevApplied = targetEl.scrollTop;
      st.lastFrame = nowTs;
    }
    st.target = Math.max(0, Math.min(st.maxScroll, st.target + dy));
    activeVertEl = targetEl;

    if (!st.raf) {
      const step = (now) => {
        const dt = Math.min(40, Math.max(4, now - st.lastFrame));
        st.lastFrame = now;

        // Watchdog de seguridad (2,4 s tras la última rueda) o contenedor desconectado
        if (now - st.lastInputAt > 2400 || !targetEl.isConnected) {
          st.raf = null;
          if (activeVertEl === targetEl) activeVertEl = null;
          return;
        }

        // Si el usuario arrastró la barra de scroll o saltó programáticamente, ceder al instante
        if (Math.abs(targetEl.scrollTop - st.prevApplied) > 36) {
          st.raf = null;
          if (activeVertEl === targetEl) activeVertEl = null;
          return;
        }

        // Recalcular tope por si la altura del documento cambió dinámicamente
        st.maxScroll = Math.max(0, targetEl.scrollHeight - targetEl.clientHeight);
        st.target = Math.max(0, Math.min(st.maxScroll, st.target));

        const diff = st.target - st.current;
        if (Math.abs(diff) < 0.35) {
          targetEl.scrollTop = st.target;
          st.current = targetEl.scrollTop;
          st.prevApplied = targetEl.scrollTop;
          st.raf = null;
          if (activeVertEl === targetEl) activeVertEl = null;
          return;
        }

        // Misma curva sedosa exponencial del Árbol Tecnológico (tau = 155 ms)
        const alpha = 1 - Math.exp(-dt / 155);
        st.current += diff * alpha;
        targetEl.scrollTop = st.current;
        st.prevApplied = targetEl.scrollTop;

        // Si tocamos el borde superior o inferior real con dirección hacia afuera, detener limpio
        if ((st.target <= 0 && targetEl.scrollTop <= 0.1 && diff < 0) ||
            (st.target >= st.maxScroll && targetEl.scrollTop >= st.maxScroll - 0.5 && diff > 0)) {
          st.current = targetEl.scrollTop;
          st.raf = null;
          if (activeVertEl === targetEl) activeVertEl = null;
          return;
        }

        st.raf = requestAnimationFrame(step);
      };
      st.raf = requestAnimationFrame(step);
    }
  }, { passive: false });

  root.document.addEventListener('mousedown', (ev) => {
    if (activeVertEl) {
      cancelVertState(activeVertEl);
    } else if (ev.target && wheelStates.has(ev.target)) {
      cancelVertState(ev.target);
    }
  }, true);

  root.document.addEventListener('keydown', (ev) => {
    if (!activeVertEl) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'PageDown' ||
        ev.key === 'PageUp' || ev.key === 'Home' || ev.key === 'End' || ev.key === ' ') {
      cancelVertState(activeVertEl);
    }
  }, true);

  // ==================== 2. ARRASTRE HORIZONTAL CON INERCIA LIVIANA ====================
  let dragEl = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragMaxScroll = 0;
  let dragActive = false;
  let dragSamples = [];
  let dragCoastRaf = null;
  let suppressClickUntil = 0;

  function stopDragAnim() {
    if (dragCoastRaf) { cancelAnimationFrame(dragCoastRaf); dragCoastRaf = null; }
  }

  root.document.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0 || prefersReduced()) return;
    const target = findHorizDragTarget(ev.target);
    if (!target) return;
    stopDragAnim();
    dragEl = target;
    dragStartX = ev.clientX;
    dragStartScroll = target.scrollLeft;
    dragMaxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    dragActive = false;
    dragSamples = [{ x: ev.clientX, t: performance.now() }];
  });

  root.addEventListener('mousemove', (ev) => {
    if (!dragEl) return;
    const dx = ev.clientX - dragStartX;
    if (!dragActive && Math.abs(dx) >= 6) {
      dragActive = true;
      dragEl.classList.add('is-smooth-dragging');
    }
    if (!dragActive) return;
    ev.preventDefault();
    dragEl.scrollLeft = Math.max(0, Math.min(dragMaxScroll, dragStartScroll - dx));
    const now = performance.now();
    dragSamples.push({ x: ev.clientX, t: now });
    while (dragSamples.length > 2 && now - dragSamples[0].t > 120) dragSamples.shift();
  });

  root.addEventListener('mouseup', () => {
    if (!dragEl) return;
    const el = dragEl;
    const maxS = dragMaxScroll;
    dragEl = null;
    if (!dragActive) return;
    dragActive = false;
    el.classList.remove('is-smooth-dragging');
    suppressClickUntil = performance.now() + 200;

    const now = performance.now();
    while (dragSamples.length > 2 && now - dragSamples[0].t > 120) dragSamples.shift();
    let velocity = 0;
    if (dragSamples.length >= 2) {
      const first = dragSamples[0];
      const last = dragSamples[dragSamples.length - 1];
      const dt = Math.max(8, last.t - first.t);
      if (now - last.t < 95) {
        velocity = ((first.x - last.x) / dt) * 16.67;
        velocity = Math.max(-48, Math.min(48, velocity));
      }
    }
    if (Math.abs(velocity) < 0.5) return;

    const coastStart = performance.now();
    let lastFrame = coastStart;
    let pos = el.scrollLeft;
    const coast = (frameNow) => {
      if (frameNow - coastStart > 1800 || !el.isConnected) {
        dragCoastRaf = null;
        return;
      }
      const dt = Math.min(40, Math.max(4, frameNow - lastFrame));
      lastFrame = frameNow;
      const factor = dt / 16.67;
      pos += velocity * factor;
      if (pos <= 0 || pos >= maxS) {
        el.scrollLeft = Math.max(0, Math.min(maxS, pos));
        dragCoastRaf = null;
        return;
      }
      el.scrollLeft = pos;
      velocity *= Math.pow(0.942, factor);
      if (Math.abs(velocity) > 0.25) {
        dragCoastRaf = requestAnimationFrame(coast);
      } else {
        dragCoastRaf = null;
      }
    };
    dragCoastRaf = requestAnimationFrame(coast);
  });

  root.document.addEventListener('click', (ev) => {
    if (performance.now() < suppressClickUntil) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  // ==================== 3. INDICADOR DORADO DESLIZANTE (SIDEBAR Y SUBPESTAÑAS) ====================
  const lastIndicatorGeom = new Map();

  function syncGlideIndicator(container, activeEl, {
    key = 'default',
    axis = 'x',
    className = 'relic-glide-indicator',
    instant = false,
  } = {}) {
    if (!container) return;
    let pill = container.querySelector(`:scope > .${className}`);
    if (!activeEl || activeEl.hidden || activeEl.offsetWidth === 0 || activeEl.offsetHeight === 0) {
      if (pill) pill.classList.remove('is-ready');
      return;
    }
    if (!pill) {
      pill = root.document.createElement('span');
      pill.className = className;
      pill.setAttribute('aria-hidden', 'true');
      container.prepend(pill);
    }

    const next = {
      x: activeEl.offsetLeft,
      y: activeEl.offsetTop,
      w: activeEl.offsetWidth,
      h: activeEl.offsetHeight,
    };
    const prev = lastIndicatorGeom.get(key);
    lastIndicatorGeom.set(key, next);

    const applyGeom = (g) => {
      if (axis === 'y') {
        pill.style.transform = `translate3d(0, ${g.y}px, 0)`;
        pill.style.height = `${g.h}px`;
      } else {
        pill.style.transform = `translate3d(${g.x}px, ${g.y}px, 0)`;
        pill.style.width = `${g.w}px`;
        pill.style.height = `${g.h}px`;
      }
    };

    if (instant || prefersReduced() || !prev || (prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h)) {
      pill.classList.add('is-no-anim');
      applyGeom(next);
      pill.classList.add('is-ready');
      void pill.offsetWidth;
      pill.classList.remove('is-no-anim');
      return;
    }

    pill.classList.add('is-no-anim');
    applyGeom(prev);
    pill.classList.add('is-ready');
    void pill.offsetWidth;
    pill.classList.remove('is-no-anim');
    requestAnimationFrame(() => {
      applyGeom(next);
    });
  }

  // ==================== 4. COREOGRAFÍA POR SCROLL (PORCENTAJES, BARRAS, RADAR Y ANILLOS) ====================
  const PERCENT_CANDIDATE_SELECTOR = [
    '.cx-kpi strong',
    '.cx-spot-num',
    '.cx-diag-big-wr',
    '.cx-acad-st-bottom b',
    '.cx-acad-focus-pct b',
    '.cx-acad-h-val',
    '.cx-ckpi b',
    '.cx-circ-wr',
    '.cx-tg-role b',
    '.cx-sf-row b',
    '.cx-radar-val',
    '.central-kpi-main strong',
    '.pm-kpi-mid b',
    '.pm-duel-nums b',
    '.pm-lp-kpis b',
    '.pm-stage-score',
  ].join(', ');

  const REVEAL_BLOCK_SELECTOR = [
    '.cx-hero-card',
    '.cx-dna-banner',
    '.cx-spot-card',
    '.cx-card',
    '.cx-circadian-card',
    '.cx-tempo-card',
    '.pm-head',
    '.pm-kpi',
    '.pm-duel',
    '.pm-race-box',
    '.pm-tech-box',
    '.pm-queue-box',
    '.pm-habits',
    '.pm-stage-card',
    '.pm-section',
    '.pm-card',
  ].join(', ');

  const containerStates = new WeakMap();

  function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  /**
   * Solo acepta porcentajes reales (ej. "52%", "67%", "99,4%", "62% WR").
   * Jamás toca rankings ("#1.420"), ELO ("1.378"), eAPM ("48,2") ni relojes ("14:22").
   */
  function parsePercentOnly(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const m = /^\s*([+\-−]?)(\d{1,3})(?:([.,])(\d{1,2}))?(\s*%(?:\s*WR)?)\s*$/i.exec(rawText);
    if (!m) return null;
    const sign = m[1] || '';
    const intRaw = m[2];
    const decSep = m[3] || ',';
    const decRaw = m[4] || '';
    const suffix = m[5] || '%';
    const mag = Number(decRaw ? `${intRaw}.${decRaw}` : intRaw);
    if (!Number.isFinite(mag) || mag <= 0) return null;
    const isNeg = sign === '-' || sign === '−';
    return {
      target: isNeg ? -mag : mag,
      sign,
      decimals: decRaw ? decRaw.length : 0,
      decSep,
      suffix,
    };
  }

  function formatPercent(val, spec) {
    const abs = Math.abs(val);
    let numStr;
    if (spec.decimals > 0) {
      const fixed = abs.toFixed(spec.decimals);
      numStr = spec.decSep === ',' ? fixed.replace('.', ',') : fixed;
    } else {
      numStr = String(Math.round(abs));
    }
    const signStr = spec.sign === '+' ? (val > 0 ? '+' : '') : (val < 0 ? spec.sign : '');
    return `${signStr}${numStr}${spec.suffix}`;
  }

  function findScrollRoot(el) {
    let cur = el ? el.parentElement : null;
    while (cur && cur !== root.document.body) {
      const cs = root.getComputedStyle(cur);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay') {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function cleanupContainerReveal(container) {
    const prev = containerStates.get(container);
    if (!prev) return;
    if (prev.observer) {
      try { prev.observer.disconnect(); } catch (_) { /* ignore */ }
    }
    for (const raf of prev.rafs) {
      try { cancelAnimationFrame(raf); } catch (_) { /* ignore */ }
    }
    for (const tid of prev.timers) clearTimeout(tid);
    containerStates.delete(container);
  }

  function snapBlockFinal(block) {
    if (!block) return;
    block.querySelectorAll('[data-w]').forEach((bar) => {
      const w = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
      bar.style.transition = '';
      bar.style.width = `${w}%`;
    });
    block.querySelectorAll('[data-h]').forEach((bar) => {
      const h = Math.max(0, Math.min(100, Number(bar.dataset.h) || 0));
      bar.style.transition = '';
      bar.style.height = `${h}%`;
    });
    block.querySelectorAll('.cx-ring-val, .cx-gauge-arc').forEach((arc) => {
      if (arc.dataset.targetOffset != null) {
        arc.style.transition = '';
        arc.style.strokeDashoffset = arc.dataset.targetOffset;
      }
    });
    block.querySelectorAll('.cx-dna-radar-svg').forEach((svg) => {
      svg.classList.remove('is-radar-pending');
      svg.classList.add('is-radar-open');
    });
  }

  function observeReveal(container, { duration = 960 } = {}) {
    if (!container) return;
    cleanupContainerReveal(container);

    if (prefersReduced() || typeof root.requestAnimationFrame !== 'function') {
      snapBlockFinal(container);
      return;
    }

    const state = { observer: null, rafs: new Set(), timers: new Set() };
    containerStates.set(container, state);

    // Identificar bloques individuales para animar exactamente a medida que el usuario baja
    const rawBlocks = [...container.querySelectorAll(REVEAL_BLOCK_SELECTOR)];
    const blocks = [];
    for (const el of rawBlocks) {
      // Permitir que tarjetas dentro de un grid (ej. .cx-spot-card dentro de .cx-card) se animen por separado,
      // pero no duplicar un hijo directo cuyo padre ya es el mismo tipo de bloque simple.
      const parentBlock = el.parentElement ? el.parentElement.closest(REVEAL_BLOCK_SELECTOR) : null;
      if (parentBlock && parentBlock !== container && !el.classList.contains('cx-spot-card') && !el.classList.contains('pm-kpi')) {
        continue;
      }
      blocks.push(el);
    }
    if (!blocks.length) blocks.push(container);

    const blockData = new Map();
    const claimedNodes = new WeakSet();

    for (const block of blocks) {
      const pctItems = [];
      block.querySelectorAll(PERCENT_CANDIDATE_SELECTOR).forEach((el) => {
        if (claimedNodes.has(el)) return;
        // Buscar el TextNode que contiene el porcentaje (sin tocar badges hijos)
        let textNode = null;
        for (const child of el.childNodes) {
          if (child.nodeType === 3 && /%/.test(child.nodeValue || '')) {
            textNode = child;
            break;
          }
        }
        if (!textNode) return;
        const original = textNode.nodeValue;
        const parsed = parsePercentOnly(original);
        if (!parsed) return;
        claimedNodes.add(el);
        pctItems.push({ textNode, original, spec: parsed });
      });

      const barsW = [...block.querySelectorAll('[data-w]')].filter((b) => !claimedNodes.has(b));
      barsW.forEach((b) => {
        claimedNodes.add(b);
        b.style.transition = 'none';
        b.style.width = '0%';
      });

      const barsH = [...block.querySelectorAll('[data-h]')].filter((b) => !claimedNodes.has(b));
      barsH.forEach((b) => {
        claimedNodes.add(b);
        b.style.transition = 'none';
        b.style.height = '0%';
      });

      const arcs = [...block.querySelectorAll('.cx-ring-val, .cx-gauge-arc')].filter((a) => !claimedNodes.has(a));
      arcs.forEach((arc) => {
        claimedNodes.add(arc);
        const dashArr = arc.getAttribute('stroke-dasharray');
        const targetOffset = arc.dataset.targetOffset != null
          ? arc.dataset.targetOffset
          : arc.getAttribute('stroke-dashoffset');
        if (dashArr && targetOffset != null) {
          arc.dataset.targetOffset = String(targetOffset);
          arc.style.transition = 'none';
          arc.style.strokeDashoffset = String(dashArr);
        }
      });

      const radars = [...block.querySelectorAll('.cx-dna-radar-svg')].filter((s) => !claimedNodes.has(s));
      radars.forEach((svg) => {
        claimedNodes.add(svg);
        svg.classList.remove('is-radar-open');
        svg.classList.add('is-radar-pending');
      });

      // Estacionar porcentajes en 0% antes de aparecer en viewport
      for (const item of pctItems) {
        item.textNode.nodeValue = formatPercent(0, item.spec);
      }

      if (pctItems.length || barsW.length || barsH.length || arcs.length || radars.length) {
        blockData.set(block, { pctItems, barsW, barsH, arcs, radars, played: false });
      }
    }

    // Cualquier barra o elemento fuera de bloques conocidos
    container.querySelectorAll('[data-w]').forEach((b) => {
      if (!claimedNodes.has(b)) {
        const w = Math.max(0, Math.min(100, Number(b.dataset.w) || 0));
        b.style.width = `${w}%`;
      }
    });
    container.querySelectorAll('[data-h]').forEach((b) => {
      if (!claimedNodes.has(b)) {
        const h = Math.max(0, Math.min(100, Number(b.dataset.h) || 0));
        b.style.height = `${h}%`;
      }
    });

    const playBlock = (block) => {
      const info = blockData.get(block);
      if (!info || info.played) return;
      info.played = true;

      const raf1 = root.requestAnimationFrame(() => {
        state.rafs.delete(raf1);
        const raf2 = root.requestAnimationFrame(() => {
          state.rafs.delete(raf2);

          // 1. Barras horizontales y verticales
          info.barsW.forEach((bar, idx) => {
            const w = Math.max(0, Math.min(100, Number(bar.dataset.w) || 0));
            const tid = setTimeout(() => {
              state.timers.delete(tid);
              bar.style.transition = '';
              bar.style.width = `${w}%`;
            }, Math.min(240, idx * 35));
            state.timers.add(tid);
          });
          info.barsH.forEach((bar, idx) => {
            const h = Math.max(0, Math.min(100, Number(bar.dataset.h) || 0));
            const tid = setTimeout(() => {
              state.timers.delete(tid);
              bar.style.transition = '';
              bar.style.height = `${h}%`;
            }, Math.min(240, idx * 55));
            state.timers.add(tid);
          });

          // 2. Anillos circulares (Tu Arma Secreta, Fortaleza, Talón) y arco de velocidad
          info.arcs.forEach((arc) => {
            if (arc.dataset.targetOffset != null) {
              arc.style.transition = '';
              arc.style.strokeDashoffset = arc.dataset.targetOffset;
            }
          });

          // 3. Gráfico araña (Radar de ADN) expandiéndose suave desde el centro
          info.radars.forEach((svg) => {
            svg.classList.remove('is-radar-pending');
            svg.classList.add('is-radar-open');
          });

          // 4. Porcentajes (%) con curva easeOutExpo suave
          if (info.pctItems.length) {
            const t0 = performance.now();
            const tick = (now) => {
              if (!block.isConnected) return;
              const elapsed = now - t0;
              let remaining = 0;
              for (let i = 0; i < info.pctItems.length; i += 1) {
                const item = info.pctItems[i];
                const dly = Math.min(180, i * 28);
                if (elapsed < dly) {
                  remaining += 1;
                  continue;
                }
                const p = Math.min(1, (elapsed - dly) / duration);
                if (p >= 1) {
                  item.textNode.nodeValue = item.original;
                } else {
                  item.textNode.nodeValue = formatPercent(item.spec.target * easeOutExpo(p), item.spec);
                  remaining += 1;
                }
              }
              if (remaining > 0) {
                const nextRaf = root.requestAnimationFrame(tick);
                state.rafs.add(nextRaf);
              }
            };
            const firstRaf = root.requestAnimationFrame(tick);
            state.rafs.add(firstRaf);
          }
        });
        state.rafs.add(raf2);
      });
      state.rafs.add(raf1);
    };

    if (typeof root.IntersectionObserver !== 'function') {
      for (const block of blockData.keys()) playBlock(block);
      return;
    }

    const scrollRoot = findScrollRoot(container);
    const observer = new root.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          playBlock(entry.target);
        }
      }
    }, {
      root: scrollRoot,
      threshold: 0.12,
      rootMargin: '0px 0px -24px 0px',
    });

    state.observer = observer;
    for (const block of blockData.keys()) {
      observer.observe(block);
    }
  }

  root.RelicSmoothMotion = {
    version: 6,
    cancelVertState,
    syncGlideIndicator,
    observeReveal,
    animateBigNumbers: observeReveal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
