'use strict';

(function initTechTreeUi(root) {
  /**
   * Relic · Árbol de Tecnología Oficial AoE2:DE (Edición Obsidian-Gold Artesanal · 56 Civilizaciones)
   *
   * - Física de arrastre con inercia sedosa a 60 FPS (arrastrable desde cualquier punto del lienzo,
   *   desaceleración exponencial suave, deslizamiento con rueda y salto animado por edificio).
   * - Cero saltos de scroll al seleccionar nodos: el Inspector lateral se actualiza en el lugar con
   *   microanimaciones fluidas, línea de evolución clickeable, barras de combate y sonidos táctiles.
   * - 100 % offline, 0 estilos inline (CSP estricto).
   */

  const AGE_META = [
    { id: 1, name: 'Alta Edad Media', short: 'Alta Edad', icon: 'assets/icons/ages/dark.png' },
    { id: 2, name: 'Edad Feudal', short: 'Feudal', icon: 'assets/icons/ages/feudal.png' },
    { id: 3, name: 'Edad de los Castillos', short: 'Castillos', icon: 'assets/icons/ages/castle.png' },
    { id: 4, name: 'Edad Imperial', short: 'Imperial', icon: 'assets/icons/ages/imperial.png' },
  ];

  const CATEGORIES = [
    { id: 'all', label: 'Todo el árbol' },
    { id: 'military', label: 'Cuarteles · Arquería · Establo' },
    { id: 'siege_castle', label: 'Asedio y Castillo' },
    { id: 'tech', label: 'Herrería · Univ. · Monasterio' },
    { id: 'economy', label: 'Economía' },
    { id: 'naval_def', label: 'Muelle y Defensas' },
  ];

  const TYPE_BADGES = {
    qu: { label: 'Unidad Única', short: 'Única', cls: 'is-unique-unit' },
    ru: { label: 'Unidad Regional', short: 'Regional', cls: 'is-regional-unit' },
    qt: { label: 'Tecnología Única', short: 'Tec. Única', cls: 'is-unique-tech' },
    rt: { label: 'Tec. Regional', short: 'Regional', cls: 'is-regional-tech' },
    ub: { label: 'Edificio Único', short: 'Único', cls: 'is-unique-bldg' },
    rb: { label: 'Edificio Regional', short: 'Regional', cls: 'is-regional-bldg' },
  };

  function esc(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function norm(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function playSfx(kind) {
    try {
      if (root.UiSfx && typeof root.UiSfx.play === 'function') {
        root.UiSfx.play(kind);
      }
    } catch (_) {}
  }

  function civCrest(slug) {
    if (root.TrainingUI && typeof root.TrainingUI.resolveCivCrest === 'function') {
      return root.TrainingUI.resolveCivCrest(slug);
    }
    const clean = String(slug || 'franks').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `assets/shields/${clean}.png`;
  }

  function nodeIcon(node) {
    if (node && node.icon) return node.icon;
    if (node?.ut === 'B') return 'assets/icons/building.png';
    if (node?.ut === 'T') return 'assets/icons/blacksmith.png';
    return 'assets/icons/sword.png';
  }

  /** Convierte un ratio 0..1 a una clase CSS discreta `tt-w-0`..`tt-w-100` (paso 5 %, 100 % CSP-safe). */
  function barWidthClass(value, maxVal) {
    const v = Number(value || 0);
    const m = Math.max(1, Number(maxVal || 1));
    const pct = Math.max(0, Math.min(100, Math.round((v / m) * 20) * 5));
    return `tt-w-${pct}`;
  }

  function buildCivAvailabilityMap(civ) {
    const map = new Map();
    if (!civ || !Array.isArray(civ.buildings)) return map;
    for (const b of civ.buildings) {
      const prevB = map.get(b.k);
      if (prevB === undefined || b.av > prevB) map.set(b.k, b.av ? 1 : 0);
      for (const c of (b.cells || [])) {
        const prevC = map.get(c.k);
        if (prevC === undefined || c.av > prevC) map.set(c.k, c.av ? 1 : 0);
      }
    }
    return map;
  }

  function buildLanesForCiv(civ, nodesMap) {
    if (!civ || !Array.isArray(civ.buildings)) return [];
    const primaryLanes = [];
    const defLeaves = [];
    const ecoLeaves = [];

    for (const b of civ.buildings) {
      if (b.id === 109 && b.age === 3 && (!b.cells || !b.cells.length)) continue;
      if (b.cells && b.cells.length > 0) {
        primaryLanes.push({
          laneId: b.k,
          kind: 'building',
          building: b,
          cat: b.cat || 'economy',
          title: nodesMap[b.k]?.name || 'Edificio',
          icon: nodeIcon(nodesMap[b.k]),
          cols: Math.max(1, Math.min(12, b.cols || 1)),
          cells: b.cells,
        });
      } else if (b.cat === 'naval_def') {
        defLeaves.push(b);
      } else {
        ecoLeaves.push(b);
      }
    }

    if (defLeaves.length) {
      const towers = defLeaves.filter((b) => /tower|outpost|keep|bombard/i.test(nodesMap[b.k]?.nameEn || ''));
      const walls = defLeaves.filter((b) => !towers.includes(b));
      const cells = [];
      const placeCol = (list, colIdx) => {
        const usedRow = new Set();
        for (const item of list) {
          const baseRow = Math.max(0, Math.min(3, (item.age || 1) - 1)) * 2;
          let r = baseRow;
          while (usedRow.has(r) && r < 7) r += 1;
          usedRow.add(r);
          cells.push({ r, c: colIdx, k: item.k, av: item.av, t: item.t || 'bn', a: item.age || 1 });
        }
      };
      placeCol(towers, 0);
      placeCol(walls, 1);
      primaryLanes.push({
        laneId: 'grp:defenses',
        kind: 'group',
        building: { k: towers[0]?.k || defLeaves[0].k, av: 1, age: 1, t: 'bn', cat: 'naval_def' },
        cat: 'naval_def',
        title: 'Torres y Murallas',
        icon: 'assets/icons/aoe2/b_25.png',
        cols: walls.length ? 2 : 1,
        cells,
      });
    }

    if (ecoLeaves.length) {
      const cells = [];
      const usedPerAge = new Map();
      let maxCol = 0;
      for (const item of ecoLeaves) {
        const ageIdx = Math.max(0, Math.min(3, (item.age || 1) - 1));
        const count = usedPerAge.get(ageIdx) || 0;
        usedPerAge.set(ageIdx, count + 1);
        const r = ageIdx * 2 + (count % 2);
        const c = Math.floor(count / 2);
        if (c > maxCol) maxCol = c;
        cells.push({ r, c, k: item.k, av: item.av, t: item.t || 'bn', a: item.age || 1 });
      }
      primaryLanes.push({
        laneId: 'grp:civil',
        kind: 'group',
        building: { k: ecoLeaves[0].k, av: 1, age: 1, t: 'bn', cat: 'economy' },
        cat: 'economy',
        title: 'Estructuras Civiles',
        icon: 'assets/icons/aoe2/b_34.png',
        cols: Math.max(1, Math.min(4, maxCol + 1)),
        cells,
      });
    }

    return primaryLanes;
  }

  /** Encuentra la cadena evolutiva completa (columna del edificio) a la que pertenece `nodeKey`. */
  function findEvolutionChain(civ, lanes, nodeKey) {
    if (!civ || !Array.isArray(lanes) || !nodeKey) return [];
    for (const lane of lanes) {
      const hit = lane.cells.find((c) => c.k === nodeKey);
      if (hit) {
        const siblings = lane.cells
          .filter((c) => c.c === hit.c)
          .sort((a, b) => a.r - b.r);
        if (siblings.length >= 2) {
          return siblings.map((s) => ({
            k: s.k,
            av: s.av,
            t: s.t,
            a: s.a || Math.floor(s.r / 2) + 1,
            laneId: lane.laneId,
          }));
        }
        return [];
      }
    }
    return [];
  }

  function totalCostSum(cost) {
    if (!cost) return 0;
    return (cost.f || 0) + (cost.w || 0) + (cost.g || 0) + (cost.s || 0);
  }

  function renderCostMedallions(cost) {
    if (!cost) return '<span class="tt-cost-free">Gratis / Sin costo directo</span>';
    const items = [];
    if (cost.f) items.push(`<span class="tt-res-chip is-food" title="Comida"><img src="assets/icons/food.png" alt="" draggable="false" /><b class="mono">${cost.f}</b></span>`);
    if (cost.w) items.push(`<span class="tt-res-chip is-wood" title="Madera"><img src="assets/icons/wood.png" alt="" draggable="false" /><b class="mono">${cost.w}</b></span>`);
    if (cost.g) items.push(`<span class="tt-res-chip is-gold" title="Oro"><img src="assets/icons/gold.png" alt="" draggable="false" /><b class="mono">${cost.g}</b></span>`);
    if (cost.s) items.push(`<span class="tt-res-chip is-stone" title="Piedra"><img src="assets/icons/stone.png" alt="" draggable="false" /><b class="mono">${cost.s}</b></span>`);
    return items.join('');
  }

  function renderNodeTypeClass(t, ut) {
    if (t === 'qu') return 'is-type-qu';
    if (t === 'ru') return 'is-type-ru';
    if (t === 'qt') return 'is-type-qt';
    if (t === 'rt') return 'is-type-rt';
    if (t === 'ub' || t === 'rb') return 'is-type-ub';
    if (ut === 'T' || t === 't') return 'is-type-tech';
    if (ut === 'B' || t === 'bt' || t === 'bn') return 'is-type-bldg';
    return 'is-type-unit';
  }

  function rarityLabel(civCount, totalCivs, civName) {
    const c = Number(civCount || 0);
    if (c <= 1) return `Exclusivo de ${civName}`;
    if (c <= 8) return `Muy poco común · ${c}/${totalCivs} civs`;
    if (c <= 24) return `Selecto · ${c}/${totalCivs} civs`;
    if (c >= totalCivs - 2) return `Universal · ${c}/${totalCivs} civs`;
    return `Disponible en ${c}/${totalCivs} civs`;
  }

  function createTechTreeController({ onStateChange } = {}) {
    const ui = {
      data: null,
      loading: false,
      error: '',
      civSlug: 'franks',
      compareSlug: '',
      category: 'all',
      viewFilter: 'all',
      search: '',
      showBonuses: true,
      selectedNodeKey: '',
      selectedNodeAge: 3,
      selectedNodeAv: 1,
      selectedNodeType: 'qu',
      inspectorOpen: false,
      scrollLeft: 0,
    };

    // Referencia viva a animaciones para cancelarlas limpiamente si el usuario interactúa
    let inertiaRaf = null;
    let glideRaf = null;
    let wheelRaf = null;
    let activeEscHandler = null;
    let activeMoveHandler = null;
    let activeUpHandler = null;

    function stopAllMotion() {
      if (inertiaRaf) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
      if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = null; }
      if (wheelRaf) { cancelAnimationFrame(wheelRaf); wheelRaf = null; }
    }

    function notify() {
      stopAllMotion();
      if (typeof onStateChange === 'function') onStateChange();
    }

    function setData(data, defaultCivSlug = null) {
      ui.data = data || null;
      ui.loading = false;
      ui.error = '';
      if (defaultCivSlug && ui.data?.civs?.[defaultCivSlug]) {
        ui.civSlug = defaultCivSlug;
      } else if (ui.data?.civs && !ui.data.civs[ui.civSlug]) {
        ui.civSlug = Object.keys(ui.data.civs)[0] || 'franks';
      }
      pickDefaultSelectedNode();
    }

    function pickDefaultSelectedNode() {
      const civ = ui.data?.civs?.[ui.civSlug];
      if (!civ) return;
      for (const b of (civ.buildings || [])) {
        const uu = (b.cells || []).find((c) => c.t === 'qu');
        if (uu) {
          ui.selectedNodeKey = uu.k;
          ui.selectedNodeAge = uu.a || 3;
          ui.selectedNodeAv = uu.av;
          ui.selectedNodeType = uu.t;
          return;
        }
      }
      const first = civ.buildings?.[0];
      if (first) {
        ui.selectedNodeKey = first.k;
        ui.selectedNodeAge = first.age || 1;
        ui.selectedNodeAv = first.av;
        ui.selectedNodeType = first.t || 'bt';
      }
    }

    function renderInspectorHtml(civ, lanes, compareCiv, compareAvailMap, animMode = 'enter') {
      if (!ui.inspectorOpen || !ui.selectedNodeKey || !ui.data?.nodes?.[ui.selectedNodeKey]) {
        return '';
      }
      const nodesMap = ui.data.nodes;
      const totalCivs = ui.data.meta?.civCount || Object.keys(ui.data.civs || {}).length || 56;
      const node = nodesMap[ui.selectedNodeKey];
      const ageObj = AGE_META.find((a) => a.id === ui.selectedNodeAge) || AGE_META[0];
      const st = node.st || {};
      const typeCls = renderNodeTypeClass(ui.selectedNodeType, node.ut);
      const badge = TYPE_BADGES[ui.selectedNodeType];
      const typeLabel = badge ? badge.label : (node.ut === 'T' ? 'Tecnología' : node.ut === 'B' ? 'Edificio' : 'Unidad');

      const parentBldg = node.bldg && nodesMap[node.bldg] ? nodesMap[node.bldg] : null;
      const originVerb = node.ut === 'T' ? 'Investigado en' : 'Entrenado en';

      // Cadena de evolución de la columna
      const evoChain = findEvolutionChain(civ, lanes, node.k);

      // Comparador 2 civs (escudos + veredicto)
      let compareHtml = '';
      if (compareCiv && compareAvailMap) {
        const bHas = compareAvailMap.get(node.k) === 1;
        const aHas = ui.selectedNodeAv === 1;
        const tone = aHas && bHas ? 'is-both' : aHas && !bHas ? 'is-only-a' : !aHas && bHas ? 'is-only-b' : 'is-none';
        const verdict = aHas && bHas
          ? 'Acceso parejo en ambas civilizaciones'
          : aHas && !bHas
            ? `Ventaja ${civ.name}: ${compareCiv.name} no accede`
            : !aHas && bHas
              ? `Brecha: ${compareCiv.name} sí cuenta con esto`
              : 'Ninguna de las dos civilizaciones accede';
        compareHtml = `<div class="tt-insp-cmp-card ${tone}">
          <div class="tt-insp-cmp-pair">
            <span class="tt-cmp-side ${aHas ? 'is-yes' : 'is-no'}">
              <img src="${esc(civCrest(civ.slug))}" alt="" draggable="false" />
              <b>${esc(civ.name)}</b>
              <i>${aHas ? '✓' : '×'}</i>
            </span>
            <span class="tt-cmp-vs">VS</span>
            <span class="tt-cmp-side ${bHas ? 'is-yes' : 'is-no'}">
              <img src="${esc(civCrest(compareCiv.slug))}" alt="" draggable="false" />
              <b>${esc(compareCiv.name)}</b>
              <i>${bHas ? '✓' : '×'}</i>
            </span>
          </div>
          <small>${esc(verdict)}</small>
        </div>`;
      }

      // Barras de rendimiento visual (100 % CSP-safe con clases discretas tt-w-0..100)
      const bars = [];
      if (st.hp != null) {
        bars.push({ lbl: 'Puntos de salud', val: String(st.hp), cls: barWidthClass(st.hp, node.ut === 'B' ? 3200 : 240), tone: 'is-hp' });
      }
      if (st.atk != null) {
        const dps = st.rld > 0 ? (st.atk / st.rld).toFixed(1) : null;
        bars.push({
          lbl: 'Ataque base',
          val: dps ? `${st.atk} (${dps} DPS)` : String(st.atk),
          cls: barWidthClass(st.atk, 24),
          tone: 'is-atk',
        });
      }
      if (st.ma != null || st.pa != null) {
        const ma = st.ma ?? 0;
        const pa = st.pa ?? 0;
        bars.push({
          lbl: 'Armadura (C.a.C. / Proy.)',
          val: `${ma} / ${pa}`,
          cls: barWidthClass(Math.max(ma, pa), 10),
          tone: 'is-arm',
        });
      }
      if (st.rng != null && st.rng > 0) {
        bars.push({ lbl: 'Alcance', val: `${st.rng} casillas`, cls: barWidthClass(st.rng, 12), tone: 'is-rng' });
      }
      if (st.spd != null && st.spd > 0) {
        bars.push({ lbl: 'Velocidad', val: `${st.spd}`, cls: barWidthClass(st.spd, 1.65), tone: 'is-spd' });
      }

      const miniStats = [];
      if (st.rld != null && st.rld > 0) miniStats.push({ lbl: 'Recarga', val: `${st.rld}s` });
      if (st.acc != null && st.acc > 0) miniStats.push({ lbl: 'Precisión', val: `${st.acc}%` });
      if (st.los != null && st.los > 0) miniStats.push({ lbl: 'Visión', val: String(st.los) });
      if (st.tt != null && st.tt > 0) miniStats.push({ lbl: node.ut === 'B' ? 'Obra' : 'Entren.', val: `${st.tt}s` });
      if (st.rt != null && st.rt > 0) miniStats.push({ lbl: 'Invest.', val: `${st.rt}s` });
      if (st.gar != null && st.gar > 0) miniStats.push({ lbl: 'Guarn.', val: String(st.gar) });

      const baseSum = totalCostSum(node.cost);
      const rarityCount = Number(node.civCount || 0);
      const rarityCls = barWidthClass(rarityCount, totalCivs);

      const animCls = animMode === 'swap' ? ' is-swapping' : ' is-entering';
      return `<aside class="tt-inspector${animCls} ${typeCls}" id="ttInspectorCard" aria-label="Detalle de nodo seleccionado">
        <div class="tt-insp-hero ${typeCls}">
          <div class="tt-insp-top-bar">
            <div class="tt-insp-badges">
              <span class="tt-insp-type ${typeCls}">${esc(typeLabel)}</span>
              <span class="tt-insp-age"><img src="${esc(ageObj.icon)}" alt="" draggable="false" />${esc(ageObj.short)}</span>
            </div>
            <button type="button" class="tt-insp-close" id="ttCloseInspectorBtn" title="Cerrar detalle (Esc)" aria-label="Cerrar detalle">×</button>
          </div>

          <div class="tt-insp-identity">
            <div class="tt-insp-portrait ${typeCls}${ui.selectedNodeAv ? '' : ' is-unavail'}">
              <img src="${esc(nodeIcon(node))}" alt="" draggable="false" />
              ${!ui.selectedNodeAv ? '<span class="tt-insp-lock-x" aria-hidden="true">×</span>' : ''}
            </div>
            <div class="tt-insp-titles">
              <h4>${esc(node.name)}</h4>
              ${node.nameEn && norm(node.nameEn) !== norm(node.name) ? `<small class="tt-insp-en">${esc(node.nameEn)}</small>` : ''}
              <div class="tt-insp-status-row">
                <span class="tt-insp-avail ${ui.selectedNodeAv ? 'is-ok' : 'is-no'}">
                  ${ui.selectedNodeAv ? `✓ Disponible en ${esc(civ.name)}` : `× Falta en ${esc(civ.name)}`}
                </span>
              </div>
            </div>
          </div>

          ${parentBldg ? `<button type="button" class="tt-insp-origin" data-tt-jump="${esc(parentBldg.k)}" title="Ir a ${esc(parentBldg.name)}">
            <img src="${esc(nodeIcon(parentBldg))}" alt="" draggable="false" />
            <span>${esc(originVerb)}: <b>${esc(parentBldg.name)}</b></span>
            <i aria-hidden="true">→</i>
          </button>` : ''}
        </div>

        <div class="tt-insp-scroll">
          ${compareHtml}

          ${evoChain.length ? `<div class="tt-insp-section">
            <div class="tt-insp-sec-head">
              <span class="tt-insp-kicker">LÍNEA DE EVOLUCIÓN</span>
              <small class="mono">${evoChain.filter((e) => e.av).length}/${evoChain.length}</small>
            </div>
            <div class="tt-evo-track">
              ${evoChain.map((step, idx) => {
                const sn = nodesMap[step.k];
                if (!sn) return '';
                const isCur = step.k === node.k;
                return `${idx > 0 ? '<span class="tt-evo-arrow" aria-hidden="true">›</span>' : ''}
                <button type="button"
                  class="tt-evo-step${isCur ? ' is-current' : ''}${step.av ? ' is-avail' : ' is-unavail'}"
                  data-tt-evo-node="${esc(step.k)}"
                  data-tt-evo-age="${step.a}"
                  data-tt-evo-av="${step.av}"
                  data-tt-evo-type="${esc(step.t)}"
                  title="${esc(sn.name)} · ${step.av ? 'Disponible' : 'No disponible'}">
                  <span class="tt-evo-ico">
                    <img src="${esc(nodeIcon(sn))}" alt="" draggable="false" />
                    ${!step.av ? '<i>×</i>' : ''}
                  </span>
                  <small>${esc(sn.name)}</small>
                </button>`;
              }).join('')}
            </div>
          </div>` : ''}

          <div class="tt-insp-section tt-insp-costs-box">
            <div class="tt-insp-sec-head">
              <span class="tt-insp-kicker">COSTO DE RECURSOS</span>
              ${baseSum > 0 ? `<small class="mono">Total: ${baseSum}</small>` : ''}
            </div>
            <div class="tt-cost-grid">${renderCostMedallions(node.cost)}</div>
            ${node.upg?.cost ? `<div class="tt-upg-divider">
              <div class="tt-insp-sec-head">
                <span class="tt-insp-kicker">DESBLOQUEO / MEJORA</span>
                ${node.upg.rt ? `<small class="mono">${node.upg.rt}s</small>` : ''}
              </div>
              <div class="tt-cost-grid">${renderCostMedallions(node.upg.cost)}</div>
            </div>` : ''}
          </div>

          ${bars.length ? `<div class="tt-insp-section">
            <div class="tt-insp-sec-head">
              <span class="tt-insp-kicker">ATRIBUTOS DE COMBATE</span>
            </div>
            <div class="tt-stat-bars">
              ${bars.map((b) => `<div class="tt-sbar-row">
                <div class="tt-sbar-top">
                  <span>${esc(b.lbl)}</span>
                  <strong class="mono">${esc(b.val)}</strong>
                </div>
                <div class="tt-sbar-track"><i class="tt-sbar-fill ${b.tone} ${b.cls}"></i></div>
              </div>`).join('')}
            </div>
            ${miniStats.length ? `<div class="tt-mini-stats-grid">
              ${miniStats.map((m) => `<div class="tt-mini-pill"><span>${esc(m.lbl)}</span><b class="mono">${esc(m.val)}</b></div>`).join('')}
            </div>` : ''}
          </div>` : (miniStats.length ? `<div class="tt-insp-section">
            <div class="tt-mini-stats-grid">
              ${miniStats.map((m) => `<div class="tt-mini-pill"><span>${esc(m.lbl)}</span><b class="mono">${esc(m.val)}</b></div>`).join('')}
            </div>
          </div>` : '')}

          ${Array.isArray(st.bonus) && st.bonus.length ? `<div class="tt-insp-section">
            <span class="tt-insp-kicker">FUERTE CONTRA (DAÑO ADICIONAL)</span>
            <div class="tt-bonus-chips">${st.bonus.map((b) => `<span class="tt-bonus-chip is-strong">${esc(b)}</span>`).join('')}</div>
          </div>` : ''}

          ${Array.isArray(st.armors) && st.armors.length ? `<div class="tt-insp-section">
            <span class="tt-insp-kicker">CLASES DE ARMADURA (COUNTERS)</span>
            <div class="tt-bonus-chips">${st.armors.map((a) => `<span class="tt-bonus-chip is-armor">${esc(a)}</span>`).join('')}</div>
          </div>` : ''}

          ${rarityCount > 0 ? `<div class="tt-insp-section tt-rarity-box">
            <div class="tt-sbar-top">
              <span class="tt-insp-kicker">PRESENCIA EN EL JUEGO</span>
              <small class="mono">${Math.round((rarityCount / totalCivs) * 100)}%</small>
            </div>
            <div class="tt-sbar-track"><i class="tt-sbar-fill is-rarity ${rarityCls}"></i></div>
            <small class="tt-rarity-note">${esc(rarityLabel(rarityCount, totalCivs, civ.name))}</small>
          </div>` : ''}

          ${node.desc ? `<div class="tt-insp-codex">
            <span class="tt-insp-kicker">CODEX OFICIAL</span>
            <p>${esc(node.desc)}</p>
          </div>` : ''}
        </div>
      </aside>`;
    }

    function renderView(isActive) {
      if (!isActive) {
        return '<section class="tr-panel" data-tr-panel="techtree"></section>';
      }
      if (ui.loading) {
        return `<section class="tr-panel is-active" data-tr-panel="techtree">
          <div class="tt-loading-card">
            <span class="tt-loading-dot" aria-hidden="true"></span>
            <strong>Cargando Árbol de Tecnología Oficial (56 civilizaciones)…</strong>
          </div>
        </section>`;
      }
      if (ui.error || !ui.data?.civs) {
        return `<section class="tr-panel is-active" data-tr-panel="techtree">
          <div class="tt-loading-card is-error">
            <strong>No se pudo cargar el Árbol de Tecnología.</strong>
            <small>${esc(ui.error || 'Intentá recargar la pestaña.')}</small>
          </div>
        </section>`;
      }

      const nodesMap = ui.data.nodes || {};
      const civEntries = Object.values(ui.data.civs).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      const civ = ui.data.civs[ui.civSlug] || civEntries[0];
      const compareCiv = ui.compareSlug && ui.compareSlug !== civ.slug ? (ui.data.civs[ui.compareSlug] || null) : null;
      const compareAvailMap = compareCiv ? buildCivAvailabilityMap(compareCiv) : null;

      const allLanes = buildLanesForCiv(civ, nodesMap);
      const q = norm(ui.search);

      let matchCount = 0;
      const filteredLanes = allLanes.filter((lane) => {
        if (ui.category !== 'all' && lane.cat !== ui.category) return false;
        if (!q && ui.viewFilter === 'all') return true;

        const bNode = nodesMap[lane.building.k];
        const bMatch = q ? (norm(bNode?.name).includes(q) || norm(bNode?.nameEn).includes(q)) : true;
        if (q && bMatch) matchCount += 1;

        const hasMatchingCell = lane.cells.some((c) => {
          const n = nodesMap[c.k];
          const textOk = !q || norm(n?.name).includes(q) || norm(n?.nameEn).includes(q) || norm(n?.desc).includes(q);
          if (q && textOk) matchCount += 1;
          const availOk = ui.viewFilter === 'all'
            ? true
            : ui.viewFilter === 'avail'
              ? c.av === 1
              : c.av === 0;
          return textOk && availOk;
        });

        const bAvailOk = ui.viewFilter === 'all'
          ? true
          : ui.viewFilter === 'avail'
            ? lane.building.av === 1
            : lane.building.av === 0;

        return hasMatchingCell || (q && bMatch && bAvailOk);
      });

      const covPct = civ.coverage?.total > 0 ? Math.round((civ.coverage.avail / civ.coverage.total) * 100) : 0;

      const civOptions = civEntries.map((c) => `<option value="${esc(c.slug)}"${c.slug === civ.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
      const cmpOptions = `<option value="">Sin comparar</option>` + civEntries
        .filter((c) => c.slug !== civ.slug)
        .map((c) => `<option value="${esc(c.slug)}"${c.slug === ui.compareSlug ? ' selected' : ''}>vs ${esc(c.name)}</option>`)
        .join('');

      const jumpDockHtml = filteredLanes.length > 2
        ? `<div class="tt-jump-dock" role="navigation" aria-label="Salto rápido a edificios">
            <span class="tt-jump-lbl">IR A</span>
            <div class="tt-jump-strip">
              ${filteredLanes.map((lane) => `<button type="button" class="tt-jump-pill" data-tt-jump="${esc(lane.laneId)}" title="Deslizar hasta ${esc(lane.title)}">
                <img src="${esc(lane.icon)}" alt="" draggable="false" />
                <span>${esc(lane.title)}</span>
              </button>`).join('')}
            </div>
          </div>`
        : '';

      const lanesHtml = filteredLanes.map((lane) => {
        const bAv = lane.building.av ? 1 : 0;
        const bSelected = ui.inspectorOpen && ui.selectedNodeKey === lane.building.k;
        const bCmpHas = compareAvailMap ? compareAvailMap.get(lane.building.k) === 1 : null;
        const bDiffCls = compareAvailMap
          ? (bAv && !bCmpHas ? ' is-diff-only-a' : (!bAv && bCmpHas ? ' is-diff-only-b' : ''))
          : '';
        const colCls = `tt-cols-${Math.max(1, Math.min(12, lane.cols))}`;

        const cellMap = new Map();
        const colRows = new Map();
        for (const c of lane.cells) {
          cellMap.set(`${c.r}:${c.c}`, c);
          if (!colRows.has(c.c)) colRows.set(c.c, []);
          colRows.get(c.c).push(c.r);
        }
        for (const arr of colRows.values()) arr.sort((a, b) => a - b);

        const ageBandsHtml = AGE_META.map((ageObj, ageIdx) => {
          const rowsHtml = [ageIdx * 2, ageIdx * 2 + 1].map((rIdx) => {
            const slotsHtml = [];
            for (let cIdx = 0; cIdx < lane.cols; cIdx += 1) {
              const cell = cellMap.get(`${rIdx}:${cIdx}`);
              if (!cell) {
                const rowsInCol = colRows.get(cIdx) || [];
                const hasAbove = rowsInCol.some((rr) => rr < rIdx);
                const hasBelow = rowsInCol.some((rr) => rr > rIdx);
                slotsHtml.push(`<div class="tt-slot is-empty${hasAbove && hasBelow ? ' has-vline' : ''}"></div>`);
                continue;
              }
              const n = nodesMap[cell.k];
              if (!n) {
                slotsHtml.push('<div class="tt-slot is-empty"></div>');
                continue;
              }

              const isTextMatch = !q || norm(n.name).includes(q) || norm(n.nameEn).includes(q) || norm(n.desc).includes(q);
              const isFilterHidden = (ui.viewFilter === 'avail' && !cell.av) || (ui.viewFilter === 'missing' && cell.av === 1);
              const isDim = (q && !isTextMatch) || isFilterHidden;
              const isMatchHit = Boolean(q && isTextMatch && !isFilterHidden);
              const isSel = ui.inspectorOpen && ui.selectedNodeKey === cell.k;
              const typeCls = renderNodeTypeClass(cell.t, n.ut);
              const badge = TYPE_BADGES[cell.t];

              let cmpCls = '';
              let cmpBadge = '';
              if (compareAvailMap) {
                const bHas = compareAvailMap.get(cell.k) === 1;
                if (cell.av && !bHas) {
                  cmpCls = ' is-diff-only-a';
                  cmpBadge = '<i class="tt-diff-tag is-a" title="Disponible solo en tu civ">+</i>';
                } else if (!cell.av && bHas) {
                  cmpCls = ' is-diff-only-b';
                  cmpBadge = '<i class="tt-diff-tag is-b" title="El rival sí lo tiene">R</i>';
                }
              }

              const rowsInCol = colRows.get(cIdx) || [];
              const hasAbove = rowsInCol.some((rr) => rr < rIdx);
              const hasBelow = rowsInCol.some((rr) => rr > rIdx);

              slotsHtml.push(`<div class="tt-slot${hasAbove ? ' has-up' : ''}${hasBelow ? ' has-down' : ''}">
                <button type="button"
                  class="tt-node ${typeCls}${cell.av ? ' is-avail' : ' is-unavail'}${isDim ? ' is-dim' : ''}${isMatchHit ? ' is-hit' : ''}${isSel ? ' is-selected' : ''}${cmpCls}"
                  data-tt-node="${esc(cell.k)}"
                  data-tt-age="${cell.a || ageObj.id}"
                  data-tt-av="${cell.av}"
                  data-tt-type="${esc(cell.t)}"
                  title="${esc(n.name)} · ${cell.av ? 'Disponible' : 'No disponible'}">
                  <span class="tt-node-frame">
                    <img src="${esc(nodeIcon(n))}" alt="" loading="lazy" draggable="false" />
                    ${!cell.av ? '<span class="tt-node-x" aria-hidden="true">×</span>' : ''}
                    ${badge && cell.av ? `<span class="tt-node-tag ${badge.cls}">${esc(badge.short)}</span>` : ''}
                    ${cmpBadge}
                  </span>
                  <span class="tt-node-name">${esc(n.name)}</span>
                </button>
              </div>`);
            }
            return `<div class="tt-subrow ${colCls}">${slotsHtml.join('')}</div>`;
          }).join('');
          return `<div class="tt-age-band is-age-${ageObj.id}">${rowsHtml}</div>`;
        }).join('');

        return `<article class="tt-lane${bAv ? '' : ' is-lane-unavail'}" data-tt-lane-id="${esc(lane.laneId)}">
          <button type="button"
            class="tt-lane-head${bSelected ? ' is-selected' : ''}${bDiffCls}"
            data-tt-node="${esc(lane.building.k)}"
            data-tt-age="${lane.building.age || 1}"
            data-tt-av="${bAv}"
            data-tt-type="${esc(lane.building.t || 'bt')}"
            title="${esc(lane.title)}">
            <span class="tt-lane-ico">
              <img src="${esc(lane.icon)}" alt="" draggable="false" />
              ${!bAv ? '<span class="tt-node-x" aria-hidden="true">×</span>' : ''}
            </span>
            <span class="tt-lane-meta">
              <strong>${esc(lane.title)}</strong>
              <small>${esc(AGE_META[(lane.building.age || 1) - 1]?.short || 'Alta Edad')}</small>
            </span>
          </button>
          <div class="tt-lane-body">${ageBandsHtml}</div>
        </article>`;
      }).join('');

      return `<section class="tr-panel is-active tt-root" data-tr-panel="techtree">
        <header class="tt-toolbar-card">
          <div class="tt-civ-picker-row">
            <div class="tt-civ-hero-pick">
              <div class="tt-civ-crest-ring">
                <img src="${esc(civCrest(civ.slug))}" alt="${esc(civ.name)}" draggable="false" />
              </div>
              <div class="tt-civ-select-wrap">
                <label class="tt-kicker" for="ttCivSelect">CIVILIZACIÓN ACTIVA · 56 OFICIALES</label>
                <div class="tt-civ-select-line">
                  <select id="ttCivSelect" class="tt-select tt-select-main" aria-label="Elegir civilización">${civOptions}</select>
                  <span class="tt-coverage-pill mono" title="Nodos disponibles en el árbol completo">${civ.coverage?.avail || 0}/${civ.coverage?.total || 0} · ${covPct}%</span>
                </div>
                <span class="tt-civ-arch">${esc(civ.arch || 'Civilización estándar AoE2:DE')}</span>
              </div>
            </div>

            <div class="tt-toolbar-controls">
              <div class="tt-cmp-wrap">
                <label class="tt-kicker" for="ttCompareSelect">COMPARAR ÁRBOL</label>
                <select id="ttCompareSelect" class="tt-select tt-select-cmp" aria-label="Comparar con otra civilización">${cmpOptions}</select>
              </div>
              <div class="tt-search-wrap">
                <label class="tt-kicker" for="ttSearchInput">BUSCAR EN EL ÁRBOL</label>
                <div class="tt-search-box">
                  <input id="ttSearchInput" class="tt-search-input" type="search" value="${esc(ui.search)}" placeholder="Ej: Paladín, Brazal, Redención, Pureza…" autocomplete="off" />
                  ${q ? `<span class="tt-search-hits mono">${matchCount}</span>` : ''}
                </div>
              </div>
              <button type="button" id="ttToggleBonusesBtn" class="tt-ghost-btn">${ui.showBonuses ? 'Ocultar bonos' : 'Ver bonos'}</button>
            </div>
          </div>

          <div class="tt-filter-bar">
            <div class="tt-cat-pills" role="tablist" aria-label="Categorías de edificios">
              ${CATEGORIES.map((cat) => `<button type="button" class="tt-pill${ui.category === cat.id ? ' is-active' : ''}" data-tt-cat="${cat.id}">${esc(cat.label)}</button>`).join('')}
            </div>
            <div class="tt-mode-pills" role="group" aria-label="Filtro de disponibilidad">
              <button type="button" class="tt-mode-btn${ui.viewFilter === 'all' ? ' is-active' : ''}" data-tt-view="all">Todo</button>
              <button type="button" class="tt-mode-btn${ui.viewFilter === 'avail' ? ' is-active' : ''}" data-tt-view="avail">Disponibles</button>
              <button type="button" class="tt-mode-btn${ui.viewFilter === 'missing' ? ' is-active' : ''}" data-tt-view="missing">Solo brechas</button>
            </div>
          </div>
        </header>

        ${ui.showBonuses ? `<section class="tt-bonuses-card">
          <div class="tt-bonuses-col">
            <span class="tt-kicker">BONIFICACIONES DE ${esc(civ.name.toUpperCase())}</span>
            <ul class="tt-bonus-list">
              ${(civ.bonuses || []).map((b) => `<li>${esc(b)}</li>`).join('')}
            </ul>
          </div>
          <div class="tt-bonuses-side">
            ${(civ.uniqueUnits || []).length ? `<div class="tt-meta-pill-box is-uu">
              <span class="tt-kicker">UNIDAD ÚNICA</span>
              <strong>${esc(civ.uniqueUnits.join(' · '))}</strong>
            </div>` : ''}
            ${(civ.uniqueTechs || []).length ? `<div class="tt-meta-pill-box is-ut">
              <span class="tt-kicker">TECNOLOGÍAS ÚNICAS</span>
              <div class="tt-ut-lines">${civ.uniqueTechs.map((t) => `<small>${esc(t)}</small>`).join('')}</div>
            </div>` : ''}
            ${civ.teamBonus ? `<div class="tt-meta-pill-box is-team">
              <span class="tt-kicker">BONO DE EQUIPO</span>
              <small>${esc(civ.teamBonus)}</small>
            </div>` : ''}
          </div>
        </section>` : ''}

        ${jumpDockHtml}

        <div class="tt-legend-strip">
          <span class="tt-leg-item"><i class="tt-leg-dot is-type-unit"></i>Unidad</span>
          <span class="tt-leg-item"><i class="tt-leg-dot is-type-qu"></i>Única</span>
          <span class="tt-leg-item"><i class="tt-leg-dot is-type-ru"></i>Regional</span>
          <span class="tt-leg-item"><i class="tt-leg-dot is-type-tech"></i>Tecnología</span>
          <span class="tt-leg-item"><i class="tt-leg-dot is-type-qt"></i>Tec. Única</span>
          <span class="tt-leg-item"><i class="tt-leg-dot is-unavail"></i>No disponible</span>
          ${compareCiv ? `<span class="tt-leg-item is-cmp-leg"><i class="tt-diff-tag is-a">+</i>Solo ${esc(civ.name)}</span>
          <span class="tt-leg-item is-cmp-leg"><i class="tt-diff-tag is-b">R</i>Solo ${esc(compareCiv.name)}</span>` : ''}
          <span class="tt-leg-tip">Arrastrá con el mouse desde cualquier parte · Clic en un ícono para abrir su ficha completa</span>
        </div>

        <div class="tt-stage${ui.inspectorOpen ? ' has-inspector' : ''}" id="ttStage">
          <div class="tt-canvas-shell">
            <div class="tt-age-rail" aria-hidden="true">
              <div class="tt-age-rail-spacer"><span>EDAD</span></div>
              ${AGE_META.map((age) => `<div class="tt-age-rail-band is-age-${age.id}">
                <img src="${esc(age.icon)}" alt="" draggable="false" />
                <strong>${esc(age.short)}</strong>
              </div>`).join('')}
            </div>
            <div class="tt-viewport-wrap">
              <div class="tt-edge-fade is-left" id="ttFadeLeft" aria-hidden="true"></div>
              <div class="tt-edge-fade is-right" id="ttFadeRight" aria-hidden="true"></div>
              <button type="button" class="tt-scroll-btn is-left" id="ttScrollLeftBtn" title="Deslizar a la izquierda" aria-label="Deslizar a la izquierda">‹</button>
              <button type="button" class="tt-scroll-btn is-right" id="ttScrollRightBtn" title="Deslizar a la derecha" aria-label="Deslizar a la derecha">›</button>
              <div class="tt-lanes-scroll" id="ttLanesScroll">
                ${filteredLanes.length
                  ? `<div class="tt-lanes-track">${lanesHtml}</div>`
                  : `<div class="tt-empty-state">No hay unidades ni tecnologías que coincidan con ese filtro.</div>`}
              </div>
            </div>
          </div>
          <div class="tt-inspector-slot" id="ttInspectorSlot">
            ${renderInspectorHtml(civ, allLanes, compareCiv, compareAvailMap)}
          </div>
        </div>
      </section>`;
    }

    function bindEvents(container) {
      const panel = container?.querySelector('[data-tr-panel="techtree"]');
      if (!panel) return;

      stopAllMotion();
      if (activeEscHandler) {
        root.removeEventListener('keydown', activeEscHandler);
        activeEscHandler = null;
      }
      if (activeMoveHandler) {
        root.removeEventListener('mousemove', activeMoveHandler);
        activeMoveHandler = null;
      }
      if (activeUpHandler) {
        root.removeEventListener('mouseup', activeUpHandler);
        activeUpHandler = null;
      }

      const nodesMap = ui.data?.nodes || {};
      const civ = ui.data?.civs?.[ui.civSlug];
      const compareCiv = ui.compareSlug && ui.compareSlug !== ui.civSlug ? (ui.data?.civs?.[ui.compareSlug] || null) : null;
      const compareAvailMap = compareCiv ? buildCivAvailabilityMap(compareCiv) : null;
      const allLanes = buildLanesForCiv(civ, nodesMap);

      const scroller = panel.querySelector('#ttLanesScroll');
      const trackEl = scroller?.querySelector('.tt-lanes-track') || null;
      const stage = panel.querySelector('#ttStage');
      const inspectorSlot = panel.querySelector('#ttInspectorSlot');
      const fadeLeft = panel.querySelector('#ttFadeLeft');
      const fadeRight = panel.querySelector('#ttFadeRight');
      const btnLeft = panel.querySelector('#ttScrollLeftBtn');
      const btnRight = panel.querySelector('#ttScrollRightBtn');

      function writeSubpixelX(pos) {
        if (!scroller) return;
        // En monitores HiDPI (>=1.5x) `scrollLeft` ya tiene precisión sub-píxel nativa sin crear
        // una capa GPU gigante sobre todo el track horizontal (evita tirones de VRAM en 4K).
        const useSubpixelTransform = (root.devicePixelRatio || 1) < 1.25 && Boolean(trackEl);
        if (!useSubpixelTransform) {
          scroller.scrollLeft = pos;
          return;
        }
        const intPos = Math.floor(pos);
        const frac = pos - intPos;
        if (scroller.scrollLeft !== intPos) scroller.scrollLeft = intPos;
        trackEl.style.transform = frac > 0.004 ? `translate3d(${(-frac).toFixed(3)}px, 0, 0)` : '';
      }

      function settleSubpixelX(pos) {
        if (!scroller) return;
        scroller.scrollLeft = Math.round(pos);
        if (trackEl) trackEl.style.transform = '';
      }

      // Indicadores dorados deslizantes en categorías y filtro de vista
      if (root.RelicSmoothMotion && typeof root.RelicSmoothMotion.syncGlideIndicator === 'function') {
        const catRow = panel.querySelector('.tt-cat-pills');
        const activeCat = catRow?.querySelector('.tt-pill.is-active');
        root.RelicSmoothMotion.syncGlideIndicator(catRow, activeCat, { key: 'tt-cat', axis: 'x', className: 'tt-glide-pill' });

        const modeRow = panel.querySelector('.tt-mode-pills');
        const activeMode = modeRow?.querySelector('.tt-mode-btn.is-active');
        root.RelicSmoothMotion.syncGlideIndicator(modeRow, activeMode, { key: 'tt-mode', axis: 'x', className: 'tt-glide-pill' });
      }

      // Caché de maxScroll para evitar lecturas de layout (scrollWidth/clientWidth) dentro de mousemove y RAF
      let cachedMaxScroll = 0;
      let prevHasLeft = null;
      let prevHasRight = null;

      function refreshScrollBounds() {
        if (!scroller) return;
        cachedMaxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      }

      if (scroller) {
        refreshScrollBounds();
        if (ui.scrollLeft > 0) {
          scroller.scrollLeft = Math.min(cachedMaxScroll, ui.scrollLeft);
        }
      }

      function syncEdgeAffordances(slOverride = null) {
        if (!scroller) return;
        const sl = slOverride != null ? slOverride : scroller.scrollLeft;
        ui.scrollLeft = sl;
        const hasLeft = sl > 8;
        const hasRight = cachedMaxScroll - sl > 8;
        if (hasLeft !== prevHasLeft) {
          prevHasLeft = hasLeft;
          fadeLeft?.classList.toggle('is-visible', hasLeft);
          btnLeft?.classList.toggle('is-visible', hasLeft);
        }
        if (hasRight !== prevHasRight) {
          prevHasRight = hasRight;
          fadeRight?.classList.toggle('is-visible', hasRight);
          btnRight?.classList.toggle('is-visible', hasRight);
        }
      }

      /** Deslizamiento sedoso sub-píxel con curva quintic ease-out hacia `targetX`. */
      function smoothGlideTo(targetX, durationMs = 560) {
        if (!scroller) return;
        stopAllMotion();
        refreshScrollBounds();
        const startX = scroller.scrollLeft;
        const clamped = Math.max(0, Math.min(cachedMaxScroll, targetX));
        const delta = clamped - startX;
        if (Math.abs(delta) < 1) {
          settleSubpixelX(clamped);
          return;
        }
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / durationMs);
          const eased = 1 - Math.pow(1 - p, 4);
          const cur = startX + delta * eased;
          if (p < 1) {
            writeSubpixelX(cur);
            syncEdgeAffordances(cur);
            glideRaf = requestAnimationFrame(step);
          } else {
            settleSubpixelX(clamped);
            syncEdgeAffordances(clamped);
            glideRaf = null;
          }
        };
        glideRaf = requestAnimationFrame(step);
      }

      function jumpToLane(laneId) {
        if (!scroller || !laneId) return;
        const targetLane = panel.querySelector(`.tt-lane[data-tt-lane-id="${CSS.escape(laneId)}"]`);
        if (!targetLane) return;
        playSfx('glide');
        const dest = Math.max(0, targetLane.offsetLeft - 18);
        smoothGlideTo(dest, 460);
        targetLane.classList.remove('is-arrived');
        void targetLane.offsetWidth;
        targetLane.classList.add('is-arrived');
        setTimeout(() => targetLane.classList.remove('is-arrived'), 950);
      }

      /** Actualiza el Inspector y el nodo seleccionado SIN reconstruir el árbol ni mover el scroll. */
      function updateInspectorInPlace(playFeedback = true, wasAlreadyOpen = false) {
        if (!stage || !inspectorSlot) return;
        stage.classList.toggle('has-inspector', Boolean(ui.inspectorOpen));

        panel.querySelectorAll('.tt-node.is-selected, .tt-lane-head.is-selected').forEach((el) => {
          el.classList.remove('is-selected');
        });
        if (ui.inspectorOpen && ui.selectedNodeKey) {
          const matching = panel.querySelector(`[data-tt-node="${CSS.escape(ui.selectedNodeKey)}"]`);
          matching?.classList.add('is-selected');
        }

        if (!ui.inspectorOpen) {
          const cur = inspectorSlot.querySelector('.tt-inspector');
          if (cur) {
            cur.classList.remove('is-entering', 'is-swapping');
            cur.classList.add('is-leaving');
            setTimeout(() => {
              if (!ui.inspectorOpen) inspectorSlot.innerHTML = '';
              syncEdgeAffordances();
            }, 200);
          } else {
            inspectorSlot.innerHTML = '';
          }
          if (playFeedback) playSfx('soft');
          return;
        }

        inspectorSlot.innerHTML = renderInspectorHtml(civ, allLanes, compareCiv, compareAvailMap, wasAlreadyOpen ? 'swap' : 'enter');
        bindInspectorDynamicEvents();
        setTimeout(() => { refreshScrollBounds(); syncEdgeAffordances(); }, 60);

        if (playFeedback) {
          if (!ui.selectedNodeAv) playSfx('techMuted');
          else if (ui.selectedNodeType === 'qu' || ui.selectedNodeType === 'qt') playSfx('techUnique');
          else playSfx('techOpen');
        }
      }

      function selectNode(key, age, av, type) {
        if (!key) return;
        const wasOpen = Boolean(ui.inspectorOpen);
        if (wasOpen && ui.selectedNodeKey === key) {
          ui.inspectorOpen = false;
          updateInspectorInPlace(true, true);
          return;
        }
        ui.selectedNodeKey = key;
        ui.selectedNodeAge = Number(age || 1);
        ui.selectedNodeAv = Number(av || 0);
        ui.selectedNodeType = type || 'u';
        ui.inspectorOpen = true;
        updateInspectorInPlace(true, wasOpen);
      }

      function bindInspectorDynamicEvents() {
        inspectorSlot?.querySelector('#ttCloseInspectorBtn')?.addEventListener('click', () => {
          ui.inspectorOpen = false;
          updateInspectorInPlace(true, true);
        });
        inspectorSlot?.querySelectorAll('[data-tt-evo-node]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const k = btn.dataset.ttEvoNode;
            if (!k || k === ui.selectedNodeKey) return;
            ui.selectedNodeKey = k;
            ui.selectedNodeAge = Number(btn.dataset.ttEvoAge || 1);
            ui.selectedNodeAv = Number(btn.dataset.ttEvoAv || 0);
            ui.selectedNodeType = btn.dataset.ttEvoType || 'u';
            ui.inspectorOpen = true;
            updateInspectorInPlace(true, true);
          });
        });
        inspectorSlot?.querySelectorAll('[data-tt-jump]').forEach((btn) => {
          btn.addEventListener('click', () => jumpToLane(btn.dataset.ttJump));
        });
      }

      if (ui.inspectorOpen) bindInspectorDynamicEvents();

      // Escape cierra el Inspector con suavidad
      activeEscHandler = (ev) => {
        if (ev.key === 'Escape' && ui.inspectorOpen) {
          ui.inspectorOpen = false;
          updateInspectorInPlace(true);
        }
      };
      root.addEventListener('keydown', activeEscHandler);

      // Selectores principales
      panel.querySelector('#ttCivSelect')?.addEventListener('change', (ev) => {
        ui.civSlug = ev.target.value;
        if (ui.compareSlug === ui.civSlug) ui.compareSlug = '';
        if (ui.inspectorOpen && ui.selectedNodeKey) {
          const nextCiv = ui.data?.civs?.[ui.civSlug];
          const availMap = buildCivAvailabilityMap(nextCiv);
          if (availMap.has(ui.selectedNodeKey)) ui.selectedNodeAv = availMap.get(ui.selectedNodeKey);
          else pickDefaultSelectedNode();
        }
        notify();
      });

      panel.querySelector('#ttCompareSelect')?.addEventListener('change', (ev) => {
        ui.compareSlug = ev.target.value || '';
        notify();
      });

      const searchInp = panel.querySelector('#ttSearchInput');
      if (searchInp) {
        let searchTimer = null;
        searchInp.addEventListener('input', () => {
          ui.search = searchInp.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            const pos = searchInp.selectionStart;
            notify();
            const nextInp = container.querySelector('#ttSearchInput');
            if (nextInp) {
              nextInp.focus();
              try { nextInp.setSelectionRange(pos, pos); } catch {}
            }
          }, 140);
        });
      }

      panel.querySelector('#ttToggleBonusesBtn')?.addEventListener('click', () => {
        ui.showBonuses = !ui.showBonuses;
        notify();
      });

      panel.querySelectorAll('[data-tt-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ui.category = btn.dataset.ttCat || 'all';
          ui.scrollLeft = 0;
          notify();
        });
      });

      panel.querySelectorAll('[data-tt-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ui.viewFilter = btn.dataset.ttView || 'all';
          notify();
        });
      });

      // Dock de salto rápido a edificios
      panel.querySelectorAll('.tt-jump-dock [data-tt-jump]').forEach((btn) => {
        btn.addEventListener('click', () => jumpToLane(btn.dataset.ttJump));
      });

      // Botones flotantes ‹ y › con glide suave
      btnLeft?.addEventListener('click', () => {
        if (!scroller) return;
        playSfx('glide');
        smoothGlideTo(scroller.scrollLeft - Math.max(320, scroller.clientWidth * 0.58), 420);
      });
      btnRight?.addEventListener('click', () => {
        if (!scroller) return;
        playSfx('glide');
        smoothGlideTo(scroller.scrollLeft + Math.max(320, scroller.clientWidth * 0.58), 420);
      });

      // ==================== FÍSICA DE ARRASTRE DE CRISTAL LÍQUIDO (60/120 FPS · CERO THRASH) ====================
      let suppressClickUntil = 0;

      if (scroller) {
        let pointerDown = false;
        let isDragging = false;
        let startX = 0;
        let startScroll = 0;
        let dragTarget = 0;
        let dragDisplay = 0;
        let dragFollowRaf = null;
        let samples = [];

        scroller.addEventListener('scroll', () => syncEdgeAffordances(), { passive: true });
        syncEdgeAffordances();

        scroller.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0) return;
          stopAllMotion();
          if (dragFollowRaf) { cancelAnimationFrame(dragFollowRaf); dragFollowRaf = null; }
          if (trackEl) trackEl.style.transform = '';
          refreshScrollBounds();
          pointerDown = true;
          isDragging = false;
          startX = ev.clientX;
          startScroll = scroller.scrollLeft;
          dragTarget = startScroll;
          dragDisplay = startScroll;
          samples = [{ x: ev.clientX, t: performance.now() }];
        });

        const onWindowMove = (ev) => {
          if (!pointerDown) return;
          const dx = ev.clientX - startX;
          if (!isDragging && Math.abs(dx) >= 6) {
            isDragging = true;
            scroller.classList.add('is-dragging');
            let lastF = performance.now();
            const follow = (nowF) => {
              if (!isDragging) { dragFollowRaf = null; return; }
              const dt = Math.min(40, Math.max(4, nowF - lastF));
              lastF = nowF;
              // Seguidor sub-píxel sedoso en GPU (60/120 FPS reales sin micro-serrucho)
              const alpha = 1 - Math.exp(-dt / 26);
              dragDisplay += (dragTarget - dragDisplay) * alpha;
              writeSubpixelX(dragDisplay);
              syncEdgeAffordances(dragDisplay);
              dragFollowRaf = requestAnimationFrame(follow);
            };
            dragFollowRaf = requestAnimationFrame(follow);
          }
          if (!isDragging) return;
          ev.preventDefault();
          dragTarget = Math.max(0, Math.min(cachedMaxScroll, startScroll - dx));

          const now = performance.now();
          samples.push({ x: ev.clientX, t: now });
          while (samples.length > 2 && now - samples[0].t > 130) samples.shift();
        };

        const onWindowUp = () => {
          if (!pointerDown) return;
          pointerDown = false;
          if (dragFollowRaf) { cancelAnimationFrame(dragFollowRaf); dragFollowRaf = null; }
          if (!isDragging) return;
          isDragging = false;
          scroller.classList.remove('is-dragging');
          suppressClickUntil = performance.now() + 200;

          const now = performance.now();
          while (samples.length > 2 && now - samples[0].t > 130) samples.shift();
          let velocity = 0;
          if (samples.length >= 2) {
            const first = samples[0];
            const last = samples[samples.length - 1];
            const dt = Math.max(8, last.t - first.t);
            if (now - last.t < 95) {
              velocity = ((first.x - last.x) / dt) * 16.67;
              velocity = Math.max(-56, Math.min(56, velocity));
            }
          }

          if (Math.abs(velocity) < 0.35) {
            smoothGlideTo(dragTarget, 200);
            return;
          }

          // Inercia sub-píxel GPU: desacelera a 60/120 FPS reales sin cortes ni saltos de 1px
          let lastFrame = performance.now();
          let carryPos = dragDisplay;
          const coast = (frameNow) => {
            const dt = Math.min(40, Math.max(4, frameNow - lastFrame));
            lastFrame = frameNow;
            const stepFactor = dt / 16.67;
            carryPos += velocity * stepFactor;
            if (carryPos <= 0 || carryPos >= cachedMaxScroll) {
              const endPos = Math.max(0, Math.min(cachedMaxScroll, carryPos));
              settleSubpixelX(endPos);
              syncEdgeAffordances(endPos);
              inertiaRaf = null;
              return;
            }
            writeSubpixelX(carryPos);
            syncEdgeAffordances(carryPos);
            velocity *= Math.pow(0.950, stepFactor);
            if (Math.abs(velocity) > 0.08) {
              inertiaRaf = requestAnimationFrame(coast);
            } else {
              settleSubpixelX(carryPos);
              syncEdgeAffordances(carryPos);
              inertiaRaf = null;
            }
          };
          inertiaRaf = requestAnimationFrame(coast);
        };

        activeMoveHandler = onWindowMove;
        activeUpHandler = onWindowUp;
        root.addEventListener('mousemove', activeMoveHandler);
        root.addEventListener('mouseup', activeUpHandler);

        // Rueda horizontal sub-píxel GPU (Shift+rueda o trackpad horizontal)
        let wheelTarget = scroller.scrollLeft;
        let wheelDisplay = scroller.scrollLeft;
        let wheelLastF = 0;
        const animateWheel = (nowF) => {
          const dt = Math.min(40, Math.max(4, nowF - wheelLastF));
          wheelLastF = nowF;
          const diff = wheelTarget - wheelDisplay;
          const alpha = 1 - Math.exp(-dt / 150);
          const stepDelta = diff * alpha;
          if (Math.abs(diff) < 0.25 && Math.abs(stepDelta) < 0.08) {
            settleSubpixelX(wheelTarget);
            wheelDisplay = Math.round(wheelTarget);
            syncEdgeAffordances(wheelDisplay);
            wheelRaf = null;
            return;
          }
          wheelDisplay += stepDelta;
          writeSubpixelX(wheelDisplay);
          syncEdgeAffordances(wheelDisplay);
          wheelRaf = requestAnimationFrame(animateWheel);
        };

        scroller.addEventListener('wheel', (ev) => {
          refreshScrollBounds();
          if (cachedMaxScroll <= 0) return;
          const deltaH = ev.shiftKey && Math.abs(ev.deltaY) > Math.abs(ev.deltaX)
            ? ev.deltaY * 1.2
            : Math.abs(ev.deltaX) > Math.abs(ev.deltaY)
              ? ev.deltaX * 1.15
              : 0;
          if (!deltaH) return;
          ev.preventDefault();
          if (inertiaRaf) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
          if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = null; }
          if (!wheelRaf) {
            wheelDisplay = scroller.scrollLeft;
            wheelTarget = scroller.scrollLeft;
            wheelLastF = performance.now();
          }
          wheelTarget = Math.max(0, Math.min(cachedMaxScroll, wheelTarget + deltaH));
          if (!wheelRaf) wheelRaf = requestAnimationFrame(animateWheel);
        }, { passive: false });
      }

      // Clic en cualquier nodo del árbol (respeta el umbral de arrastre sin disparar clics accidentales)
      panel.querySelectorAll('[data-tt-node]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          if (performance.now() < suppressClickUntil) {
            ev.preventDefault();
            return;
          }
          selectNode(btn.dataset.ttNode, btn.dataset.ttAge, btn.dataset.ttAv, btn.dataset.ttType);
        });
      });
    }

    return {
      ui,
      setData,
      setLoading: (on) => { ui.loading = Boolean(on); },
      setError: (msg) => { ui.loading = false; ui.error = String(msg || ''); },
      setCiv: (slug) => {
        if (ui.data?.civs?.[slug]) {
          ui.civSlug = slug;
          if (ui.compareSlug === slug) ui.compareSlug = '';
          pickDefaultSelectedNode();
        }
      },
      renderView,
      bindEvents,
    };
  }

  root.TechTreeUI = {
    createTechTreeController,
    AGE_META,
    CATEGORIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
