/**
 * SQLite-backed model cache for atomic cross-process access.
 * Replaces per-provider JSON files with a single cache.db.
 */
import { Database } from "bun:sqlite";
import * as path from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils/dirs";
const CACHE_SCHEMA_VERSION = 1;
let sharedDb = null;
let sharedDbPath = null;
function getDefaultDbPath() {
    return path.join(getAgentDir(), "models.db");
}
function getDb(dbPath) {
    const resolvedPath = dbPath ?? getDefaultDbPath();
    if (sharedDb && sharedDbPath === resolvedPath) {
        return sharedDb;
    }
    if (sharedDb) {
        sharedDb.close();
    }
    const db = new Database(resolvedPath, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 3000");
    db.run(`
		CREATE TABLE IF NOT EXISTS model_cache (
			provider_id TEXT PRIMARY KEY,
			version INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			authoritative INTEGER NOT NULL DEFAULT 0,
			models TEXT NOT NULL
		)
	`);
    sharedDb = db;
    sharedDbPath = resolvedPath;
    return db;
}
export function readModelCache(providerId, ttlMs, now, dbPath) {
    try {
        const db = getDb(dbPath);
        const row = db.query("SELECT * FROM model_cache WHERE provider_id = ?").get(providerId);
        if (!row || row.version !== CACHE_SCHEMA_VERSION) {
            return null;
        }
        const models = JSON.parse(row.models);
        const ageMs = now() - row.updated_at;
        const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttlMs;
        return {
            models,
            fresh,
            authoritative: row.authoritative === 1,
            updatedAt: row.updated_at,
        };
    }
    catch {
        return null;
    }
}
export function writeModelCache(providerId, updatedAt, models, authoritative, dbPath) {
    try {
        const db = getDb(dbPath);
        db.run(`INSERT OR REPLACE INTO model_cache (provider_id, version, updated_at, authoritative, models)
			 VALUES (?, ?, ?, ?, ?)`, [providerId, CACHE_SCHEMA_VERSION, updatedAt, authoritative ? 1 : 0, JSON.stringify(models)]);
    }
    catch {
        // Cache writes are best-effort; failures should not break model resolution.
    }
}
//# sourceMappingURL=model-cache.js.map