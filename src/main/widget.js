/**
 * Widget data — builds the small JSON snapshot the WidgetKit extension renders.
 *
 * The extension is sandboxed (the widget gallery requires it), so it cannot
 * read the app's files: the data is served live over a localhost HTTP server
 * (see widget-server.js), which the extension reaches with its
 * `com.apple.security.network.client` entitlement.
 */
import { querySmartList, listNotes, overviewForTray } from './db.js'
import { getPomodoro } from './pomodoro.js'

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
