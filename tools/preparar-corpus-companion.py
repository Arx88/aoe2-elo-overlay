from pathlib import Path
import pandas as pd

root = Path.cwd()
columns = ['matchId', 'started', 'finished', 'leaderboard', 'map', 'mod', 'patch',
           'profileId', 'rating', 'status', 'civ', 'team', 'gameVariant', 'civilizationSet']
paths = sorted(root.glob('match-2026-11-*.parquet'))
assert len(paths) == 8
raw = pd.concat([pd.read_parquet(path, columns=columns) for path in paths], ignore_index=True)
pc = raw[(raw.leaderboard == 'rm_1v1') & (raw.status == 'player') &
         (raw.gameVariant == 'de') & (raw.civilizationSet == 'aoe2') & (raw['mod'] == False)].copy()
match_fields = ['matchId', 'started', 'finished', 'map', 'patch']
matching = pc.drop_duplicates(subset=match_fields)
matching = matching[~matching.matchId.duplicated(keep=False) & matching.finished.notna() & matching.started.notna()].copy()
players = pc[['matchId', 'profileId', 'civ', 'rating']].drop_duplicates()
# Civ IDs in this normalization are stable local identifiers for the source's slugs.
players['civ_id'] = pd.Categorical(players.civ).codes + 1
players.loc[players.civ.isna(), 'civ_id'] = None
players.rename(columns={'matchId':'match_id', 'profileId':'profile_id', 'rating':'old_rating'}, inplace=True)
matches = pd.DataFrame({'match_id': matching.matchId, 'ladder': '1v1', 'num_players': 2,
                        'map': matching['map'].str.removeprefix('rm_'),
                        'start_time': matching.started.astype('datetime64[s, UTC]').astype('int64'),
                        'completion_time': matching.finished.astype('datetime64[s, UTC]').astype('int64'),
                        'patch': matching.patch})
matches.to_parquet(root / 'benchmark-companion-matches.parquet', index=False)
players.to_parquet(root / 'benchmark-companion-players.parquet', index=False)
print(f'{len(raw):,} filas leídas de 8 archivos. {len(matches):,} partidas candidatas.')
