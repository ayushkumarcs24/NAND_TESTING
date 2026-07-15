import * as SQLite from 'expo-sqlite';

// Open (or create) the local SQLite database
const db = SQLite.openDatabaseSync('nand_dairy.db');

/**
 * Initialize local SQLite tables for offline queuing.
 * Run this on app startup before any offline features are used.
 */
export function initLocalDB(): void {
  // Offline sync queue — stores operations that haven't been synced to Supabase yet
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id           TEXT PRIMARY KEY,
      entity_type  TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      operation    TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload      TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      synced       INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Local milk entry cache for offline entry
  db.execSync(`
    CREATE TABLE IF NOT EXISTS milk_entry_local (
      id               TEXT PRIMARY KEY,
      date             TEXT NOT NULL,
      shift            TEXT NOT NULL CHECK (shift IN ('morning', 'evening')),
      samiti_id        TEXT NOT NULL,
      vehicle_id       TEXT,
      quantity_litres  REAL NOT NULL,
      entered_by       TEXT NOT NULL,
      is_deleted       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      sync_status      TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed'))
    );
  `);

  // Local samiti cache (populated on first sync for offline use)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS samiti_local (
      id             TEXT PRIMARY KEY,
      code           TEXT NOT NULL,
      name           TEXT NOT NULL,
      village        TEXT NOT NULL,
      dairy_id       TEXT NOT NULL,
      delivery_mode  TEXT NOT NULL,
      active         INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Local vehicle cache
  db.execSync(`
    CREATE TABLE IF NOT EXISTS vehicle_local (
      id           TEXT PRIMARY KEY,
      vehicle_no   TEXT NOT NULL,
      driver_name  TEXT NOT NULL,
      active       INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Local vehicle–samiti map cache
  db.execSync(`
    CREATE TABLE IF NOT EXISTS vehicle_samiti_map_local (
      id           TEXT PRIMARY KEY,
      vehicle_id   TEXT NOT NULL,
      samiti_id    TEXT NOT NULL,
      sequence_no  INTEGER
    );
  `);
}

/**
 * Add an operation to the local sync queue.
 */
export function enqueueSyncOperation(
  id: string,
  entityType: string,
  entityId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>
): void {
  db.runSync(
    `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, created_at, synced)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 0)`,
    [id, entityType, entityId, operation, JSON.stringify(payload)]
  );
}

/**
 * Get all pending (unsynced) operations from the queue.
 */
export function getPendingSyncOperations(): Array<{
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: Record<string, unknown>;
  created_at: string;
}> {
  const rows = db.getAllSync<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    payload: string;
    created_at: string;
  }>(`SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC`);

  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}

/**
 * Mark a sync queue item as synced.
 */
export function markSynced(id: string): void {
  db.runSync(`UPDATE sync_queue SET synced = 1 WHERE id = ?`, [id]);
}

export { db };
