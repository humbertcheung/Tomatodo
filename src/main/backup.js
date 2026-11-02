/**
 * Scheduled backup — original implementation.
 *
 * A backup is a single ZIP file that contains:
 *   tasks.json   every task (plus lists, steps, attachments and note metadata)
 *   notes/       the RTF document of every note, one file per note
 *
 * The archive always has the same name, so each run replaces the previous
 * backup instead of piling up files.
 *
 * The scheduler is a wall-clock one: "daily", "weekday" (Mon–Fri) or
 * "weekly" (Mondays) at a configured time of day.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { app, shell } from 'electron'
import { exportJSON, getSetting, setSetting, listNotes } from './db.js'
import { buildZip } from './zip.js'

const BACKUP_FILE = 'Tomatodo-backup.zip'

// The backup folder is resolved lazily: app.getPath() is only valid once the
// app is ready, and this module is imported at load time.
let backupDir = null
function backupFolder() {
  if (backupDir) return backupDir
  backupDir = process.env.TOMATODO_BACKUP_DIR
    ? path.resolve(process.env.TOMATODO_BACKUP_DIR)
    : path.join(app.getPath('documents'), 'Tomatodo')
  return backupDir
}
function backupPath() { return path.join(backupFolder(), BACKUP_FILE) }

const SET_ENABLED = 'backupEnabled'
const SET_FREQ = 'backupFreq'
const SET_TIME = 'backupTime'
const SET_LAST = 'backupLastAt'

/* ---------------- schedule helpers ---------------- */

export const BACKUP_FREQS = ['daily', 'weekday', 'weekly']

function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '22:00'))
  if (!m) return { h: 22, m: 0 }
  return { h: Math.min(23, Math.max(0, parseInt(m[1], 10))), m: Math.min(59, Math.max(0, parseInt(m[2], 10))) }
}

/**
 * The most recent moment the schedule should have fired, or null.
 * daily   → every day
 * weekday → Monday to Friday
 * weekly  → Mondays
 */
export function lastDue(freq, now = new Date(), time = '22:00') {
  const { h, m } = parseTime(time)
  for (let back = 0; back <= 14; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m, 0, 0)
    if (day > now) continue
    const dow = day.getDay() // 0 = Sunday
    if (freq === 'weekday') {
      if (dow >= 1 && dow <= 5) return day
    } else if (freq === 'weekly') {
      if (dow === 1) return day
    } else {
      return day
    }
  }
  return null
}

export function backupSettings() {
  return {
    enabled: !!getSetting(SET_ENABLED, false),
    freq: BACKUP_FREQS.includes(getSetting(SET_FREQ, 'daily')) ? getSetting(SET_FREQ, 'daily') : 'daily',
    time: getSetting(SET_TIME, '22:00'),
    lastAt: getSetting(SET_LAST, null),
    path: backupPath(),
    dir: backupFolder()
  }
}

export function setBackupSettings(patch = {}) {
  if (patch.enabled !== undefined) setSetting(SET_ENABLED, !!patch.enabled)
  if (patch.freq !== undefined && BACKUP_FREQS.includes(patch.freq)) setSetting(SET_FREQ, patch.freq)
  if (patch.time !== undefined) setSetting(SET_TIME, patch.time)
  return backupStatus()
}

/** apply a settings patch and hand back the full status (incl. file size) */
export function backupStatusAfter(patch = {}) {
  setBackupSettings(patch)
  return backupStatus()
}

export function backupStatus() {
  const s = backupSettings()
  let size = 0
  let exists = false
  try {
    exists = fs.existsSync(backupPath())
    if (exists) size = fs.statSync(backupPath()).size
  } catch { /* ignore */ }
  return { ...s, exists, size }
}

/* ---------------- the backup itself ---------------- */

/**
 * Write a fresh backup. The archive replaces the previous one.
 */
export function runBackup() {
  try {
    fs.mkdirSync(backupFolder(), { recursive: true })

    const data = exportJSON()
    // point the note entries at their file name inside the archive
    data.notes = (data.notes || []).map((n) => ({
      ...n,
      file: n.file ? path.basename(n.file) : null
    }))
    const json = Buffer.from(JSON.stringify(data, null, 2), 'utf8')

    const entries = [{ name: 'tasks.json', data: json }]

    const notes = listNotes({ limit: 100000 })
    let included = 0
    for (const n of notes) {
      const src = n.file || path.join(app.getPath('userData'), 'notes', `${n.id}.rtf`)
      try {
        if (!fs.existsSync(src)) continue
        entries.push({ name: `notes/${path.basename(src)}`, data: fs.readFileSync(src) })
        included++
      } catch { /* skip unreadable note */ }
    }

    const zip = buildZip(entries)
    // write to a temp file first, then swap — a crash can never leave a
    // half-written backup behind
    const tmp = path.join(backupFolder(), `.${BACKUP_FILE}.tmp`)
    fs.writeFileSync(tmp, zip)
    fs.renameSync(tmp, backupPath())

    setSetting(SET_LAST, new Date().toISOString())
    return { ok: true, path: backupPath(), size: zip.length, notes: included, tasks: (data.tasks || []).length }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), path: backupPath() }
  }
}

/** open the folder that holds the backup archive */
export function openBackupDir() {
  try {
    fs.mkdirSync(backupFolder(), { recursive: true })
    shell.openPath(backupFolder())
    return true
  } catch { return false }
}

/** open the folder that holds every note's RTF document */
export function openNotesDir() {
  try {
    const dir = path.join(app.getPath('userData'), 'notes')
    fs.mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
    return true
  } catch { return false }
}

/* ---------------- scheduler ---------------- */

let timer = null

function checkDue() {
  const s = backupSettings()
  if (!s.enabled) return
  const due = lastDue(s.freq, new Date(), s.time)
  if (!due) return
  const last = s.lastAt ? new Date(s.lastAt) : null
  if (last && last >= due) return   // already backed up for this slot
  const r = runBackup()
  if (!r.ok) console.error('BACKUP FAILED:', r.error)
}

/** start the periodic check (also runs once, to catch a missed slot) */
export function startBackupScheduler() {
  if (timer) return
  setTimeout(checkDue, 3000)
  timer = setInterval(checkDue, 60_000)
}

export function stopBackupScheduler() {
  if (timer) { clearInterval(timer); timer = null }
}
