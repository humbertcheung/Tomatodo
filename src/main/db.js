/**
 * Local SQLite persistence — an original implementation of the data model
 * observed in the target app's TaskKit framework (see docs/RE-SPEC.md).
 *
 * Driver strategy: prefer Node's built-in `node:sqlite` (available in recent
 * Electron main-process Node); fall back to `better-sqlite3` if present.
 */
import path from 'node:path'
import fs from 'node:fs'
import { repairMangledRtf, htmlToText } from '../shared/rtf.js'

let db = null
let driver = null

function openDriver(file) {
  // Probe 1: node:sqlite (zero native deps; works under CJS and ESM)
  try {
    const sq = process.getBuiltinModule
      ? process.getBuiltinModule('node:sqlite')
      : require('node:sqlite')
    const { DatabaseSync } = sq
    const d = new DatabaseSync(file)
    d.exec('PRAGMA journal_mode = WAL;')
    return { db: d, driver: 'node:sqlite' }
  } catch (e) {
    /* not available */
  }
  // Probe 2: better-sqlite3
  try {
    const Database = require('better-sqlite3')
    const d = new Database(file)
    d.pragma('journal_mode = WAL')
    return { db: d, driver: 'better-sqlite3' }
  } catch (e) {
    throw new Error(
      'No SQLite driver available. Tried node:sqlite and better-sqlite3: ' + e.message
    )
  }
}

export function openDatabase(userDataDir) {
  const file = path.join(userDataDir, 'todo.db')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const opened = openDriver(file)
  db = opened.db
  driver = opened.driver
  migrate()
  return { file, driver }
}

export function getDriverInfo() {
  return driver
}

// ---------- schema ----------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  is_expanded INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  show_completed INTEGER NOT NULL DEFAULT 1,
  sort_type TEXT NOT NULL DEFAULT 'position',
  sort_dir TEXT NOT NULL DEFAULT 'asc',
  theme TEXT NOT NULL DEFAULT 'blue',
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  note_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'notCompleted',
  importance TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,               -- ISO date (yyyy-mm-dd) or null
  due_has_time INTEGER NOT NULL DEFAULT 0,
  reminder_date TEXT,          -- ISO datetime or null
  recurrence_json TEXT,        -- {type, interval, weekdays[], hasTime}
  my_day_date TEXT,            -- yyyy-mm-dd when pinned to My Day
  position REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_myday ON tasks(my_day_date);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- 'file' | 'link'
  name TEXT NOT NULL,
  path_or_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  pinned INTEGER NOT NULL DEFAULT 0,
  preview TEXT NOT NULL DEFAULT '',
  file TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
