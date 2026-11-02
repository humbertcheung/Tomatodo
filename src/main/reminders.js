/**
 * Reminder scheduler — checks due reminders every 30s and posts native
 * notifications (observed surface: reminders with/without time, "Due Today"
 * notifications). Original implementation.
 */
import { Notification } from 'electron'
import { querySmartList, getSetting, setSetting } from './db'

let timer = null
let firedKeys = new Set()
let mainWindowRef = null
let trayRef = null

export function startReminders({ getWindow, tray }) {
  mainWindowRef = getWindow
  trayRef = tray
  // restore fired keys for today so restarts don't double-fire
  const dayKey = new Date().toISOString().slice(0, 10)
  const saved = getSetting(`fired_${dayKey}`, [])
  firedKeys = new Set(saved)
  timer = setInterval(tick, 30_000)
  setTimeout(tick, 3_000)
}

export function stopReminders() {
  if (timer) clearInterval(timer)
  timer = null
}

function persistFired() {
  const dayKey = new Date().toISOString().slice(0, 10)
  setSetting(`fired_${dayKey}`, [...firedKeys].slice(-200))
}

function tick() {
  try {
    const now = Date.now()
    const tasks = querySmartList('planned', {})
    for (const t of tasks) {
      // reminder_date fires exactly once
      if (t.reminder_date) {
        const r = Date.parse(t.reminder_date)
        if (!Number.isNaN(r) && r <= now && now - r < 60 * 60 * 1000) {
          fireOnce(`r_${t.id}`, t.subject, t.reminder_date)
        }
      }
    }
    // "Due Today" digest notification (observed toggle: settings_general "Due Today notifications")
    const dueEnabled = getSetting('due_today_notifications', true)
    const time = getSetting('due_today_time', '09:00')
    if (dueEnabled) {
      const nowD = new Date()
      const hhmm = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`
      const todayISO = localYMD(nowD)
      if (hhmm === time) {
        const due = tasks.filter((t) => t.due_date === todayISO)
        if (due.length) {
          fireOnce(`due_${todayISO}`, langTitle(due.length), null)
        }
      }
    }
    persistFired()
  } catch (e) {
    console.error('reminder tick failed:', e)
  }
}

function langTitle(n) {
  // simple bilingual title; the renderer sets language but main keeps both minimal
  return n === 1 ? 'You have 1 task due today · 今天有 1 个到期任务' : `You have ${n} tasks due today · 今天有 ${n} 个到期任务`
}

function fireOnce(key, body, whenISO) {
  if (firedKeys.has(key)) return
  firedKeys.add(key)
  const n = new Notification({
    title: 'Tomatodo',
    body,
    silent: !getSetting('play_completion_sound', true) ? false : false
  })
  n.on('click', () => {
    const w = mainWindowRef ? mainWindowRef() : null
    if (w) { w.show(); w.focus() }
  })
  n.show()
}

function localYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
