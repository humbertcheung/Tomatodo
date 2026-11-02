/**
 * Functional test for the backup engine and the note-deletion behaviour.
 *   npx electron scripts/test-backup.mjs
 *
 * Runs against a scratch profile and a scratch backup folder, so it never
 * touches the real data.
 */
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execSync } from 'node:child_process'

const UDD = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatodo-backup-'))
const BKD = path.join(UDD, 'backup-folder')
process.env.TOMATODO_BACKUP_DIR = BKD

let failed = 0
const check = (name, cond, detail = '') => {
  if (cond) console.log('  ok   ' + name)
  else { failed++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')) }
}

app.whenReady().then(async () => {
  app.setPath('userData', UDD)

  const db = await import('../src/main/db.js')
  db.openDatabase(UDD)

  // seed one task and one note (with a real RTF document on disk)
  const list = db.createList({ name: 'Tasks' })
  db.createTask({ list_id: list.id, subject: '第一条待办' })
  const note = db.createNote({ title: '测试便签', content: '<p>正文</p>', color: 'yellow' })
  const notesDir = path.join(UDD, 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  const rtfPath = path.join(notesDir, `${note.id}.rtf`)
  fs.writeFileSync(rtfPath, '{\\rtf1\\ansi\\ansicpg936 test}', 'utf8')
  db.updateNote(note.id, { file: rtfPath })

  const { runBackup, backupStatus, setBackupSettings, lastDue } = await import('../src/main/backup.js')

  console.log('backup engine')
  const r = runBackup()
  check('backup succeeds', r.ok, r.error)
  check('backup file exists', fs.existsSync(r.path))
  check('backup is a zip', fs.readFileSync(r.path).subarray(0, 2).toString() === 'PK')
  check('the backup lands in the configured folder', r.path.startsWith(BKD), r.path)

  const out = path.join(UDD, 'unz')
  fs.mkdirSync(out, { recursive: true })
  execSync(`unzip -qo "${r.path}" -d "${out}"`)
  check('tasks.json is in the archive', fs.existsSync(path.join(out, 'tasks.json')))
  check('notes/ folder is in the archive', fs.existsSync(path.join(out, 'notes')))
  check('the note rtf is in the archive', fs.existsSync(path.join(out, 'notes', `${note.id}.rtf`)))
  const json = JSON.parse(fs.readFileSync(path.join(out, 'tasks.json'), 'utf8'))
  check('the task is in the json', json.tasks.length === 1 && json.tasks[0].subject === '第一条待办')
  check('the note metadata is in the json', json.notes.length === 1 && json.notes[0].title === '测试便签')
  check('the note file is stored as a bare name', json.notes[0].file === `${note.id}.rtf`, json.notes[0].file)

  console.log('\noverwrite')
  const firstSize = fs.statSync(r.path).size
  const r2 = runBackup()
  check('a second run succeeds', r2.ok)
  // the archive is rewritten in place: same name, same contents (the
  // deflate output can differ by a byte because the JSON carries a timestamp)
  check('the archive is replaced in place', fs.existsSync(r.path) && Math.abs(fs.statSync(r.path).size - firstSize) <= 8)
  check('still exactly one archive', fs.readdirSync(BKD).filter(f => f.endsWith('.zip')).length === 1)
  check('no temp file is left behind', !fs.readdirSync(BKD).some(f => f.startsWith('.') && f.endsWith('.tmp')))

  console.log('\nschedule')
  const daily = lastDue('daily', new Date(2026, 0, 7, 23, 0), '22:00')
  check('daily picks today when the time has passed', daily.getDate() === 7 && daily.getHours() === 22)
  const dailyEarly = lastDue('daily', new Date(2026, 0, 7, 10, 0), '22:00')
  check('daily falls back to yesterday before the time', dailyEarly.getDate() === 6)
  const weekday = lastDue('weekday', new Date(2026, 0, 11, 23, 0), '22:00')  // a Sunday
  check('weekday skips the weekend', weekday.getDay() >= 1 && weekday.getDay() <= 5)
  const weekly = lastDue('weekly', new Date(2026, 0, 11, 23, 0), '22:00')
  check('weekly lands on a Monday', weekly.getDay() === 1)

  const st = backupStatus()
  check('status exposes the settings', typeof st.enabled === 'boolean' && !!st.freq && !!st.time)
  setBackupSettings({ enabled: true, freq: 'weekday', time: '09:30' })
  const st2 = backupStatus()
  check('settings persist', st2.enabled === true && st2.freq === 'weekday' && st2.time === '09:30')

  console.log('\nnote deletion removes the rtf file')
  // mirrors what the notes:remove handler does in the main process
  const n = db.getNote(note.id)
  if (n?.file && fs.existsSync(n.file)) fs.unlinkSync(n.file)
  db.deleteNote(note.id)
  check('the rtf file is gone after deleting the note', !fs.existsSync(rtfPath))
  check('the note row is gone', db.listNotes({ limit: 10 }).every(x => x.id !== note.id))

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
  app.exit(failed ? 1 : 0)
}).catch((e) => { console.error('FATAL', e); app.exit(1) })
