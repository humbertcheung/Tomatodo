/**
 * Round-trip test: create a backup, wipe the data, restore it, compare.
 *   npx electron scripts/test-restore.mjs
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const UDD = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatodo-restore-'))
process.env.TOMATODO_BACKUP_DIR = path.join(UDD, 'bak')

let failed = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log('  ok   ' + name)
  else { failed++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')) }
}

app.whenReady().then(async () => {
  const db = await import('../src/main/db.js')
  const { runBackup, restoreFromBackup } = await import('../src/main/backup.js')
  db.openDatabase(UDD)

  // ---- seed some data ----
  const list = db.createList({ name: 'Tasks' })
  const inbox = db.ensureInboxId()
  db.createTask({ list_id: inbox, subject: '任务甲', due_date: '2026-11-05', importance: 'important' })
  db.createTask({ list_id: inbox, subject: '任务乙', note_html: '<p>备注</p>' })
  const note = db.createNote({ title: '便签一', content: '<p>正文内容</p>', color: 'purple', pinned: 1 })
  const notesDir = path.join(UDD, 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(path.join(notesDir, `${note.id}.rtf`), '{\\rtf1\\ansi body}', 'utf8')
  db.updateNote(note.id, { file: path.join(notesDir, `${note.id}.rtf`) })

  const before = {
    tasks: db.querySmartList('all', { include_completed: 1 }).length,
    notes: db.listNotes({ limit: 100 }).length
  }

  // ---- backup ----
  const b = runBackup()
  check('backup succeeds', b.ok, b.error)
  check('backup file exists', fs.existsSync(b.path))
  const zipSize = fs.statSync(b.path).size
  check('backup is not empty', zipSize > 0)

  // ---- wipe ----
  for (const n of db.listNotes({ limit: 1000 })) db.deleteNote(n.id)
  for (const t of db.querySmartList('all', { include_completed: 1 })) db.deleteTask(t.id)
  check('data wiped', db.listNotes({ limit: 100 }).length === 0 && db.querySmartList('all', { include_completed: 1 }).length === 0)

  // ---- restore ----
  const r = restoreFromBackup(b.path)
  check('restore succeeds', r.ok, r.error)
  check('tasks restored', r.tasks === before.tasks, `${r.tasks} vs ${before.tasks}`)
  check('notes restored', r.notes === before.notes, `${r.notes} vs ${before.notes}`)
  check('rtf documents restored', r.files === before.notes, `${r.files} vs ${before.notes}`)

  const after = {
    tasks: db.querySmartList('all', { include_completed: 1 }).length,
    notes: db.listNotes({ limit: 100 }).length
  }
  check('task count matches', after.tasks === before.tasks, `${after.tasks} vs ${before.tasks}`)
  check('note count matches', after.notes === before.notes, `${after.notes} vs ${before.notes}`)

  const restored = db.listNotes({ limit: 10 })[0]
  check('note title restored', restored && restored.title === '便签一', restored && restored.title)
  check('note color restored', restored && restored.color === 'purple')
  check('note pinned restored', restored && restored.pinned === 1)
  check('note content restored', restored && restored.content.includes('正文内容'))
  check('note file exists on disk', restored && restored.file && fs.existsSync(restored.file))
  if (restored && restored.file && fs.existsSync(restored.file)) {
    const body = fs.readFileSync(restored.file, 'utf8')
    check('note rtf content restored', body.includes('body'), JSON.stringify(body.slice(0, 40)))
  }

  const task = db.querySmartList('all', { include_completed: 1 }).find((t) => t.subject === '任务甲')
  check('task fields restored', task && task.due_date === '2026-11-05' && task.importance === 'important')

  // ---- restoring a non-archive must fail gracefully ----
  const bogus = path.join(UDD, 'bogus.zip')
  fs.writeFileSync(bogus, 'not a zip at all')
  const bad = restoreFromBackup(bogus)
  check('a broken archive reports an error instead of crashing', !bad.ok && !!bad.error)

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
  app.exit(failed ? 1 : 0)
}).catch((e) => { console.error('FATAL', e); app.exit(1) })
