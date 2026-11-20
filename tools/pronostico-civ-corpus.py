import gzip
import heapq
import json
import math
import sys
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODELS = ('poblacion', 'ultima_civ', 'historial', 'reciente_y_mapa')
ELAPSED = 24 * 3600
PUBLICATION_LAG = 10 * 60
K = 12
SOURCE = 'companion' if '--companion' in sys.argv else 'world'
SUFFIX = '-noviembre' if SOURCE == 'companion' else ''

def iso(timestamp):
    return datetime.fromtimestamp(int(timestamp), timezone.utc).isoformat()

def census():
    matches = pd.read_parquet(ROOT / f'benchmark-{SOURCE}-matches.parquet')
    players = pd.read_parquet(ROOT / f'benchmark-{SOURCE}-players.parquet',
                              columns=['match_id', 'profile_id', 'civ_id', 'civ', 'old_rating'])
    eligible = matches[(matches.ladder == '1v1') & (matches.num_players == 2)].copy()
    assert eligible.match_id.is_unique
    joined = eligible.merge(players, on='match_id', how='left', validate='one_to_many')
    valid = joined[['civ_id', 'civ', 'profile_id', 'old_rating', 'map', 'patch']].notna().all(axis=1)
    valid &= (joined.start_time > 0) & (joined.completion_time >= joined.start_time) & (joined.old_rating > 0)
    clean = joined[valid].copy()
    clean = clean[~clean.duplicated(['match_id', 'profile_id'], keep=False)]
    counts = clean.groupby('match_id').size()
    clean = clean[clean.match_id.isin(counts[counts == 2].index)]
    clean['band'] = (clean.old_rating // 200).astype(int) * 200
    clean.sort_values(['start_time', 'match_id', 'profile_id'], inplace=True)
    scope = {'sourceMatches': len(matches), 'sourcePlayerRows': len(players),
             'ranked1v1Matches': len(eligible), 'usableMatches': clean.match_id.nunique(),
             'excludedRanked1v1Matches': len(eligible) - clean.match_id.nunique()}
    return clean, scope

def rating_band(rating):
    return int(rating)

def main():
    data, scope = census()
    universe = sorted(set(int(value) for value in data.civ_id))
    indexes = {value: index for index, value in enumerate(universe)}
    names = data.groupby('civ_id').civ.agg(lambda names: names.mode().iat[0]).to_dict()
    size = len(universe)
    starts = data.start_time.to_numpy()
    first, second = (int(starts[int(len(starts) * fraction)]) for fraction in (0.7, 0.85))
    counts = lambda: np.zeros(size, dtype=np.int32)
    general = defaultdict(counts)
    maps = defaultdict(counts)
    contexts = defaultdict(counts)
    profile = defaultdict(counts)
    profile_map = defaultdict(counts)
    recent = defaultdict(deque)
    unlocked = np.zeros(size, dtype=bool)
    completed = defaultdict(int)
    pending = []
    tables = defaultdict(lambda: np.zeros((len(MODELS), 4), dtype=float))
    sequence = 0
    evaluated = 0
    selected_maps = {'arabia', 'arena'}
    fields = ['match_id','start_time','completion_time','map','patch','profile_id','civ_id','band']

    def record(labels, predictions, actual):
        values = []
        for probabilities in predictions:
            top = np.argsort(-probabilities, kind='stable')[:3]
            correct = actual == top[0] and probabilities[top[0]] > 0
            contained = actual in top and probabilities[actual] > 0
            loss = -math.log(max(float(probabilities[actual]), 1e-8))
            values.append((1, int(correct), int(contained), loss))
        for label in labels:
            tables[label] += values

    with gzip.open(ROOT / f'pronosticos-civ-por-partida{SUFFIX}.jsonl.gz', 'wt', encoding='utf-8') as audit:
        for match, start, finish, map_name, patch, player, civ, band in data[fields].itertuples(index=False, name=None):
            idx = indexes[int(civ)]
            band = rating_band(band)
            while pending and pending[0][0] < start:
                available, _, old_map, old_patch, old_player, old_band, old_idx = heapq.heappop(pending)
                unlocked[old_idx] = True
                general[old_patch][old_idx] += 1
                maps[old_patch, old_map][old_idx] += 1
                contexts[old_patch, old_map, old_band][old_idx] += 1
                profile[old_player][old_idx] += 1
                profile_map[old_player, old_map][old_idx] += 1
                completed[old_player] += 1
                recent[old_player].appendleft((available, old_map, old_idx))
                if len(recent[old_player]) > 30:
                    recent[old_player].pop()

            if start >= first:
                assert unlocked.any()
                personal = profile[player]
                in_map = profile_map[player, map_name]
                g = general[patch] + unlocked
                general_prior = g / g.sum()
                m = maps[patch, map_name]
                map_prior = (m + 80 * general_prior) / (m.sum() + 80)
                specific = contexts[patch, map_name, band]
                base = (specific + 100 * map_prior) / (specific.sum() + 100)
                history = (personal + K * base) / (completed[player] + K)
                queue = recent[player]
                if queue:
                    latest = 0.40 * base.copy()
                    latest[queue[0][2]] += 0.60
                    weighted = np.zeros(size)
                    for available, prev_map, ci in queue:
                        days = (start - available) / ELAPSED
                        weighted[ci] += 2 ** (-days / 30) * (2 if prev_map == map_name else 1)
                    candidate = (weighted + in_map * 0.15 + K * history) / (
                        weighted.sum() + in_map.sum() * 0.15 + K)
                else:
                    latest = candidate = base
                block = '1' if start < second else '2'
                budget = completed[player]
                support = '0' if budget == 0 else '1-9' if budget < 10 else '10+'
                labels = ['total', f'bloque_{block}', f'historial_{support}',
                          f'elo_{band}' if 600 <= band <= 2200 else 'elo_otro']
                if map_name in selected_maps:
                    labels.append(map_name)
                predictions = [base, latest, history, candidate]
                record(labels, predictions, idx)
                row = [int(match), int(player), int(start), map_name, int(band), int(civ), budget, block]
                row.extend([[int(universe[i]) for i in np.argsort(-p, kind='stable')[:3] if p[i] > 0]
                            for p in predictions])
                audit.write(json.dumps(row, separators=(',', ':')) + '\n')
                evaluated += 1

            sequence += 1
            heapq.heappush(pending, (finish + PUBLICATION_LAG, sequence, map_name, patch, player, band, idx))

    def stats(row):
        n, top1, top3, loss = row
        return {'n': int(n), 'top1': round(100 * top1 / n, 2), 'top3': round(100 * top3 / n, 2),
                'logLoss': round(loss / n, 4)}

    report = {'scope': scope, 'patches': sorted(int(x) for x in data.patch.unique()),
              'datesUtc': [iso(starts[0]), iso(starts[-1])],
              'temporalBlocksStartUtc': [iso(first), iso(second)], 'lagSeconds': PUBLICATION_LAG,
              'predictedPlayerSlots': evaluated, 'labelsById': names,
              'predictionColumns': ['match_id','profile_id','start_time','map','eloBand','actualCiv',
                                    'completedPlayerHistory','block', *MODELS],
              'scores': {name: dict(zip(MODELS, map(stats, rows))) for name, rows in tables.items()}}
    (ROOT / f'resultado-civ-corpus{SUFFIX}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('scope', 'datesUtc', 'temporalBlocksStartUtc', 'predictedPlayerSlots')}, indent=2))
    print(json.dumps({name: report['scores'][name] for name in ('total', 'bloque_1', 'bloque_2', 'arabia', 'arena')}, indent=2))

if __name__ == '__main__':
    main()
