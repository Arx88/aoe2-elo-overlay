'use strict';

// A shared replay bookmark, not a simulation of what the queues produced.
const VERSION = 'castles-command-window-v1';
const AGE_ORDER_DEFINITION = 'first-age-research-command-game-seconds-v1';
const supportedMap = (value) => typeof value === 'string' && /^(Arabia|Runestones|Arena)$/i.test(value);
const LINES = {
  scout: { label: 'Scouts', singular: 'Scout', ids: [448, 37] },
  archer: { label: 'Arqueros', singular: 'Arquero', ids: [4] },
  militia: { label: 'Milicia / M@A', singular: 'Milicia / M@A', ids: [74, 75] },
  spear: { label: 'Lanceros', singular: 'Lancero', ids: [93] },
  skirm: { label: 'Guerrilleros', singular: 'Guerrillero', ids: [7] },
  knight: { label: 'Caballeros', singular: 'Caballero', ids: [38] },
  monk: { label: 'Monjes', singular: 'Monje', ids: [125] },
  villager: { label: 'Aldeanos', ids: [83, 293] },
};
const keys = Object.keys(LINES);
const byId = new Map(Object.entries(LINES).flatMap(([key, line]) => line.ids.map((id) => [id, key])));
const zero = () => Object.fromEntries(keys.map((key) => [key, 0]));
const validTime = (ms) => Number.isSafeInteger(ms) && ms >= 0 && ms <= 86_400_000;

function observeQueue(events, type, payload, ms) {
  if (type !== 'DeQueue' || !validTime(ms)) return;
  const key = byId.get(payload.unit_id);
  if (key && Number.isSafeInteger(payload.amount) && payload.amount > 0 && payload.amount <= 256) {
    events.push({ key, amount: payload.amount, ms });
  }
}

function counts(events, start, end) {
  const result = zero();
  for (const event of events) {
    if (event.ms >= start && event.ms < end) result[event.key] += event.amount;
  }
  return result;
}

function collectCastlesWindow({ self, rival, replayEndMs }) {
  if (!self || !rival || !validTime(replayEndMs)) return null;
  const hasCastle = (p) => validTime(p.castleMs) && p.castleMs > p.feudalMs && p.castleMs < replayEndMs;
  if (![self, rival].every((p) => validTime(p.feudalMs) && p.queues.length &&
      (p.castleMs == null || hasCastle(p)))) return null;
  const ageOrders = [self, rival].filter(hasCastle).map((p) => p.castleMs);
  if (!ageOrders.length) return null;
  const cutoffMs = Math.min(...ageOrders);
  // A comparable pre-Castle window requires both players to have ordered Feudal.
  if (cutoffMs <= Math.max(self.feudalMs, rival.feudalMs)) return null;
  const side = (p) => ({
    feudalMs: p.feudalMs,
    castleMs: p.castleMs ?? null,
    beforeCut: counts(p.queues, 0, cutoffMs),
  });
  const later = self.castleMs > cutoffMs ? 'self' : rival.castleMs > cutoffMs ? 'rival' : null;
  const laterPlayer = later === 'self' ? self : later === 'rival' ? rival : null;
  return {
    version: VERSION, cutoffMs, rivalProfileId: rival.profileId,
    self: side(self), rival: side(rival),
    between: laterPlayer ? { side: later, orders: counts(laterPlayer.queues, cutoffMs, laterPlayer.castleMs) } : null,
  };
}

function normalizeCounts(value) {
  if (!value || typeof value !== 'object') return null;
  if (!keys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 20_000)) return null;
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function normalizeCastlesWindow(raw, telemetry) {
  if (!raw || raw.version !== VERSION || telemetry.context.leaderboardId !== 3 ||
      !supportedMap(telemetry.context.mapName) || telemetry.source.type !== 'replay-analysis' ||
      telemetry.context.startingAge !== 'dark' || !Number.isFinite(telemetry.durationSeconds) ||
      telemetry.durationSeconds <= 0 || !validTime(raw.cutoffMs) ||
      !Number.isSafeInteger(raw.rivalProfileId) || raw.rivalProfileId <= 0 ||
      raw.rivalProfileId === telemetry.profileId) return null;
  const normalizeSide = (side) => {
    if (!side || !validTime(side.feudalMs) || side.feudalMs >= raw.cutoffMs) return null;
    const castleMs = side.castleMs;
    if (castleMs !== null && (!validTime(castleMs) || castleMs < raw.cutoffMs ||
        castleMs > telemetry.durationSeconds * 1000 + 500)) return null;
    const beforeCut = normalizeCounts(side.beforeCut);
    return beforeCut ? { feudalMs: side.feudalMs, castleMs, beforeCut } : null;
  };
  const self = normalizeSide(raw.self);
  const rival = normalizeSide(raw.rival);
  if (!self || !rival || (self.castleMs !== raw.cutoffMs && rival.castleMs !== raw.cutoffMs)) return null;
  const { castleClickSeconds, feudalClickSeconds } = telemetry.metrics;
  if (feudalClickSeconds?.definition !== AGE_ORDER_DEFINITION ||
      (castleClickSeconds && castleClickSeconds.definition !== AGE_ORDER_DEFINITION)) return null;
  const ownCastleMetric = castleClickSeconds?.value;
  const ownFeudalMetric = feudalClickSeconds?.value;
  if (ownFeudalMetric == null || Math.abs(ownFeudalMetric * 1000 - self.feudalMs) > 51) return null;
  if ((ownCastleMetric == null) !== (self.castleMs == null) ||
      (ownCastleMetric != null && Math.abs(ownCastleMetric * 1000 - self.castleMs) > 51)) return null;
  const later = self.castleMs > raw.cutoffMs ? 'self' : rival.castleMs > raw.cutoffMs ? 'rival' : null;
  const orders = later && raw.between?.side === later ? normalizeCounts(raw.between.orders) : null;
  if (later && !orders) return null;
  return { version: VERSION, cutoffMs: raw.cutoffMs, rivalProfileId: raw.rivalProfileId, self, rival,
    between: later ? { side: later, orders } : null };
}

function presentCastlesWindow(telemetry, match) {
  const window = telemetry?.castlesWindow;
  if (!window || !Array.isArray(match?.players) || match.players.length !== 2) return null;
  const own = match.players.find((p) => Number(p.profileId) === telemetry.profileId);
  const opponent = match.players.find((p) => Number(p.profileId) === window.rivalProfileId);
  if (!own || !opponent) return null;
  const describe = (counts) => ({
    villagers: counts.villager,
    military: keys.filter((key) => key !== 'villager' && counts[key] > 0)
      .map((key) => ({ key, label: counts[key] === 1 ? LINES[key].singular : LINES[key].label, count: counts[key] }))
      .sort((a, b) => b.count - a.count),
  });
  const side = (row, p) => ({ civ: p.civ, castleMs: row.castleMs, ...describe(row.beforeCut) });
  return {
    cutoffMs: window.cutoffMs,
    self: side(window.self, own),
    rival: side(window.rival, opponent),
    between: window.between ? { side: window.between.side, ...describe(window.between.orders) } : null,
  };
}

module.exports = { observeQueue, collectCastlesWindow, normalizeCastlesWindow, presentCastlesWindow, supportedMap };
