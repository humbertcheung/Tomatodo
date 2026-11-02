/**
 * Migrate every Curiota note into Tomatodo.
 *
 * Curiota stores each note as an RTF document on disk:
 *   ~/Documents/Curiota/Collections/<collection>/(Notes)/<year>/<month>/<title>.rtf
 *   …or as an RTFD bundle (a directory) holding `TXT.rtf` plus attachments.
 *
 * Tomatodo keeps the same idea — one note = one RTF document file:
 *   ~/Library/Application Support/Tomatodo/notes/<noteId>.rtf
 *
 * The source is opened READ-ONLY; nothing in Curiota is modified.
 *
 * Usage:  node scripts/migrate-curiota.mjs [--dry-run] [--reset] [--wipe]
 *   --wipe   delete EVERY task and note first (clean slate for an import)
 */
import * as db from '../src/main/db.js'
import { rtfToHtml, htmlToRtf, htmlToText, extractRtfTitle } from '../src/shared/rtf.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const CURIOTA_ROOT = path.join(os.homedir(), 'Documents', 'Curiota', 'Collections')
const TOMATODO_DATA = path.join(os.homedir(), 'Library', 'Application Support', 'Tomatodo')
const NOTES_DIR = path.join(TOMATODO_DATA, 'notes')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const RESET = args.includes('--reset')
const WIPE = args.includes('--wipe')

/* ---------- collect the source notes ---------- */

function collectNotes(root) {
  const out = []
  const walk = (dir) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.endsWith('.rtfd')) {
          // an RTFD bundle: TXT.rtf + attachments, the bundle name is the title
          const txt = path.join(p, 'TXT.rtf')
          if (fs.existsSync(txt)) {
            out.push({ file: txt, title: e.name.replace(/\.rtfd$/, ''), bundle: p, dir: dir })
          }
        } else {
          walk(p)
        }
      } else if (e.name.toLowerCase().endsWith('.rtf')) {
        out.push({ file: p, title: e.name.replace(/\.rtf$/i, ''), bundle: null, dir: dir })
      }
    }
  }
  walk(root)
  return out
}

/**
 * Curiota files notes under (Notes)/<year>/<month>/ — that folder is the
 * note's creation date, which is older than the file's modification time.
 */
function createdFromPath(file) {
  const m = /\/(\d{4})\/(\d{2})\/[^/]*$/.exec(file.replace(/\.rtfd\/TXT\.rtf$/, ''))
  if (!m) return null
  return `${m[1]}-${m[2]}-01T00:00:00.000Z`
}

/* ---------- Curiota's legacy attachment format ---------- */

/**
 * Curiota (like old TextEdit) references pictures in an RTFD by name:
 *   {{\NeXTGraphic Pasted Graphic.png \width… \height… \appleaqc
 *   }¬}
 * The terminator is `}` + 0xAC + `}` (Mac Roman "¬"), and the picture DATA
 * is not in the RTF at all — it lives next to TXT.rtf in the bundle. So the
 * whole attachment group is replaced by a standard `\pict` group with a hex
 * payload, which the shared RTF parser already understands.
 */
function expandNeXTAttachments(rtf, bundleDir) {
  if (!rtf.includes('NeXTGraphic')) return { rtf, images: 0 }
  let images = 0
  const out = rtf.replace(
    /\{\{\\NeXTGraphic\s+([^\n\\]+?)\s*\\[^\n]*\n[\s\S]*?\}\xAC\}/g,
    (_m, fileName) => {
      try {
        const src = path.join(bundleDir || '', fileName)
        if (!fs.existsSync(src)) return ''
        const bytes = fs.readFileSync(src)
        const mime = /\.png$/i.test(fileName) ? 'pngblip'
          : /\.jpe?g$/i.test(fileName) ? 'jpegblip'
            : /\.gif$/i.test(fileName) ? 'gifblip' : 'pngblip'
        let hex = ''
        for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
        images++
        return `{\\pict\\${mime}\n${hex}\n}`
      } catch {
        return ''
      }
    }
  )
  return { rtf: out, images }
}

/* ---------- title ---------- */

/** Curiota keeps the note title in the RTF's \info group as well as the name */
function titleFromRtf(rtf, fallback) {
  const clean = extractRtfTitle(rtf)
  return clean || fallback
}

/* ---------- colours ---------- */

const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange']

/**
 * Pick a stable colour per note from its title, so the imported notes are
 * visually varied but keep the same colour every time the script runs.
 */
