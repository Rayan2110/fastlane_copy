import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type {ProductData, VideoScript, JobStatus, RenderFormat, AvatarRow} from './types';

export type ProductRow = {id: number; data: ProductData; createdAt: string};
export type ScriptRow = {id: number; productId: number; data: VideoScript; createdAt: string};
export type VideoRow = {
  id: number;
  scriptId: number;
  productId: number;
  filePath: string;
  posted: boolean;
  createdAt: string;
};
export type JobRow = {
  id: number;
  scriptId: number;
  productId: number;
  status: JobStatus;
  error: string | null;
  format: RenderFormat;
  avatarId: number | null;
  createdAt: string;
};

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL REFERENCES scripts(id),
  file_path TEXT NOT NULL,
  posted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL REFERENCES scripts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  format TEXT NOT NULL DEFAULT 'slideshow',
  avatar_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS avatars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS store_passwords (
  host TEXT PRIMARY KEY,
  password TEXT NOT NULL
);
`;

// Colonnes ajoutees en phase D sur des bases existantes.
const MIGRATIONS = [
  `ALTER TABLE jobs ADD COLUMN format TEXT NOT NULL DEFAULT 'slideshow'`,
  `ALTER TABLE jobs ADD COLUMN avatar_id INTEGER`,
];

export function openDb(dbPath?: string): Database.Database {
  const target = dbPath ?? path.join(process.cwd(), 'data', 'fastlane.db');
  if (target !== ':memory:') {
    fs.mkdirSync(path.dirname(target), {recursive: true});
  }
  db?.close();
  db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  for (const m of MIGRATIONS) {
    try {
      db.exec(m);
    } catch {
      // colonne deja presente
    }
  }
  return db;
}

function getDb(): Database.Database {
  if (!db) openDb();
  return db!;
}

export function insertProduct(data: ProductData): number {
  const r = getDb()
    .prepare('INSERT INTO products (data) VALUES (?)')
    .run(JSON.stringify(data));
  return Number(r.lastInsertRowid);
}

export function getProduct(id: number): ProductRow | undefined {
  const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | {id: number; data: string; created_at: string}
    | undefined;
  return row && {id: row.id, data: JSON.parse(row.data), createdAt: row.created_at};
}

export function listProducts(): ProductRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM products ORDER BY id DESC')
    .all() as {id: number; data: string; created_at: string}[];
  return rows.map((r) => ({id: r.id, data: JSON.parse(r.data), createdAt: r.created_at}));
}

export function updateProductData(id: number, data: ProductData): void {
  getDb().prepare('UPDATE products SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
}

export function deleteProduct(id: number): void {
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

// Reclame atomiquement le prochain job en attente (passe en 'running').
export function claimNextPendingJob():
  | {id: number; scriptId: number; format: RenderFormat; avatarId: number | null}
  | undefined {
  const row = getDb()
    .prepare(
      `UPDATE jobs SET status = 'running'
       WHERE id = (SELECT id FROM jobs WHERE status = 'pending' ORDER BY id LIMIT 1)
       RETURNING id, script_id, format, avatar_id`
    )
    .get() as
    | {id: number; script_id: number; format: RenderFormat; avatar_id: number | null}
    | undefined;
  return (
    row && {id: row.id, scriptId: row.script_id, format: row.format, avatarId: row.avatar_id}
  );
}

// Un script a-t-il deja un rendu en attente ou en cours ?
export function hasActiveJobForScript(scriptId: number): boolean {
  return (
    getDb()
      .prepare(`SELECT 1 FROM jobs WHERE script_id = ? AND status IN ('pending','running') LIMIT 1`)
      .get(scriptId) !== undefined
  );
}

// Apres un redemarrage du serveur, les jobs 'running' sont orphelins.
export function failRunningJobs(reason: string): number {
  const r = getDb()
    .prepare(`UPDATE jobs SET status = 'failed', error = ? WHERE status = 'running'`)
    .run(reason);
  return r.changes;
}

export function insertScript(productId: number, script: VideoScript): number {
  const r = getDb()
    .prepare('INSERT INTO scripts (product_id, data) VALUES (?, ?)')
    .run(productId, JSON.stringify(script));
  return Number(r.lastInsertRowid);
}

export function getScript(id: number): ScriptRow | undefined {
  const row = getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(id) as
    | {id: number; product_id: number; data: string; created_at: string}
    | undefined;
  return (
    row && {
      id: row.id,
      productId: row.product_id,
      data: JSON.parse(row.data),
      createdAt: row.created_at,
    }
  );
}

export function listScripts(productId: number): ScriptRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM scripts WHERE product_id = ? ORDER BY id')
    .all(productId) as {id: number; product_id: number; data: string; created_at: string}[];
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    data: JSON.parse(r.data),
    createdAt: r.created_at,
  }));
}

export function updateScriptData(id: number, data: VideoScript): void {
  getDb().prepare('UPDATE scripts SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
}

export function insertVideo(scriptId: number, filePath: string): number {
  const r = getDb()
    .prepare('INSERT INTO videos (script_id, file_path) VALUES (?, ?)')
    .run(scriptId, filePath);
  return Number(r.lastInsertRowid);
}

export function listVideos(productId: number): VideoRow[] {
  const rows = getDb()
    .prepare(
      `SELECT v.*, s.product_id FROM videos v
       JOIN scripts s ON s.id = v.script_id
       WHERE s.product_id = ? ORDER BY v.id DESC`
    )
    .all(productId) as {
    id: number;
    script_id: number;
    product_id: number;
    file_path: string;
    posted: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    scriptId: r.script_id,
    productId: r.product_id,
    filePath: r.file_path,
    posted: r.posted === 1,
    createdAt: r.created_at,
  }));
}

export function setVideoPosted(id: number, posted: boolean): void {
  getDb().prepare('UPDATE videos SET posted = ? WHERE id = ?').run(posted ? 1 : 0, id);
}

export function markAllVideosPosted(productId: number): number {
  const r = getDb()
    .prepare(
      `UPDATE videos SET posted = 1
       WHERE posted = 0 AND script_id IN (SELECT id FROM scripts WHERE product_id = ?)`
    )
    .run(productId);
  return r.changes;
}

// Compteurs de videos par produit (pour les cartes du dashboard).
export function listVideoCounts(): Record<number, {total: number; unposted: number}> {
  const rows = getDb()
    .prepare(
      `SELECT s.product_id AS productId,
              COUNT(*) AS total,
              SUM(CASE WHEN v.posted = 0 THEN 1 ELSE 0 END) AS unposted
       FROM videos v JOIN scripts s ON s.id = v.script_id
       GROUP BY s.product_id`
    )
    .all() as {productId: number; total: number; unposted: number}[];
  const out: Record<number, {total: number; unposted: number}> = {};
  for (const r of rows) out[r.productId] = {total: r.total, unposted: r.unposted};
  return out;
}

export function createJob(
  scriptId: number,
  format: RenderFormat = 'slideshow',
  avatarId?: number
): number {
  const r = getDb()
    .prepare('INSERT INTO jobs (script_id, format, avatar_id) VALUES (?, ?, ?)')
    .run(scriptId, format, avatarId ?? null);
  return Number(r.lastInsertRowid);
}

type RawJob = {
  id: number;
  script_id: number;
  status: JobStatus;
  error: string | null;
  format: RenderFormat;
  avatar_id: number | null;
  created_at: string;
};

export function getJob(id: number): JobRow | undefined {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as RawJob | undefined;
  if (!row) return undefined;
  const script = getScript(row.script_id);
  return {
    id: row.id,
    scriptId: row.script_id,
    productId: script?.productId ?? 0,
    status: row.status,
    error: row.error,
    format: row.format,
    avatarId: row.avatar_id,
    createdAt: row.created_at,
  };
}

export function setJobStatus(id: number, status: JobStatus, error?: string): void {
  getDb()
    .prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?')
    .run(status, error ?? null, id);
}

export function listJobs(productId: number): JobRow[] {
  const rows = getDb()
    .prepare(
      `SELECT j.*, s.product_id FROM jobs j
       JOIN scripts s ON s.id = j.script_id
       WHERE s.product_id = ? ORDER BY j.id DESC`
    )
    .all(productId) as (RawJob & {product_id: number})[];
  return rows.map((r) => ({
    id: r.id,
    scriptId: r.script_id,
    productId: r.product_id,
    status: r.status,
    error: r.error,
    format: r.format,
    avatarId: r.avatar_id,
    createdAt: r.created_at,
  }));
}

// --- Avatars (phase D) ---

export function insertAvatar(name: string, imagePath: string): number {
  const r = getDb()
    .prepare('INSERT INTO avatars (name, image_path) VALUES (?, ?)')
    .run(name, imagePath);
  return Number(r.lastInsertRowid);
}

export function getAvatar(id: number): AvatarRow | undefined {
  const row = getDb().prepare('SELECT * FROM avatars WHERE id = ?').get(id) as
    | {id: number; name: string; image_path: string; created_at: string}
    | undefined;
  return row && {id: row.id, name: row.name, imagePath: row.image_path, createdAt: row.created_at};
}

export function listAvatars(): AvatarRow[] {
  const rows = getDb().prepare('SELECT * FROM avatars ORDER BY id DESC').all() as {
    id: number;
    name: string;
    image_path: string;
    created_at: string;
  }[];
  return rows.map((r) => ({id: r.id, name: r.name, imagePath: r.image_path, createdAt: r.created_at}));
}

export function deleteAvatar(id: number): void {
  getDb().prepare('DELETE FROM avatars WHERE id = ?').run(id);
}

// --- Mots de passe visiteur des boutiques Shopify protegees ---

export function setStorePassword(host: string, password: string): void {
  getDb()
    .prepare('INSERT INTO store_passwords (host, password) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET password = excluded.password')
    .run(host, password);
}

export function getStorePassword(host: string): string | undefined {
  const row = getDb().prepare('SELECT password FROM store_passwords WHERE host = ?').get(host) as
    | {password: string}
    | undefined;
  return row?.password;
}
