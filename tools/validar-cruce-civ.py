"""Evaluate whether exact opponent-civ history improves 1v1 outcome estimates."""
import heapq
import json
import math
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
raw = pd.concat([pd.read_parquet(path, columns=['matchId', 'profileId', 'status', 'won', 'leaderboard'])
                 for path in sorted(ROOT.glob('match-2026-11-*.parquet'))], ignore_index=True)
results = raw[(raw.status == 'player') & (raw.leaderboard == 'rm_1v1')][['matchId','profileId','won']]
results = results.dropna().drop_duplicates()
results = results[~results.duplicated(['matchId','profileId'], keep=False)]
results.columns = ['match_id','profile_id','won']
matches = pd.read_parquet(ROOT / 'benchmark-companion-matches.parquet')
players = pd.read_parquet(ROOT / 'benchmark-companion-players.parquet').merge(
    results, on=['match_id','profile_id'], validate='many_to_one')
players = players.dropna(subset=['civ','old_rating','profile_id'])
players = players[players.old_rating > 0]
players = players[~players.duplicated(['match_id','profile_id'], keep=False)]
players = players[players.match_id.map(players.match_id.value_counts()) == 2]
joined = players.merge(players, on='match_id', suffixes=('', '_op'))
joined = joined[(joined.profile_id != joined.profile_id_op) & (joined.won != joined.won_op)]
joined = joined.merge(matches, on='match_id', validate='many_to_one').sort_values('start_time')
fields = ['start_time','completion_time','map','patch','profile_id','civ','civ_op','old_rating','old_rating_op','won']
cutoff = int(joined.start_time.quantile(.7))
personal = defaultdict(lambda: [0, 0.])
exact = defaultdict(lambda: [0, 0.])
pending = []
slices = defaultdict(lambda: [0, 0, 0., 0., 0., 0.])

def logloss(p, outcome):
    return -math.log(p if outcome else 1-p)

for seq, row in enumerate(joined[fields].itertuples(index=False, name=None)):
    start, finish, map_name, patch, profile, own, opposing, rating, other_rating, won = row
    while pending and pending[0][0] < start:
        _, _, k, cross, residual = heapq.heappop(pending)
        for cell in (personal[k], exact[cross]):
            cell[0] += 1
            cell[1] += residual
    k = (profile, patch, map_name, own)
    cross = (k, opposing)
    expected = 1 / (1 + 10 ** ((rating - other_rating) / 400))
    lost = 1 - int(won)
    all_n, all_error = personal[k]
    n, error = exact[cross]
    other_n = all_n - n
    if start >= cutoff:
        for name in ('total', map_name) if map_name in ('arabia','arena') else ('total',):
            cell = slices[name]
            cell[0] += 1
            if n >= 6 and other_n >= 20:
                reference = (all_error - error) / (other_n + 12)
                base = min(.98, max(.02, expected + reference))
                candidate = min(.98, max(.02, expected + (error + 12 * reference) / (n + 12)))
                cell[1] += 1
                cell[2] += logloss(base, lost)
                cell[3] += logloss(candidate, lost)
                if candidate - base >= .075:
                    cell[4] += 1
                    cell[5] += lost - base
    heapq.heappush(pending, (finish+600, seq, k, cross, lost-expected))

report = {}
for name, (total, eligible, base, candidate, alerts, residual) in slices.items():
    report[name] = {'predictions': total, 'eligible': eligible,
                    'coveragePct': round(100 * eligible / total, 3),
                    'baselineLogLoss': round(base / eligible, 4) if eligible else None,
                    'exactLogLoss': round(candidate / eligible, 4) if eligible else None,
                    'alerts': int(alerts),
                    'observedAboveBaselinePct': round(100 * residual / alerts, 2) if alerts else None}
(ROOT / 'resultado-cruce-civ-noviembre.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
