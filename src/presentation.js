'use strict';
const { allowsFeature } = require('./product');
const { opponentsOf } = require('./rival');

function projectOverlayState(state, product) {
  if (!state || allowsFeature(product, 'rosterDetails')) return state;
  const ids = new Set(opponentsOf(state, 16).map((p) => Number(p.profileId)));
  return { status: state.status, phase: state.phase, checkedAt: state.checkedAt,
    pending: state.pending, stale: state.stale, error: state.error, message: state.message,
    profileId: state.profileId, match: state.match ? { matchId: state.match.matchId, mapName: 'Rivales' } : null,
    players: (state.players || []).filter((p) => ids.has(Number(p.profileId))).map((p) => ({
      profileId: p.profileId, name: p.name, rating: p.rating, hasStats: p.hasStats,
      isYou: false, team: null,
    })) };
}

function projectRivalPayload(payload, product) {
  if (!payload || !Array.isArray(payload.reports)) return payload;
  if (!allowsFeature(product, 'rosterDetails')) {
    return { ts: payload.ts, reports: payload.reports.map((r) => ({
      profileId: r.profileId, name: r.name, h2h: allowsFeature(product, 'rivalH2H') && r.h2h
        ? Object.fromEntries(['games', 'wins', 'losses', 'scanned', 'asAllies', 'unresolved', 'error', 'unavailable', 'modePending', 'modeUnavailable']
          .filter((key) => r.h2h[key] !== undefined).map((key) => [key, r.h2h[key]])) : null,
      h2hPending: r.h2hPending, loading: r.loading,
    })) };
  }
  if (!allowsFeature(product, 'rivalOpenings')) return { ...payload, pendingOpenings: false,
    reports: payload.reports.map((r) => ({ ...r, openings: null, openingsPending: false, openingError: null })) };
  return payload;
}

function projectScoutPayload(payload, product) {
  if (!payload) return null;
  if (!allowsFeature(product, 'smartTips') && !allowsFeature(product, 'civRecommender')) return null;
  if (!allowsFeature(product, 'smartBuildOrder') && Array.isArray(payload.tips)) {
    return {
      ...payload,
      tips: payload.tips.map((t) => ({ ...t, opportunities: null, opportunityStages: null })),
    };
  }
  return payload;
}

module.exports = { projectOverlayState, projectRivalPayload, projectScoutPayload };
