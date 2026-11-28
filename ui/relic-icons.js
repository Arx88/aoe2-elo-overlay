'use strict';

(function exposeRelicIcons(root) {
  const base = Object.fromEntries(
    ('account age archer barracks berries blacksmith boar building castle clock combat crown eye food ' +
      'gunpowder history layout lock map market matchup medal move palette players postmatch-advice ' +
      'postmatch-focus relic replay scout search sheep shield stable stone sword target trend trophy ' +
      'update villager wood').split(' ').map((name) => [name, name + '.png']),
  );
  const custom = Object.fromEntries(
    'activity alert arena gold record resources tech-tree'.split(' ').map((name) => [name, 'relic/' + name + '.png']),
  );
  const files = Object.freeze({ ...base, ...custom,
    orders: 'relic/orders.png',
    settings: 'relic/settings.png',
    gift: 'relic/gift.png',
    scales: 'relic/scales.png',
    flag: 'relic/flag.png',
    up: 'relic/up.png',
    star: 'relic/star.png',
    list: 'relic/list.png',
    help: 'relic/help.png',
    copy: 'relic/copy.png',
    check: 'relic/check.png',
    'training-plan': 'relic/training-plan.png',
    'town-center': 'relic/town-center.png',
    'age-dark': 'ages/dark.png',
    'age-feudal': 'ages/feudal.png',
    'age-castle': 'ages/castle.png',
    'age-imperial': 'ages/imperial.png',
    'double-bit-axe': 'relic/double-bit-axe.png',
    'bow-saw': 'relic/bow-saw.png',
    wheelbarrow: 'relic/wheelbarrow.png',
  });

  const metricRoles = Object.freeze({
    tcIdleDarkSec: 'town-center',
    tcIdleFeudalPerTcSec: 'town-center',
    biggestTcGapSec: 'town-center',
    feudalSec: 'age-feudal',
    castleSec: 'age-castle',
    imperialSec: 'age-imperial',
    dbaDelaySec: 'double-bit-axe',
    bowSawDelaySec: 'bow-saw',
    wheelbarrowDelaySec: 'wheelbarrow',
    eapm: 'activity',
    tc_idle_dark: 'town-center',
    biggest_tc_gap: 'town-center',
    feudal_time: 'age-feudal',
    dba_delay: 'double-bit-axe',
    bow_saw: 'bow-saw',
    bow_saw_spot: 'bow-saw',
    market_wood_float: 'market',
    army_upgrades: 'blacksmith',
    control_micro: 'combat',
    town_bell: 'shield',
    late_closing: 'age-imperial',
    vs_target_elo: 'trophy',
    cold_start: 'activity',
    session_fatigue: 'activity',
  });

  function asset(name) {
    return Object.hasOwn(files, name) ? 'assets/icons/' + files[name] : '';
  }

  function metricAsset(key, fallback = '') {
    return Object.hasOwn(metricRoles, key) ? asset(metricRoles[key]) : fallback;
  }

  function ageRole(age) {
    return ['age-dark', 'age-feudal', 'age-castle', 'age-imperial'][Number(age) - 1] || 'age';
  }

  function icon(name, className = 'product-icon', width = null, height = width) {
    const src = asset(name);
    if (!src) return '';
    const dimensions = Number.isInteger(width) && Number.isInteger(height) ? ` width="${width}" height="${height}"` : '';
    return `<img class="${className}" src="${src}" data-relic-icon="${name}"${dimensions} alt="" draggable="false">`;
  }

  function dumbbell() {
    return icon('training-plan', 'train-pin-ico', 18);
  }

  function status(name, width = 14) {
    return icon(name, 'relic-status-icon', width);
  }

  function setStatusLabel(node, role, label = '') {
    if (!node) return;
    const src = asset(role);
    if (!src) {
      node.textContent = label;
      return;
    }
    const image = node.ownerDocument.createElement('img');
    image.className = 'relic-status-icon';
    image.dataset.relicIcon = role;
    image.src = src;
    image.alt = '';
    image.draggable = false;
    image.width = image.height = 14;
    node.replaceChildren(image, label);
  }

  const api = Object.freeze({ files, asset, metricAsset, ageRole, icon, dumbbell, status, setStatusLabel });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RelicIcons = api;
})(typeof globalThis === 'object' ? globalThis : this);