`

function migrate() {
  db.exec(SCHEMA)
  // additive migrations for notes (preview text + rtf file pointer)
  try {
    const cols = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name)
    if (!cols.includes('preview')) db.exec("ALTER TABLE notes ADD COLUMN preview TEXT NOT NULL DEFAULT ''")
    if (!cols.includes('file')) db.exec('ALTER TABLE notes ADD COLUMN file TEXT')
  } catch { /* fresh db */ }
  // Default list on first run
  const row = db.prepare('SELECT COUNT(*) AS n FROM lists').get()
  if (Number(row.n) === 0) {
    db.prepare(
      `INSERT INTO lists (id, name, position, is_default, created_at)
       VALUES (?, ?, ?, 1, ?)`
    ).run(genId(), 'Tasks', 1, new Date().toISOString())
  }
  repairRawRtfNotes()
}

/**
 * Notes whose content was pasted as raw RTF source (escapes without their
 * backslash) are really a GBK byte stream — re-parse them so the text is
 * readable again.
 */
function repairRawRtfNotes() {
  try {
    const rows = db.prepare('SELECT id, content, preview FROM notes').all()
    for (const row of rows) {
      const fixed = repairMangledRtf(row.content)
      if (!fixed) continue
      db.prepare('UPDATE notes SET content = ?, preview = ? WHERE id = ?')
        .run(fixed, htmlToText(fixed).slice(0, 160), row.id)
    }
  } catch { /* nothing to repair */ }
}

/** normalize note content on the way in, so raw RTF never reaches the DB */
function normalizeNoteContent(content) {
  const raw = String(content || '')
  if (!raw) return raw
  return repairMangledRtf(raw) || raw
}

export function genId() {
  const crypto = process.getBuiltinModule('node:crypto')
  return 't' + crypto.randomBytes(9).toString('base64url')
}

/** Hidden inbox list — tasks are flat in v2; list concept is not surfaced in UI. */
export function ensureInboxId() {
  const r = get('SELECT id FROM lists ORDER BY is_default DESC, position LIMIT 1')
  if (r && r.id) return r.id
  const id = genId()
  run('INSERT INTO lists (id, name, position, is_default, created_at) VALUES (?, ?, 1, 1, ?)', id, 'Inbox', new Date().toISOString())
  return id
}

export function allSettings() {
  return all('SELECT key, value FROM settings')
}

export function restoreTask(snapshot) {
  if (!snapshot || !snapshot.id) return null
  const existing = get('SELECT id FROM tasks WHERE id = ?', snapshot.id)
  if (existing) return snapshot
  const now = new Date().toISOString()
  run(
    `INSERT INTO tasks (id, list_id, subject, note_html, status, importance, due_date, due_has_time,
       reminder_date, recurrence_json, my_day_date, position, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    snapshot.id,
    snapshot.list_id,
    snapshot.subject ?? '',
    snapshot.note_html ?? '',
    snapshot.status ?? 'notCompleted',
    snapshot.importance ?? 'normal',
    snapshot.due_date ?? null,
    snapshot.due_has_time ? 1 : 0,
    snapshot.reminder_date ?? null,
    snapshot.recurrence_json ?? null,
    snapshot.my_day_date ?? null,
    snapshot.position ?? 1,
    snapshot.completed_at ?? null,
    snapshot.created_at ?? now,
    now
  )
  return getTask(snapshot.id)
}

// ---------- tiny query helpers ----------

function run(sql, ...params) {
  db.prepare(sql).run(...params)
}
function get(sql, ...params) {
  const r = db.prepare(sql).get(...params)
  return r === undefined ? undefined : normalize(r)
}
function all(sql, ...params) {
  return db.prepare(sql).all(...params).map(normalize)
}
function normalize(r) {
  const o = {}
  for (const k of Object.keys(r)) o[k] = r[k] === undefined ? null : r[k]
  return o
}

// ---------- settings ----------

export function getSetting(key, dflt = null) {
  const r = get('SELECT value FROM settings WHERE key = ?', key)
  return r && r.value !== null && r.value !== undefined ? JSON.parse(r.value) : dflt
}
export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key, JSON.stringify(value === undefined ? null : value)
  )
}

// ---------- groups ----------

export function listGroups() {
  return all('SELECT * FROM groups ORDER BY position')
}
export function createGroup({ name, position }) {
  const id = genId()
  const p = position ?? nextGroupPosition()
  run(
    'INSERT INTO groups (id, name, position, is_expanded, created_at) VALUES (?, ?, ?, 1, ?)',
    id, name, p, new Date().toISOString()
  )
  return getGroup(id)
}
export function getGroup(id) {
  return get('SELECT * FROM groups WHERE id = ?', id)
}
export function updateGroup(id, fields) {
  applyUpdate('groups', id, fields, ['name', 'position', 'is_expanded'])
  return getGroup(id)
}
export function deleteGroup(id) {
  run('UPDATE lists SET group_id = NULL WHERE group_id = ?', id)
  run('DELETE FROM groups WHERE id = ?', id)
}
function nextGroupPosition() {
  const r = get('SELECT MAX(position) AS m FROM groups')
  return (r && r.m ? Number(r.m) : 0) + 1
}

// ---------- lists ----------

