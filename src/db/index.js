const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "ledger.db");
const raw = new DatabaseSync(DB_PATH);
raw.exec("PRAGMA journal_mode = WAL");
raw.exec("PRAGMA foreign_keys = ON");

raw.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT '$',
    pin_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, person_id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    paid_by TEXT NOT NULL REFERENCES people(id),
    split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'exact', 'percentage', 'shares')),
    category TEXT NOT NULL DEFAULT 'general',
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'costco-split')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id),
    share_cents INTEGER NOT NULL,
    PRIMARY KEY (expense_id, person_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_person TEXT NOT NULL REFERENCES people(id),
    to_person TEXT NOT NULL REFERENCES people(id),
    amount_cents INTEGER NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_payments_group ON payments(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
`);

// node:sqlite's DatabaseSync has no .transaction() helper like better-sqlite3;
// this wraps a function in BEGIN/COMMIT with ROLLBACK on error.
function transaction(fn) {
  return (...args) => {
    raw.exec("BEGIN");
    try {
      const result = fn(...args);
      raw.exec("COMMIT");
      return result;
    } catch (err) {
      raw.exec("ROLLBACK");
      throw err;
    }
  };
}

// Thin wrapper matching the subset of the better-sqlite3 API this project uses,
// so route code reads the same regardless of which driver is underneath.
const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => {
    const stmt = raw.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
    };
  },
  transaction,
};

module.exports = db;
