/**
 * Widget bridge — publishes a small JSON snapshot for the WidgetKit
 * extension, so the desktop widgets can render without touching the
 * database (and without a SQLite dependency in the extension).
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { querySmartList, listNotes, overviewForTray } from './db.js'
import { getPomodoro } from './pomodoro.js'

const APP_GROUP = 'group.com.humbert.tomatodo'
const FILE_NAME = 'widget-snapshot.json'

function containerURL() {
  // The App Group container only exists once the app is signed with the
  // matching entitlement, so it is optional.
  try {
    const home = app.getPath('home')
    const group = path.join(home, 'Library', 'Group Containers', APP_GROUP)
    return fs.existsSync(group) ? group : null
  } catch { return null }
}

const WIDGET_BUNDLE_ID = 'cc.humbert.todo-menubar.widget'

/**
 * The widget extension is SANDBOXED, so it can only read its own container.
 * The app is not sandboxed and may write there directly — that is the data
 * channel (an App Group would need a provisioning profile we do not have).
 */
function widgetContainerFile() {
  try {
    const home = app.getPath('home')
    return path.join(home, 'Library', 'Containers', WIDGET_BUNDLE_ID, 'Data', 'Documents', 'widget-snapshot.json')
  } catch { return null }
}

/**
 * Fallback location: the app's own data folder — used when the extension is
 * not sandboxed.
 */
function sharedFolderURL() {
  try {
    return path.join(app.getPath('userData'), 'widget-snapshot.json')
  } catch { return null }
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
 * Write the snapshot into the App Group container.
 * Silently does nothing when the group container is not available
 * (e.g. the app is not signed with the App Group entitlement).
 */
export function publishWidgetSnapshot() {
  try {
    const snap = buildSnapshot()
    const payload = JSON.stringify(snap)
    let wrote = false

    // 1) the App Group (the proper channel — used when the app is signed
    //    with the matching entitlement)
    const dir = containerURL()
    if (dir) {
      fs.writeFileSync(path.join(dir, FILE_NAME), payload, 'utf8')
      wrote = true
    }
    // 2) the widget's sandbox container — this is what a sandboxed
    //    extension can actually read
    const container = widgetContainerFile()
    if (container) {
      fs.mkdirSync(path.dirname(container), { recursive: true })
      fs.writeFileSync(container, payload, 'utf8')
      wrote = true
    }
    // 3) the app's own data folder — the fallback for a non-sandboxed build
    const shared = sharedFolderURL()
    if (shared) {
      fs.writeFileSync(shared, payload, 'utf8')
      wrote = true
    }
    return wrote
  } catch (e) {
    console.error('WIDGET PUBLISH FAILED:', e?.message || e)
    return false
  }
}