export function listLists() {
  return all('SELECT * FROM lists ORDER BY position')
}
export function getList(id) {
  return get('SELECT * FROM lists WHERE id = ?', id)
}
export function createList({ name, position, group_id, theme }) {
  const id = genId()
  run(
    `INSERT INTO lists (id, name, position, group_id, theme, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, name, position ?? nextListPosition(group_id ?? null), group_id ?? null, theme ?? 'blue',
    new Date().toISOString()
  )
  return getList(id)
}
export function updateList(id, fields) {
  applyUpdate('lists', id, fields, ['name', 'position', 'show_completed', 'sort_type', 'sort_dir', 'theme', 'group_id'])
  return getList(id)
}
export function deleteList(id) {
  run('DELETE FROM tasks WHERE list_id = ?', id)
  run('DELETE FROM lists WHERE id = ?', id)
}
export function listCountByList() {
  const rows = all(
    `SELECT list_id, COUNT(*) AS n FROM tasks
     WHERE status = 'notCompleted' GROUP BY list_id`
  )
  const m = {}
  for (const r of rows) m[r.list_id] = Number(r.n)
  return m
}
function nextListPosition(groupId) {
  const r = groupId
    ? get('SELECT MAX(position) AS m FROM lists WHERE group_id = ?', groupId)
    : get('SELECT MAX(position) AS m FROM lists WHERE group_id IS NULL')
  return (r && r.m ? Number(r.m) : 0) + 1
}

// ---------- tasks ----------

export function getTask(id) {
  return get('SELECT * FROM tasks WHERE id = ?', id)
}

export function createTask({ list_id, subject, note_html, due_date, due_has_time, reminder_date, my_day_date, importance, position }) {
  const id = genId()
  list_id = list_id || ensureInboxId()
  const now = new Date().toISOString()
  const p = position ?? midpointPosition(list_id)
  run(
    `INSERT INTO tasks (id, list_id, subject, note_html, importance, due_date, due_has_time,
       reminder_date, my_day_date, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, list_id, subject, note_html || '', importance || 'normal',
    due_date || null, due_has_time ? 1 : 0, reminder_date || null,
    my_day_date || null, p, now, now
  )
  return getTask(id)
}

export function updateTask(id, fields) {
  const allowed = ['subject', 'note_html', 'status', 'importance', 'due_date', 'due_has_time',
    'reminder_date', 'recurrence_json', 'my_day_date', 'position', 'completed_at', 'list_id']
  applyUpdate('tasks', id, fields, allowed)
  return getTask(id)
}

export function deleteTask(id) {
  run('DELETE FROM steps WHERE task_id = ?', id)
  run('DELETE FROM attachments WHERE task_id = ?', id)
  run('DELETE FROM tasks WHERE id = ?', id)
}

export function deleteCompletedTasks(listId) {
  if (listId) run(`DELETE FROM tasks WHERE list_id = ? AND status = 'completed'`, listId)
  else run(`DELETE FROM tasks WHERE status = 'completed'`)
}

export function moveTaskTo(id, listId) {
  const p = midpointPosition(listId)
  run(`UPDATE tasks SET list_id = ?, position = ?, updated_at = ? WHERE id = ?`,
    listId, p, new Date().toISOString(), id)
  return getTask(id)
}

// fractional midpoint insert (mirrors committedDate ordering approach)
export function midpointPosition(listId) {
  const r = get('SELECT MIN(position) AS m FROM tasks WHERE list_id = ?', listId)
  const min = r && r.m !== null && r.m !== undefined ? Number(r.m) : null
  return min === null ? 1 : min / 2
}

export function reposition(id, beforeId, afterId) {
  const task = getTask(id)
  if (!task) return null
  let lo = 0, hi = 0
  if (beforeId && afterId) {
    lo = Number(getTask(beforeId)?.position ?? 0)
    hi = Number(getTask(afterId)?.position ?? 0)
  } else if (beforeId) {
    hi = Number(getTask(beforeId)?.position ?? 1)
  } else if (afterId) {
    lo = Number(getTask(afterId)?.position ?? 0)
  } else {
    hi = 0
  }
  const p = (lo + hi) / 2 || (lo + hi === 0 ? 1 : (lo + hi) / 2)
  run('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?', p, new Date().toISOString(), id)
  return getTask(id)
}

// ---------- steps ----------

export function listSteps(taskId) {
  return all('SELECT * FROM steps WHERE task_id = ? ORDER BY position', taskId)
}
export function createStep({ task_id, subject, position }) {
  const id = genId()
  const r = get('SELECT MIN(position) AS m FROM steps WHERE task_id = ?', task_id)
  const min = r && r.m !== null && r.m !== undefined ? Number(r.m) : null
  const p = position ?? (min === null ? 1 : min / 2)
  run(
    'INSERT INTO steps (id, task_id, subject, position, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    id, task_id, subject, p, new Date().toISOString()
  )
  return get('SELECT * FROM steps WHERE id = ?', id)
}
export function updateStep(id, fields) {
  applyUpdate('steps', id, fields, ['subject', 'position', 'completed'])
  return get('SELECT * FROM steps WHERE id = ?', id)
}
export function deleteStep(id) {
  run('DELETE FROM steps WHERE id = ?', id)
}

// ---------- attachments ----------

export function listAttachments(taskId) {
  return all('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at', taskId)
}
export function createAttachment({ task_id, type, name, path_or_url }) {
  const id = genId()
  run(
    'INSERT INTO attachments (id, task_id, type, name, path_or_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, task_id, type, name, path_or_url, new Date().toISOString()
  )
  return get('SELECT * FROM attachments WHERE id = ?', id)
}
export function deleteAttachment(id) {
  run('DELETE FROM attachments WHERE id = ?', id)
}

// ---------- smart list queries (parity with observed smart lists) ----------

function todayLocalISO() {
  const d = new Date()
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function querySmartList(kind, { sort_type = 'position', sort_dir = 'asc', include_completed = 0 } = {}) {
  const dir = String(sort_dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const select = `SELECT t.*, l.name AS list_name, l.theme AS list_theme
                  FROM tasks t JOIN lists l ON l.id = t.list_id`
  const today = todayLocalISO()
  // smart lists surface ALL matching tasks regardless of completion status;
  // completed rows sink below the open ones (except the dedicated views)
  const canInclude = ['myday', 'important', 'planned', 'all'].includes(kind)
  let sql
  switch (kind) {
    case 'myday':
      sql = `${select} WHERE t.my_day_date = '${today}'`
      break
    case 'important':
      sql = `${select} WHERE t.importance = 'important'`
      break
    case 'planned':
      sql = `${select} WHERE (t.due_date IS NOT NULL OR t.reminder_date IS NOT NULL)`
      break
    case 'open':
      sql = `${select} WHERE t.status = 'notCompleted'`
      break
    case 'all':
      sql = `${select} WHERE 1=1`
      break
    case 'completed':
      sql = `${select} WHERE t.status = 'completed' ORDER BY t.completed_at DESC LIMIT 500`
      return all(sql)
    default:
      return []
  }
  if (canInclude) sql += ' ORDER BY (t.status = \'completed\') ASC, ' + orderClause(sort_type, dir).replace(/^ORDER BY /, '')
  else sql += ' ' + orderClause(sort_type, dir)
  return all(sql)
}

export function listTasks(listId, { show_completed = 1, sort_type = 'position', sort_dir = 'asc' } = {}) {
  const dir = String(sort_dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  let sql = 'SELECT * FROM tasks WHERE list_id = ?'
  if (!Number(show_completed)) sql += ` AND status = 'notCompleted'`
  sql += ' ' + orderClause(sort_type, dir)
  const rows = all(sql, listId)
  // completed always sink to bottom (observed behavior)
  return rows
}

function orderClause(sort_type, dir) {
  switch (sort_type) {
    case 'alphabetical': return `ORDER BY subject COLLATE NOCASE ${dir}`
    case 'due': return `ORDER BY (due_date IS NULL), due_date ${dir}, position`
    case 'creation': return `ORDER BY created_at ${dir}`
    case 'importance': return `ORDER BY (importance = 'important') ${dir === 'ASC' ? 'DESC' : 'ASC'}, position`
    case 'myday': return `ORDER BY (my_day_date IS NULL), position`
    case 'completed': return `ORDER BY completed_at ${dir}, position`
    default: return `ORDER BY position ${dir}`
  }
}

export function searchTasks(q) {
  const like = `%${q.replace(/[%_]/g, '')}%`
  return all(
    `SELECT t.*, l.name AS list_name, l.theme AS list_theme FROM tasks t JOIN lists l ON l.id = t.list_id
     WHERE t.subject LIKE ? OR t.note_html LIKE ?
        OR t.id IN (SELECT task_id FROM steps WHERE subject LIKE ?)
     ORDER BY t.status, t.due_date IS NULL, t.due_date
     LIMIT 200`,
    like, like, like
  )
}

export function overviewForTray() {
  const today = todayLocalISO()
  const r = get(
    `SELECT
       SUM(CASE WHEN status='notCompleted' AND my_day_date = '${today}' THEN 1 ELSE 0 END) AS myday,
       SUM(CASE WHEN status='notCompleted' AND due_date IS NOT NULL AND due_date <= '${today}' THEN 1 ELSE 0 END) AS due,
       SUM(CASE WHEN status='notCompleted' THEN 1 ELSE 0 END) AS open
     FROM tasks`
  )
  return {
    myday: Number(r?.myday || 0),
    due: Number(r?.due || 0),
    open: Number(r?.open || 0)
  }
}

export function exportJSON() {
  return {
    exported_at: new Date().toISOString(),
    groups: listGroups(),
    lists: listLists(),
    tasks: all('SELECT * FROM tasks ORDER BY list_id, position'),
    steps: all('SELECT * FROM steps'),
    attachments: all('SELECT * FROM attachments'),
    notes: all('SELECT * FROM notes ORDER BY updated_at DESC')
  }
}

// ---------- notes (quick memos) ----------

export function listNotes({ q = null, limit = 500 } = {}) {
  if (q) return searchNotes(q, limit)
  return all(`SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT ${Number(limit) || 500}`)
}

export function searchNotes(q, limit = 500) {
  const like = `%${String(q).replace(/[%_]/g, '')}%`
  return all(
    `SELECT * FROM notes
     WHERE title LIKE ? OR content LIKE ?
     ORDER BY pinned DESC, updated_at DESC LIMIT ${Number(limit) || 500}`,
    like, like
  )
}

export function getNote(id) {
  return get('SELECT * FROM notes WHERE id = ?', id)
}

export function createNote({ title, content, color, pinned, preview, file }) {
  const id = genId()
  const now = new Date().toISOString()
  const body = normalizeNoteContent(content)
  run(
    'INSERT INTO notes (id, title, content, color, pinned, preview, file, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, title || '', body, color || 'yellow', pinned ? 1 : 0, preview || '', file || null, now, now
  )
  return getNote(id)
}

export function updateNote(id, fields) {
  if (fields && typeof fields.content === 'string') {
    fields = { ...fields, content: normalizeNoteContent(fields.content) }
  }
  applyUpdate('notes', id, fields, ['title', 'content', 'color', 'pinned', 'preview', 'file'])
  run('UPDATE notes SET updated_at = ? WHERE id = ?', new Date().toISOString(), id)
  return getNote(id)
}

export function deleteNote(id) {
  run('DELETE FROM notes WHERE id = ?', id)
}

/**
 * Restore a note's original timestamps (used when importing notes from
 * another app, so the import order and "updated" dates stay faithful).
 */
export function setNoteTimestamps(id, created_at, updated_at) {
  run(
    'UPDATE notes SET created_at = ?, updated_at = ? WHERE id = ?',
    created_at || new Date().toISOString(),
    updated_at || created_at || new Date().toISOString(),
    id
  )
  return getNote(id)
}

export function notesCount() {
  const r = get('SELECT COUNT(*) AS n FROM notes')
  return Number(r?.n || 0)
}

// ---------- shared helper ----------

function applyUpdate(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k))
  if (!keys.length) return
  const sets = keys.map((k) => `${k} = ?`).join(', ')
  const params = keys.map((k) => {
    const v = fields[k]
    if (v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    return v
  })
  run(
    `UPDATE ${table} SET ${sets}${table === 'tasks' ? ', updated_at = ?' : ''} WHERE id = ?`,
    ...(table === 'tasks' ? [...params, new Date().toISOString(), id] : [...params, id])
  )
}
