/**
 * Widget bridge — publishes a small JSON snapshot for the WidgetKit
 * extension, so the desktop widgets can render without touching the
 * database (and without a SQLite dependency in the extension).
 *
 * Data channel: the App Group container
 *   ~/Library/Group Containers/HDEN58Z6QL.group.cc.humbert.tomatodo/
 * The app (not sandboxed) writes the snapshot AND polls the pending-action
 * file the widget's intents write (toggle task, …).
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { querySmartList, listNotes, overviewForTray, getTask, updateTask } from './db.js'
import { getPomodoro } from './pomodoro.js'

const TEAM_ID = 'HDEN58Z6QL'
const GROUP = `${TEAM_ID}.group.cc.humbert.tomatodo`
const FILE_NAME = 'widget-snapshot.json'
const ACTIONS_NAME = 'widget-actions.json'

function groupContainerDir() {
  return path.join(app.getPath('home'), 'Library', 'Group Containers', GROUP)
}

function groupFile(name) {
  return path.join(groupContainerDir(), name)
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** build the snapshot object */
export function buildSnapshot() {
  const ov = overviewForTray()
  const planned = querySmartList('planned', {})
    .filter((x) => x.status !== 'completed')
    .sort((a, b) => {
      const ad = a.due_date || a.reminder_date || '9999-12-31'
      const bd = b.due_date || b.reminder_date || '9999-12-31'
      return ad < bd ? -1 : ad > bd ? 1 : 0
    })

  const notes = listNotes({ limit: 12 })

  const pomo = getPomodoro()
  const today = planned.filter((x) => x.due_date === todayYMD())

  return {
    generatedAt: new Date().toISOString(),
    todayCount: ov?.myday ?? today.length,
    plannedCount: planned.length,
    noteCount: ov?.notes ?? notes.length,
    pomodoroSeconds: Math.round((pomo?.remainingMs ?? 0) / 1000),
    pomodoroRunning: !!pomo?.running,
    today: today.slice(0, 10).map((t) => ({
      id: t.id,
      subject: t.subject,
      due: t.due_date,
      important: t.importance === 'important',
      done: t.status === 'completed',
      color: 'blue'
    })),
    planned: planned.slice(0, 10).map((t) => ({
      id: t.id,
      subject: t.subject,
      due: t.due_date,
      important: t.importance === 'important',
      done: t.status === 'completed',
      color: 'blue'
    })),
    notes: notes.slice(0, 10).map((n) => ({
      id: n.id,
      title: n.title || '',
      preview: (n.preview || '').slice(0, 120),
      color: n.color || 'yellow',
      pinned: !!n.pinned,
      updated: (n.updated_at || '').slice(0, 10)
    }))
  }
}

/**
 * Publish the snapshot into the app's data folder — the extension (not
 * sandboxed) reads it from there directly.
 */
export function publishWidgetSnapshot() {
  try {
    const payload = JSON.stringify(buildSnapshot())
    fs.writeFileSync(path.join(app.getPath('userData'), FILE_NAME), payload, 'utf8')
    return true
  } catch (e) {
    console.error('WIDGET PUBLISH FAILED:', e?.message || e)
    return false
  }
}

/**
 * Apply the actions the widget intents queued in the app's data folder.
 */
function applyWidgetActions() {
  const file = path.join(app.getPath('userData'), ACTIONS_NAME)
  let list
  try {
    if (!fs.existsSync(file)) return
    list = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch { return }
  if (!Array.isArray(list) || !list.length) return

  let applied = 0
  for (const a of list) {
    try {
      if (a.type === 'toggleTask' && a.id) {
        const t = getTask(a.id)
        if (t) {
          const done = t.status === 'completed'
          updateTask(a.id, {
            status: done ? 'notCompleted' : 'completed',
            completed_at: done ? null : new Date().toISOString()
          })
          applied++
        }
      }
    } catch { /* skip one bad action */ }
  }
  try { fs.writeFileSync(file, '[]', 'utf8') } catch { /* ignore */ }
  if (applied) {
    console.log(`[widget] applied ${applied} action(s)`)
    // tell every renderer the data changed (no import cycle: send directly)
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('db:changed')
    }
  }
}

let actionsTimer = null

/** start polling the widget's pending actions (every 2 s) */
export function startWidgetActionBridge() {
  if (actionsTimer) return
  applyWidgetActions()
  actionsTimer = setInterval(applyWidgetActions, 2000)
}
