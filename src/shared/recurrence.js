/**
 * Recurrence model — original implementation of the observed recurrence
 * surface: { type: daily|weekly|monthly|yearly, interval, weekdays[], hasTime }
 * Completing a recurring task derives the next occurrence (observed behavior:
 * the next instance appears with the next due date).
 */

const WEEKDAY_MS = 24 * 60 * 60 * 1000

function parseYMD(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Compute the next due date (yyyy-mm-dd) strictly after `fromYMD`. */
export function nextDue(recurrence, fromYMD) {
  if (!recurrence || !fromYMD) return null
  const from = parseYMD(fromYMD)
  const interval = Math.max(1, Number(recurrence.interval) || 1)

  switch (recurrence.type) {
    case 'daily': {
      const d = new Date(from.getTime() + interval * WEEKDAY_MS)
      return fmtYMD(d)
    }
    case 'weekly': {
      const weekdays = Array.isArray(recurrence.weekdays) && recurrence.weekdays.length
        ? [...recurrence.weekdays].sort((a, b) => a - b)
        : [from.getDay()]
      // find next selected weekday after `from`
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const cand = new Date(from.getTime() + i * WEEKDAY_MS)
        if (weekdays.includes(cand.getDay())) {
          // honor interval: weeks between occurrences
          const weekDiff = Math.floor((i - 1) / 7)
          if (interval === 1 || weekDiff % interval === 0) return fmtYMD(cand)
        }
      }
      return fmtYMD(new Date(from.getTime() + 7 * interval * WEEKDAY_MS))
    }
    case 'monthly': {
      const day = from.getDate()
      const cand = new Date(from.getFullYear(), from.getMonth() + interval, 1)
      const last = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate()
      cand.setDate(Math.min(day, last))
      return fmtYMD(cand)
    }
    case 'yearly': {
      const cand = new Date(from.getFullYear() + interval, from.getMonth(), 1)
      const last = new Date(cand.getFullYear(), cand.getMonth() + 1, 0).getDate()
      cand.setDate(Math.min(from.getDate(), last))
      return fmtYMD(cand)
    }
    default:
      return null
  }
}

/** Given a completed task row, derive the next occurrence task payload (or null). */
export function deriveNextOccurrence(task) {
  let rec
  try { rec = JSON.parse(task.recurrence_json || 'null') } catch { rec = null }
  if (!rec) return null
  const from = task.due_date || new Date().toISOString().slice(0, 10)
  const nd = nextDue(rec, from)
  if (!nd) return null
  return {
    subject: task.subject,
    note_html: task.note_html || '',
    importance: task.importance || 'normal',
    due_date: nd,
    due_has_time: task.due_has_time ? 1 : 0,
    reminder_date: task.reminder_date ? shiftReminder(task.reminder_date, from, nd) : null,
    recurrence_json: task.recurrence_json,
    my_day_date: task.my_day_date === from ? nd : task.my_day_date
  }
}

function shiftReminder(reminderISO, oldDueYMD, newDueYMD) {
  // preserve the time-of-day of the reminder, move to the new due date
  const r = new Date(reminderISO)
  const [y, m, d] = newDueYMD.split('-').map(Number)
  return new Date(y, m - 1, d, r.getHours(), r.getMinutes(), 0).toISOString()
}

export function describeRecurrence(rec, lang = 'zh') {
  if (!rec || !rec.type) return null
  const i = Math.max(1, Number(rec.interval) || 1)
  const zh = {
    daily: (i) => (i === 1 ? '每天' : `每 ${i} 天`),
    weekly: (i) => (i === 1 ? '每周' : `每 ${i} 周`),
    monthly: (i) => (i === 1 ? '每月' : `每 ${i} 月`),
    yearly: (i) => (i === 1 ? '每年' : `每 ${i} 年`)
  }
  const en = {
    daily: (i) => (i === 1 ? 'Daily' : `Every ${i} days`),
    weekly: (i) => (i === 1 ? 'Weekly' : `Every ${i} weeks`),
    monthly: (i) => (i === 1 ? 'Monthly' : `Every ${i} months`),
    yearly: (i) => (i === 1 ? 'Yearly' : `Every ${i} years`)
  }
  const t = (lang === 'zh' ? zh : en)[rec.type]?.(i) ?? rec.type
  if (rec.type === 'weekly' && Array.isArray(rec.weekdays) && rec.weekdays.length) {
    const names = lang === 'zh'
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const wd = [...rec.weekdays].sort((a, b) => a - b).map((d) => names[d]).join(lang === 'zh' ? '、' : ', ')
    return lang === 'zh' ? `每周（${wd}）` : `Weekly on ${wd}`
  }
  return t
}
