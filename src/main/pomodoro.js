/**
 * Pomodoro service — runs in the main process so timing stays accurate while
 * windows are hidden; broadcasts ticks, notifies on phase completion, and can
 * surface a countdown in the tray tooltip.
 */
import { Notification, BrowserWindow } from 'electron'
import { getSetting, setSetting } from './db'

const state = {
  running: false,
  mode: 'work',            // 'work' | 'break'
  totalMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  timer: null,
  sessionsToday: 0,
  dayKey: new Date().toDateString()
}

function workMs() { return Math.max(1, Number(getSetting('pomodoroWork', 25))) * 60 * 1000 }
function breakMs() { return Math.max(1, Number(getSetting('pomodoroBreak', 5))) * 60 * 1000 }

export function getPomodoro() {
  return {
    running: state.running,
    mode: state.mode,
    remainingMs: state.remainingMs,
    totalMs: state.totalMs,
    sessionsToday: state.sessionsToday
  }
}

let tickHook = null
export function setPomodoroTickHook(fn) { tickHook = fn }

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('pomodoro:tick', getPomodoro())
  }
  if (tickHook) { try { tickHook(getPomodoro()) } catch { /* hook error is non-fatal */ } }
}

function startTimer() {
  stopTimer()
  state.timer = setInterval(tick, 1000)
}

function stopTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null }
}

function tick() {
  if (!state.running) return
  state.remainingMs -= 1000
  if (state.remainingMs <= 0) {
    phaseComplete()
  }
  broadcast()
}

function phaseComplete() {
  stopTimer()
  const finishedWork = state.mode === 'work'
  if (finishedWork) {
    rollDayKey()
    state.sessionsToday += 1
    setSetting('pomodoroSessions', { day: state.dayKey, n: state.sessionsToday })
  }
  notify(finishedWork ? '🍅 专注完成！' : '☕ 休息结束', finishedWork ? '休息一下，5 分钟后继续' : '开始新一轮专注')
  state.mode = finishedWork ? 'break' : 'work'
  state.totalMs = finishedWork ? breakMs() : workMs()
  state.remainingMs = state.totalMs
  state.running = false // manual start for the next phase (gentle default)
  broadcast()
}

function notify(title, body) {
  try {
    const n = new Notification({ title, body, silent: getSetting('playSound', true) ? false : false })
    n.on('click', () => { for (const w of BrowserWindow.getAllWindows()) { w.show(); w.focus() } })
    n.show()
  } catch { /* notifications unavailable */ }
}

function rollDayKey() {
  const today = new Date().toDateString()
  if (today !== state.dayKey) {
    state.dayKey = today
    state.sessionsToday = 0
  }
}

export function startPomodoro(mode = null, minutes = null) {
  rollDayKey()
  if (mode && mode !== state.mode) {
    state.mode = mode
    state.totalMs = (mode === 'break' ? breakMs() : workMs())
    state.remainingMs = state.totalMs
  }
  if (minutes) {
    state.totalMs = Math.max(1, Number(minutes)) * 60 * 1000
    state.remainingMs = state.totalMs
  }
  if (!state.running && state.remainingMs === state.totalMs && !minutes) {
    // fresh start
  }
  state.running = true
  startTimer()
  broadcast()
  return getPomodoro()
}

export function pausePomodoro() {
  state.running = false
  stopTimer()
  broadcast()
  return getPomodoro()
}

export function resetPomodoro(mode = null) {
  stopTimer()
  if (mode) state.mode = mode
  state.totalMs = state.mode === 'break' ? breakMs() : workMs()
  state.remainingMs = state.totalMs
  state.running = false
  broadcast()
  return getPomodoro()
}

export function restorePomodoro() {
  const saved = getSetting('pomodoroSessions', null)
  if (saved && saved.day === new Date().toDateString()) state.sessionsToday = Number(saved.n) || 0
  resetPomodoro()
}
