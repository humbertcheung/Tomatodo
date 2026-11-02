/**
 * Natural-language date recognition for task titles — original implementation
 * of the observed "smart due dates" behavior (recognize dates/times in task
 * titles, lift them into due/reminder fields, and strip them from the title).
 *
 * parseSmartDate("周五给妈妈打电话") → { subject, dueDate, hasTime }
 */

const WEEKDAYS_ZH = { 周一:1, 周二:2, 周三:3, 周四:4, 周五:5, 周六:6, 周日:0, 星期一:1, 星期二:2, 星期三:3, 星期四:4, 星期五:5, 星期六:6, 星期日:0 }
const WEEKDAYS_EN = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 }
const NUM_ZH = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 两:2 }

function atDayStart(d, daysAhead = 0) {
  const x = new Date(d)
  x.setDate(x.getDate() + daysAhead)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function nextWeekday(base, weekday) {
  const cur = base.getDay()
  let delta = (weekday - cur + 7) % 7
  if (delta === 0) delta = 7
  return atDayStart(base, delta)
}

function monthDayThisOrNext(base, month1to12, day) {
  let y = base.getFullYear()
  let cand = new Date(y, month1to12 - 1, day)
  if (cand < new Date(y, base.getMonth(), base.getDate())) cand = new Date(y + 1, month1to12 - 1, day)
  return `${cand.getFullYear()}-${String(cand.getMonth() + 1).padStart(2, '0')}-${String(cand.getDate()).padStart(2, '0')}`
}

/**
 * @returns {{ subject: string, dueDate: string|null, hasTime: boolean, reminder: string|null }}
 */
export function parseSmartDate(raw) {
  let text = String(raw || '').trim()
  const base = new Date()
  let dueDate = null
  let hasTime = false
  let reminder = null
  const strip = []

  // time: 3点 / 15:30 / 3点半 / 下午3点 / 3点20
  const timeRe = /(上午|早上|下午|晚上|中午)?\s*(\d{1,2})[点时:：](半|\d{1,2})?分?/
  const mTime = text.match(timeRe)
  let hour = null, minute = 0
  if (mTime) {
    hour = parseInt(mTime[2], 10)
    if (mTime[3] === '半') minute = 30
    else if (mTime[3]) minute = parseInt(mTime[3], 10)
    if (mTime[1] && hour <= 12) {
      if (mTime[1] === '下午' || mTime[1] === '晚上') hour = hour === 12 ? 12 : hour + 12
      if (mTime[1] === '中午' && hour === 12) hour = 12
    }
    hasTime = true
    strip.push(mTime[0].trim())
  }

  // English relative words first
  const enRel = [
    { re: /\btoday\b/i, d: 0 },
    { re: /\btomorrow\b/i, d: 1 },
    { re: /\bnext week\b/i, d: 7 },
  ]
  for (const r of enRel) {
    if (!dueDate && r.re.test(text)) {
      dueDate = atDayStart(base, r.d)
      strip.push(text.match(r.re)[0])
    }
  }

  // Chinese relative: 今天 明天 后天 大后天 下周/下周X
  if (!dueDate) {
    if (/今天/.test(text)) { dueDate = atDayStart(base, 0); strip.push('今天') }
    else if (/明天/.test(text)) { dueDate = atDayStart(base, 1); strip.push('明天') }
    else if (/后天/.test(text)) { dueDate = atDayStart(base, 2); strip.push('后天') }
    else if (/大后天/.test(text)) { dueDate = atDayStart(base, 3); strip.push('大后天') }
  }

  // 下周X / 周X / 星期X
  if (!dueDate) {
    const mNextW = text.match(/(下|下下)?(周|星期)([一二三四五六日天])/)
    if (mNextW) {
      const wd = WEEKDAYS_ZH[(mNextW[2] === '周' ? '周' : '星期') + mNextW[3]] ?? WEEKDAYS_ZH['周' + mNextW[3]]
      const days = mNextW[1] === '下下' ? 14 : mNextW[1] === '下' ? 7 : 0
      dueDate = nextWeekday(base, wd)
      if (days) {
        const d = new Date(base); d.setDate(d.getDate() + days)
        dueDate = nextWeekday(d, wd)
      }
      strip.push(mNextW[0])
    }
  }

  // English weekday
  if (!dueDate) {
    const mEn = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
    if (mEn) { dueDate = nextWeekday(base, WEEKDAYS_EN[mEn[1].toLowerCase()]); strip.push(mEn[0]) }
  }

  // 月/日: 10月31日, 10-31, 10/31
  if (!dueDate) {
    let m = text.match(/(\d{1,2})月(\d{1,2})[日号]/)
    if (!m) m = text.match(/(\d{1,2})[\/\-](\d{1,2})\b/)
    if (m) {
      const mo = parseInt(m[1], 10), dy = parseInt(m[2], 10)
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        dueDate = monthDayThisOrNext(base, mo, dy)
        strip.push(m[0])
      }
    }
  }

  // "下周" bare
  if (!dueDate && /下周/.test(text)) { dueDate = atDayStart(base, 7); strip.push('下周') }

  // build subject
  let subject = text
  for (const s of strip) subject = subject.replace(s, '')
  subject = subject.replace(/\s{2,}/g, ' ').replace(/^[\s,，。.]+|[\s,，。.]+$/g, '').trim()
  if (!subject) subject = text.trim()

  if (dueDate && hasTime && hour !== null) {
    const [y, m, d] = dueDate.split('-').map(Number)
    reminder = new Date(y, m - 1, d, hour, minute, 0).toISOString()
  }
  return { subject, dueDate, hasTime, reminder }
}
