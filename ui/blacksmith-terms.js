/* eslint-env browser */
/**
 * Relic · Global Blacksmith Technology Highlighter & Interactive Tooltip Engine
 *
 * Automatically highlights ALL 15 Age of Empires II: DE Blacksmith technologies
 * (5 lines × 3 ages, across ES-MX, ES-ES, EN, and short in-app forms) in bold +
 * category color across EVERY view in Relic (Central, Prematch, Batalla, Postmatch,
 * Entrenamiento, Planes, Modals, Toasts & Live Overlay), with a crisp hover/focus
 * tooltip translating each official game name into plain AoE2 player language
 * (e.g. "Mejora 1 de ataque de arqueros · +1 ataque y +1 alcance").
 *
 * 100% CSP-safe (zero inline style attributes; pure CSS classes + CSSOM positioning).
 */
(function initBlacksmithTerms(root) {
  'use strict';

  const TECHS = [
    // ==================== ATAQUE CUERPO A CUERPO (INFANTERÍA Y CABALLERÍA) ====================
    {
      id: 'forging',
      line: 'melee-atk',
      tier: 1,
      age: 'Edad Feudal',
      official: 'Forja',
      plain: 'Mejora 1 de ataque cuerpo a cuerpo',
      bonus: '+1 ataque (infantería y caballería)',
      detail: 'Primera mejora de ataque cuerpo a cuerpo en Herrería.',
      aliases: ['Forja', 'Forging'],
    },
    {
      id: 'iron_casting',
      line: 'melee-atk',
      tier: 2,
      age: 'Edad de los Castillos',
      official: 'Fundición de hierro',
      plain: 'Mejora 2 de ataque cuerpo a cuerpo',
      bonus: '+1 ataque (+2 total · infantería y caballería)',
      detail: 'Segunda mejora de ataque cuerpo a cuerpo en Herrería.',
      aliases: ['Fundición de hierro', 'Fundicion de hierro', 'Fundición', 'Iron Casting'],
    },
    {
      id: 'blast_furnace',
      line: 'melee-atk',
      tier: 3,
      age: 'Edad Imperial',
      official: 'Alto horno',
      plain: 'Mejora 3 de ataque cuerpo a cuerpo',
      bonus: '+2 ataque (+4 total · infantería y caballería)',
      detail: 'Última mejora de ataque cuerpo a cuerpo en Herrería.',
      aliases: ['Alto horno', 'Blast Furnace'],
    },

    // ==================== ATAQUE Y ALCANCE DE ARQUEROS ====================
    {
      id: 'fletching',
      line: 'arch-atk',
      tier: 1,
      age: 'Edad Feudal',
      official: 'Emplumado de flechas',
      plain: 'Mejora 1 de ataque de arqueros',
      bonus: '+1 ataque y +1 alcance (arqueros, hostigadores, galeras y torres)',
      detail: 'Primera mejora de ataque y alcance para unidades a distancia.',
      aliases: ['Emplumado de flechas', 'Emplumar flechas', 'Emplumado', 'Fletching'],
    },
    {
      id: 'bodkin_arrow',
      line: 'arch-atk',
      tier: 2,
      age: 'Edad de los Castillos',
      official: 'Flecha de punzón',
      plain: 'Mejora 2 de ataque de arqueros',
      bonus: '+1 ataque y +1 alcance (+2/+2 total · unidades a distancia y edificios)',
      detail: 'Segunda mejora de ataque y alcance de arqueros. Prioridad inmediata al subir a Castillos.',
      aliases: ['Flecha de punzón', 'Flecha con punzón', 'Flecha de punzon', 'Punzones', 'Bodkin Arrow', 'Bodkin'],
    },
    {
      id: 'bracer',
      line: 'arch-atk',
      tier: 3,
      age: 'Edad Imperial',
      official: 'Brazalete',
      plain: 'Mejora 3 de ataque de arqueros',
      bonus: '+1 ataque y +1 alcance (+3/+3 total · unidades a distancia y edificios)',
      detail: 'Última mejora de ataque y alcance de arqueros en Herrería.',
      aliases: ['Brazalete de cuero', 'Brazalete', 'Brazal', 'Bracer'],
    },

    // ==================== ARMADURA DE CABALLERÍA ====================
    {
      id: 'scale_barding',
      line: 'cav-arm',
      tier: 1,
      age: 'Edad Feudal',
      official: 'Barda de escamas',
      plain: 'Mejora 1 de defensa de caballería',
      bonus: '+1 armadura cuerpo a cuerpo y +1 antiproyectil (caballería)',
      detail: 'Primera mejora de armadura para caballería (scouts, jinetes, camellos).',
      aliases: ['Armadura de láminas para caballería', 'Armadura de laminas para caballeria', 'Barda de escamas', 'Scale Barding Armor'],
    },
    {
      id: 'chain_barding',
      line: 'cav-arm',
      tier: 2,
      age: 'Edad de los Castillos',
      official: 'Barda de malla',
      plain: 'Mejora 2 de defensa de caballería',
      bonus: '+1/+1 armadura (+2/+2 total · caballería)',
      detail: 'Segunda mejora de armadura para caballería. Clave contra flechas y centros urbanos.',
      aliases: ['Cota de malla para caballería', 'Cota de mallas para caballería', 'Cota de malla para caballeria', 'Barda de malla', 'Chain Barding Armor'],
    },
    {
      id: 'plate_barding',
      line: 'cav-arm',
      tier: 3,
      age: 'Edad Imperial',
      official: 'Barda de placas',
      plain: 'Mejora 3 de defensa de caballería',
      bonus: '+1 cuerpo a cuerpo y +2 antiproyectil (+3/+4 total · caballería)',
      detail: 'Última mejora de armadura de caballería en Herrería.',
      aliases: ['Armadura de placas para caballería', 'Armadura de placas para caballeria', 'Barda de placas', 'Plate Barding Armor'],
    },

    // ==================== ARMADURA DE INFANTERÍA ====================
    {
      id: 'scale_mail',
      line: 'inf-arm',
      tier: 1,
      age: 'Edad Feudal',
      official: 'Cota de escamas',
      plain: 'Mejora 1 de defensa de infantería',
      bonus: '+1 armadura cuerpo a cuerpo y +1 antiproyectil (infantería)',
      detail: 'Primera mejora de armadura para infantería (hombres de armas, piqueros, águilas).',
      aliases: ['Armadura de láminas para infantería', 'Armadura de laminas para infanteria', 'Cota de escamas', 'Armadura de láminas', 'Scale Mail Armor'],
    },
    {
      id: 'chain_mail',
      line: 'inf-arm',
      tier: 2,
      age: 'Edad de los Castillos',
      official: 'Cota de malla',
      plain: 'Mejora 2 de defensa de infantería',
      bonus: '+1/+1 armadura (+2/+2 total · infantería)',
      detail: 'Segunda mejora de armadura para infantería.',
      aliases: ['Cota de malla para infantería', 'Cota de mallas para infantería', 'Cota de malla para infanteria', 'Cota de malla', 'Chain Mail Armor'],
    },
    {
      id: 'plate_mail',
      line: 'inf-arm',
      tier: 3,
      age: 'Edad Imperial',
      official: 'Armadura de placas',
      plain: 'Mejora 3 de defensa de infantería',
      bonus: '+1 cuerpo a cuerpo y +2 antiproyectil (+3/+4 total · infantería)',
      detail: 'Última mejora de armadura para infantería en Herrería.',
      aliases: ['Armadura de placas para infantería', 'Armadura de placas para infanteria', 'Armadura de placas de malla', 'Armadura de placas', 'Plate Mail Armor'],
    },

    // ==================== ARMADURA DE ARQUEROS ====================
    {
      id: 'padded_archer',
      line: 'arch-arm',
      tier: 1,
      age: 'Edad Feudal',
      official: 'Armadura acolchada para arqueros',
      plain: 'Mejora 1 de defensa de arqueros',
      bonus: '+1 armadura cuerpo a cuerpo y +1 antiproyectil (arqueros y pólvora)',
      detail: 'Primera mejora de armadura para arqueros, hostigadores, arqueros a caballo y artilleros.',
      aliases: ['Armadura acolchada para arqueros', 'Armadura de arquero acolchada', 'Padded Archer Armor'],
    },
    {
      id: 'leather_archer',
      line: 'arch-arm',
      tier: 2,
      age: 'Edad de los Castillos',
      official: 'Armadura de cuero para arqueros',
      plain: 'Mejora 2 de defensa de arqueros',
      bonus: '+1/+1 armadura (+2/+2 total · arqueros y pólvora)',
      detail: 'Segunda mejora de armadura para unidades a distancia.',
      aliases: ['Armadura de cuero para arqueros', 'Armadura de arquero de cuero', 'Leather Archer Armor'],
    },
    {
      id: 'ring_archer',
      line: 'arch-arm',
      tier: 3,
      age: 'Edad Imperial',
      official: 'Armadura de anillas para arqueros',
      plain: 'Mejora 3 de defensa de arqueros',
      bonus: '+1 cuerpo a cuerpo y +2 antiproyectil (+3/+4 total · arqueros y pólvora)',
      detail: 'Última mejora de armadura para unidades a distancia en Herrería.',
      aliases: ['Armadura de anillas para arqueros', 'Armadura de anillas de arquero', 'Armadura de arquero de anillas', 'Ring Archer Armor'],
    },
  ];

  const BY_ID = new Map(TECHS.map((t) => [t.id, t]));
  const ALIAS_MAP = new Map();
  const ALL_ALIASES = [];

  for (const tech of TECHS) {
    for (const alias of tech.aliases) {
      const key = alias.toLowerCase();
      if (!ALIAS_MAP.has(key)) {
        ALIAS_MAP.set(key, tech);
        ALL_ALIASES.push(alias);
      }
    }
  }

  // Sort longest first so multi-word names ALWAYS win over shorter prefixes
  ALL_ALIASES.sort((a, b) => b.length - a.length);

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Unicode-aware word boundaries + negative lookbehind protecting "Arquero(s) emplumado(s)"
  const MATCH_REGEX = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${ALL_ALIASES.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );

  function isFalsePositive(fullText, matchIndex, matchedText) {
    const low = matchedText.toLowerCase();
    // Protect "Arquero emplumado" / "Arqueros emplumados" (Plumed Archer unit)
    if (low === 'emplumado') {
      const before = fullText.slice(Math.max(0, matchIndex - 16), matchIndex).toLowerCase();
      if (/arqueros?\s+$/.test(before)) return true;
    }
    // Protect "Puntería Forjada" or "forja" verb only if lowercase verb context ("se forja")
    if (low === 'forja') {
      const before = fullText.slice(Math.max(0, matchIndex - 10), matchIndex).toLowerCase();
      if (/\b(se|la)\s+$/.test(before) && matchedText[0] === 'f') return true;
    }
    return false;
  }

  function lookupTech(text) {
    if (!text) return null;
    return ALIAS_MAP.get(String(text).trim().toLowerCase()) || null;
  }

  function enhanceHtmlString(html) {
    if (!html || typeof html !== 'string') return html;
    // Only transform text outside HTML tags
    return html.replace(/(<[^>]+>)|([^<]+)/g, (seg, tag, txt) => {
      if (tag || !txt) return seg;
      MATCH_REGEX.lastIndex = 0;
      return txt.replace(MATCH_REGEX, (m, _g1, offset) => {
        if (isFalsePositive(txt, offset, m)) return m;
        const tech = lookupTech(m);
        if (!tech) return m;
        return `<span class="bs-tech is-${tech.line}" data-bs-id="${tech.id}" tabindex="0">${m}</span>`;
      });
    });
  }

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'SVG', 'TITLE', 'CODE', 'PRE', 'NOSCRIPT',
  ]);

  function isSkippedElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.id === 'bsTechTooltip') return true;
    if (el.classList && (el.classList.contains('bs-tech') || el.classList.contains('bs-tooltip'))) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function hasSkippedAncestor(node) {
    let cur = node && node.nodeType === 1 ? node : node?.parentElement;
    while (cur) {
      if (isSkippedElement(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function enhanceNode(rootEl) {
    if (typeof document === 'undefined' || !rootEl) return 0;
    if (hasSkippedAncestor(rootEl)) return 0;
    const walker = document.createTreeWalker(
      rootEl,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === 1) {
            return isSkippedElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
          }
          const val = node.nodeValue;
          return val && val.length >= 5 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      },
    );
    const candidates = [];
    let n;
    while ((n = walker.nextNode())) {
      const val = n.nodeValue;
      MATCH_REGEX.lastIndex = 0;
      if (MATCH_REGEX.test(val)) candidates.push(n);
    }

    let replacedCount = 0;
    for (const textNode of candidates) {
      const text = textNode.nodeValue || '';
      MATCH_REGEX.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let matchedAny = false;
      let m;
      while ((m = MATCH_REGEX.exec(text)) !== null) {
        const hit = m[0];
        const idx = m.index;
        if (isFalsePositive(text, idx, hit)) continue;
        const tech = lookupTech(hit);
        if (!tech) continue;
        if (idx > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        const span = document.createElement('span');
        span.className = `bs-tech is-${tech.line}`;
        span.dataset.bsId = tech.id;
        span.setAttribute('tabindex', '0');
        span.setAttribute('aria-label', `${hit}: ${tech.plain} (${tech.bonus})`);
        span.textContent = hit;
        frag.appendChild(span);
        lastIdx = idx + hit.length;
        matchedAny = true;
        replacedCount += 1;
      }
      if (matchedAny && textNode.parentNode) {
        if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        textNode.parentNode.replaceChild(frag, textNode);
      }
    }
    return replacedCount;
  }

  // ==================== FLOATING HOVER / FOCUS TOOLTIP ====================
  let tooltipEl = null;
  let activeTrigger = null;

  function ensureTooltip() {
    if (typeof document === 'undefined') return null;
    if (tooltipEl && document.body.contains(tooltipEl)) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'bsTechTooltip';
    tooltipEl.className = 'bs-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(triggerEl) {
    if (!triggerEl) return;
    const tech = BY_ID.get(triggerEl.dataset.bsId);
    if (!tech) return;
    const tip = ensureTooltip();
    if (!tip) return;
    activeTrigger = triggerEl;

    tip.className = `bs-tooltip is-${tech.line} is-visible`;
    tip.hidden = false;
    tip.innerHTML = `<div class="bs-tip-layout">
      <div class="bs-tip-icon-frame">
        <img class="bs-tip-icon" src="assets/icons/blacksmith/${tech.id}.png" alt="${tech.official}" width="44" height="44" draggable="false" />
      </div>
      <div class="bs-tip-body">
        <div class="bs-tip-head">
          <span class="bs-tip-kicker">Herrería · Nivel ${tech.tier}/3</span>
          <span class="bs-tip-age">${tech.age}</span>
        </div>
        <strong class="bs-tip-plain">${tech.plain}</strong>
        <div class="bs-tip-bonus">${tech.bonus}</div>
        <div class="bs-tip-official">En el juego: <b>${tech.official}</b></div>
      </div>
    </div>`;

    // Position smartly inside viewport bounds (CSP-safe CSSOM properties)
    const rect = triggerEl.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const margin = 10;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
    left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));

    let top = rect.top - tipRect.height - 9;
    let placedBelow = false;
    if (top < margin) {
      top = rect.bottom + 9;
      placedBelow = true;
    }
    tip.classList.toggle('is-below', placedBelow);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function hideTooltip() {
    activeTrigger = null;
    if (tooltipEl) {
      tooltipEl.classList.remove('is-visible');
      tooltipEl.hidden = true;
    }
  }

  let observerInstalled = false;
  let pendingRaf = null;
  let suppressMutations = false;
  let activeObserver = null;
  const pendingRoots = new Set();

  function installGlobalWatcher() {
    if (typeof document === 'undefined' || observerInstalled) return;
    observerInstalled = true;

    const flush = () => {
      pendingRaf = null;
      const rawNodes = [...pendingRoots].filter((n) => n && (n === document.body || document.body.contains(n)));
      pendingRoots.clear();
      if (!rawNodes.length) return;
      // Deduplicar subárboles anidados: si un ancestro ya está en la cola, no re-escanear hijos.
      const deduped = rawNodes.filter((node, idx) => {
        for (let i = 0; i < rawNodes.length; i += 1) {
          if (i !== idx && rawNodes[i].contains(node)) return false;
        }
        return true;
      });
      suppressMutations = true;
      try {
        for (const node of deduped) {
          enhanceNode(node);
        }
      } finally {
        if (activeObserver && typeof activeObserver.takeRecords === 'function') {
          activeObserver.takeRecords();
        }
        suppressMutations = false;
      }
    };

    const schedule = (node) => {
      if (!node || isSkippedElement(node)) return;
      pendingRoots.add(node);
      if (!pendingRaf) {
        pendingRaf = (typeof requestAnimationFrame === 'function')
          ? requestAnimationFrame(flush)
          : setTimeout(flush, 16);
      }
    };

    // Initial full scan
    if (document.body) {
      suppressMutations = true;
      try { enhanceNode(document.body); } finally { suppressMutations = false; }
    }

    // Watch all dynamic renders across Central, Postmatch, Entrenamiento, Prematch, Batalla, Modals, Overlay
    if (typeof MutationObserver === 'function' && document.body) {
      const mo = new MutationObserver((mutations) => {
        if (suppressMutations) return;
        for (const mut of mutations) {
          if (mut.type === 'characterData') {
            if (mut.target?.parentElement) schedule(mut.target.parentElement);
          } else if (mut.type === 'childList' && mut.addedNodes.length) {
            for (const added of mut.addedNodes) {
              if (added.nodeType === 1) schedule(added);
              else if (added.nodeType === 3 && added.parentElement) schedule(added.parentElement);
            }
          }
        }
      });
      activeObserver = mo;
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    // Delegated hover & keyboard focus events
    document.addEventListener('pointerover', (ev) => {
      const el = ev.target?.closest?.('.bs-tech[data-bs-id]');
      if (el && el !== activeTrigger) showTooltip(el);
    });
    document.addEventListener('pointerout', (ev) => {
      if (!activeTrigger) return;
      const leaving = ev.target?.closest?.('.bs-tech[data-bs-id]');
      if (leaving && !leaving.contains(ev.relatedTarget)) hideTooltip();
    });
    document.addEventListener('focusin', (ev) => {
      const el = ev.target?.closest?.('.bs-tech[data-bs-id]');
      if (el) showTooltip(el);
    });
    document.addEventListener('focusout', (ev) => {
      if (activeTrigger && ev.target?.closest?.('.bs-tech[data-bs-id]') === activeTrigger) hideTooltip();
    });
    document.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installGlobalWatcher, { once: true });
    } else {
      installGlobalWatcher();
    }
  }

  const api = {
    TECHS,
    BY_ID,
    lookupTech,
    enhanceHtmlString,
    enhanceNode,
    installGlobalWatcher,
    showTooltip,
    hideTooltip,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BlacksmithTerms = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