function colorFor(title, index) {
  let h = 0
  const s = String(title || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return NOTE_COLORS[(h + index) % NOTE_COLORS.length]
}

/* ---------- run ---------- */

if (!fs.existsSync(CURIOTA_ROOT)) {
  console.error(`Curiota folder not found: ${CURIOTA_ROOT}`)
  process.exit(1)
}

const sources = collectNotes(CURIOTA_ROOT)
console.log(`Found ${sources.length} Curiota notes under ${CURIOTA_ROOT}`)

db.openDatabase(TOMATODO_DATA)

const IMPORT_KEY = 'curiota_imported_ids'
let importedIds = db.getSetting(IMPORT_KEY, []) || []

/**
 * Wipe everything: every task, every note and every note RTF file.
 * Used before a clean import so no test data is left behind.
 */
function wipeAll() {
  const notes = db.listNotes({ limit: 100000 })
  for (const n of notes) {
    try { if (n.file && fs.existsSync(n.file)) fs.unlinkSync(n.file) } catch { /* ignore */ }
    db.deleteNote(n.id)
  }
  // remove orphaned RTF files that no note points at
  try {
    for (const f of fs.readdirSync(NOTES_DIR)) {
      if (f.endsWith('.rtf')) fs.unlinkSync(path.join(NOTES_DIR, f))
    }
  } catch { /* no notes dir yet */ }
  // every task, whatever list it lives in
  const tasks = db.querySmartList('all', { include_completed: 1 })
  for (const t of tasks) db.deleteTask(t.id)
  console.log(`Wiped ${notes.length} note(s) and ${tasks.length} task(s)`)
  db.setSetting(IMPORT_KEY, [])
  importedIds = []
}

if (WIPE && !DRY_RUN) wipeAll()

if (RESET && !DRY_RUN) {
  // remove ONLY the notes a previous migration created (never the user's own)
  let removed = 0
  for (const id of importedIds) {
    const n = db.listNotes({ limit: 100000 }).find((x) => x.id === id)
    if (!n) continue
    try { if (n.file && fs.existsSync(n.file)) fs.unlinkSync(n.file) } catch { /* ignore */ }
    db.deleteNote(id)
    removed++
  }
  db.setSetting(IMPORT_KEY, [])
  importedIds = []
  console.log(`Reset: removed ${removed} previously imported note(s)`)
}

if (!DRY_RUN) fs.mkdirSync(NOTES_DIR, { recursive: true })

let ok = 0, failed = 0, withImages = 0
const report = []

for (const src of sources) {
  try {
    // read as latin1: the legacy attachment terminator is a raw 0xAC byte,
    // which a UTF-8 decode would destroy (RTF escapes all non-ASCII text)
    const raw = fs.readFileSync(src.file, 'latin1')
    const { rtf, images } = expandNeXTAttachments(raw, src.bundle)
    const html = rtfToHtml(rtf)
    const text = htmlToText(html)
    const title = titleFromRtf(raw, src.title)
    // a Curiota record is a note even when its body is empty
    if (!title && !text) {
      report.push({ title: src.title, status: 'skipped' })
      continue
    }

    if (DRY_RUN) {
      ok++
      if (images) withImages++
      report.push({ title, status: 'dry-run', chars: text.length, images })
      continue
    }

    // one record → one note
    const note = db.createNote({
      title: title.slice(0, 120),
      content: html,
      color: colorFor(title, sources.indexOf(src)),
      pinned: false
    })

    // …and one note → one RTF document file
    const file = path.join(NOTES_DIR, `${note.id}.rtf`)
    fs.writeFileSync(file, htmlToRtf(html), 'utf8')

    // keep the plain-text preview in sync and restore the source timestamps
    const st = fs.statSync(src.file)
    const updated = new Date(st.mtimeMs).toISOString()
    const created = createdFromPath(src.file) || new Date(st.birthtimeMs || st.mtimeMs).toISOString()
    db.updateNote(note.id, { file, preview: text.slice(0, 500) })
    db.setNoteTimestamps(note.id, created, updated)

    ok++
    if (images) withImages++
    importedIds.push(note.id)
    report.push({ title, status: 'migrated', chars: text.length, images, file, created, updated })
  } catch (e) {
    failed++
    report.push({ title: src.title, status: 'failed', error: String(e?.message || e) })
  }
}

console.log(`\nMigrated ${ok} note(s)${failed ? `, ${failed} failed` : ''}${withImages ? ` (${withImages} with images)` : ''}`)
if (DRY_RUN) console.log('(dry run — nothing was written)')
else db.setSetting(IMPORT_KEY, importedIds)

fs.writeFileSync(
  path.join(os.tmpdir(), 'curiota-migration-report.json'),
  JSON.stringify({ ok, failed, withImages, report }, null, 2)
)
console.log(`Report: ${path.join(os.tmpdir(), 'curiota-migration-report.json')}`)

if (failed) process.exit(1)
