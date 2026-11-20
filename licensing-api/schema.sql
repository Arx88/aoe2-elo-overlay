-- AoE2 Helper · Esquema de licencias y control de acceso (Cloudflare D1)

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  profile_id INTEGER UNIQUE DEFAULT NULL,
  alias TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'promax')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  expires_at INTEGER DEFAULT NULL,
  max_devices INTEGER NOT NULL DEFAULT 2,
  notes TEXT NOT NULL DEFAULT '',
  last_seen_at INTEGER DEFAULT NULL,
  last_version TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_devices (
  account_id TEXT NOT NULL,
  machine_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, machine_hash),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id TEXT DEFAULT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
  ('paywall_enabled', '1', unixepoch()),
  ('offline_grace_hours', '48', unixepoch());

CREATE INDEX IF NOT EXISTS idx_accounts_profile ON accounts(profile_id);
CREATE INDEX IF NOT EXISTS idx_accounts_plan ON accounts(plan, enabled);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
