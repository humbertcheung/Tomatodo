/**
 * Widget data — builds the small JSON snapshot the WidgetKit extension renders.
 *
 * The extension is sandboxed (the widget gallery requires it), so it cannot
 * read the app's files: the data is served live over a localhost HTTP server
 * (see widget-server.js), which the extension reaches with its
 * `com.apple.security.network.client` entitlement.
 */
import { app } from 'electron'
import { querySmartList, listNotes, overviewForTray, getSetting } from './db.js'
import { getPomodoro } from './pomodoro.js'

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** the app's UI language — the widget follows it */
function uiLang() {
  const pref = getSetting('language', 'system')
  if (pref === 'zh' || pref === 'en') return pref
  try {
    return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
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
  const dueToday = planned.filter((x) => x.due_date === todayYMD())
  // "今日待办" = My Day + everything due today (a task can be in both)
  const myDay = querySmartList('myday', {}).filter((x) => x.status !== 'completed')
  const todayMap = new Map()
  for (const t of [...myDay, ...dueToday]) todayMap.set(t.id, t)
  const today = [...todayMap.values()].sort((a, b) => {
    const rank = (x) => (x.my_day_date === todayYMD() ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    const ad = a.due_date || a.reminder_date || '9999-12-31'
    const bd = b.due_date || b.reminder_date || '9999-12-31'
    return ad < bd ? -1 : ad > bd ? 1 : 0
  })

  // the pomodoro block drives the widget's tomato card
  const remainingMs = Math.max(0, pomo?.remainingMs ?? 0)
  const totalMs = Math.max(1, pomo?.totalMs ?? 1)
  const elapsedPct = Math.max(0, Math.min(100, Math.round((1 - remainingMs / totalMs) * 100)))
  // "active" = the timer was started (running, paused, or part-way through)
  const pomodoroActive = !!pomo?.running || remainingMs < totalMs

  return {
    generatedAt: new Date().toISOString(),
    lang: uiLang(),
    todayCount: today.length,
    plannedCount: planned.length,
    noteCount: ov?.notes ?? notes.length,
    pomodoroSeconds: Math.round(remainingMs / 1000),
    pomodoroRunning: !!pomo?.running,
    pomodoroActive,
    pomodoroMode: pomo?.mode === 'break' ? 'break' : 'work',
    pomodoroTotalMs: totalMs,
    pomodoroElapsedPct: elapsedPct,
    pomodoroSessions: pomo?.sessionsToday ?? 0,
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
