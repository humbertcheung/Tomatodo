/**
 * Menu bar (Tray) integration v2 — persistent menu bar icon, quick panel with
 * todo capture + full note list (max height 50% of screen), pomodoro-aware
 * tooltip. Original implementation.
 */
import { app, Tray, Menu, nativeImage, BrowserWindow, screen, ipcMain, globalShortcut } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { t } from '@shared/i18n-mini'
import {
  overviewForTray, createTask, updateTask, getSetting, setSetting,
  querySmartList, listNotes, createNote, ensureInboxId
} from './db'
import { parseSmartDate } from '@shared/nlp'
import { getPomodoro } from './pomodoro'
import { TRAY_ICONS } from './tray-icons'

let tray = null
let quickWin = null
let mainWindowRef = null

/**
 * Menu bar icon — the colored tomato cutout (no background), sized for the
 * standard 18 pt macOS menu bar slot.
 *
 * A PNG carries no scale metadata, so feeding the @2x asset straight to
 * nativeImage makes macOS draw it at 36 pt — twice the size of every other
 * menu bar item. The icon must therefore be built from the 1x asset with the
 * 2x one registered as a scaleFactor-2 representation.
 */
function trayIcon() {
  const colored = getSetting('trayIconStyle', 'color') !== 'template'
  // embedded menu bar icons (no file-path dependency in any packaging mode)
  try {
    const set = colored ? TRAY_ICONS.color : TRAY_ICONS.template
    const img = nativeImage.createFromDataURL(set['1x'])
    if (!img.isEmpty()) {
      if (set['2x']) img.addRepresentation({ scaleFactor: 2, dataURL: set['2x'] })
      if (!colored) img.setTemplateImage(true)
      return img
    }
  } catch { /* fall back to files */ }
  // fallback: files on disk
  const file = colored ? 'trayTemplateColor.png' : 'trayTemplate.png'
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, file) : null,
    path.join(__dirname, '..', '..', 'resources', file)
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          if (!colored) img.setTemplateImage(true)
          return img
        }
      }
    } catch { /* try next candidate */ }
  }
  // fallback: simple filled circle silhouette
  const size = 18
  const buf = Buffer.alloc(size * size * 4)
  const set = (x, y, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = Math.round(a * 255)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 8.5, y - 10.5)
      if (d <= 6.4) set(x, y, 0.95)
      if (y <= 4 && Math.abs(x - 8.5) <= 2.6) set(x, y, 0.95)
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size })
  img.setTemplateImage(true)
  return img
}

export function setupTray({ getMainWindow }) {
  mainWindowRef = getMainWindow
  // restore the dragged position of the quick panel (if the user moved it)
  try {
    const saved = getSetting('quickPanelPos', null)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) quickPos = { x: saved.x, y: saved.y }
  } catch { /* first run */ }

  ipcMain.handle('tray:quickAdd', async (_e, payload) => quickAddFromPanel(payload))
  ipcMain.handle('quick:close', () => hideQuick())
  ipcMain.handle('quick:openMain', () => { openMainWindow(); hideQuick() })
  // starting the timer from the panel → show the app's minimal tomato card
  ipcMain.handle('quick:openFocus', () => {
    const w = mainWindowRef()
    if (!w) return false
    openMainWindow()
    // a renderer that is still loading would drop the message
    if (w.webContents.isLoading()) {
      w.webContents.once('did-finish-load', () => {
        if (!w.isDestroyed()) w.webContents.send('app:focusMode', true)
      })
    } else {
      w.webContents.send('app:focusMode', true)
    }
    hideQuick()
    return true
  })
  ipcMain.handle('quick:data', () => buildQuickData())
  // the panel can be pinned above other windows (置顶)
  ipcMain.handle('quick:alwaysOnTop', (_e, on) => {
    const pinned = !!on
    setSetting('quickPanelPinned', pinned)
    applyQuickPin()
    return pinned
  })
  ipcMain.handle('quick:isAlwaysOnTop', () => !!getSetting('quickPanelPinned', false))
  ipcMain.handle('quick:toggleDone', (_e, id, done) => {
    updateTask(id, { status: done ? 'completed' : 'notCompleted', completed_at: done ? new Date().toISOString() : null })
    refreshTrayMenu()
    return true
  })
  ipcMain.handle('quick:openNote', (_e, id) => {
    openMainWindow()
    const w = mainWindowRef()
    if (w) w.webContents.send('app:openNote', id)
    hideQuick()
    return true
  })

  rebuildTray()
  registerGlobalShortcut()
}

export function rebuildTray() {
  const enabled = getSetting('showTray', true)
  if (!enabled) {
    if (tray) { tray.destroy(); tray = null }
    return
  }
  if (!tray) {
    tray = new Tray(trayIcon())
    // macOS: setting a context menu makes LEFT click open it too, which would
    // block the quick panel. Keep the menu for right-click only.
    tray.on('click', () => toggleQuickPanel())
    tray.on('right-click', () => popUpTrayMenu())
  }
  refreshTrayMenu()
  updateTrayTitle()
}

export function refreshTrayMenu() {
  if (!tray) return
  const ov = overviewForTray()
  const pomo = getPomodoro()
  const pomoLabel = pomo.running
    ? `⏱ ${pomo.mode === 'work' ? '专注' : '休息'} ${fmtMs(pomo.remainingMs)} · 番茄钟`
    : `🍅 番茄钟（今日 ${pomo.sessionsToday} 个）`
  const items = [
    { label: t('tray.openApp'), click: () => openMainWindow() },
    { label: t('tray.quickAdd'), accelerator: getSetting('globalShortcut', 'CommandOrControl+Alt+T'), click: () => toggleQuickPanel(true) },
    {
      label: pomoLabel,
      click: () => {
        openMainWindow()
        const w = mainWindowRef()
        if (w) w.webContents.send('app:command', 'open-pomodoro')
      }
    },
    { type: 'separator' },
    { label: `☀ ${t('tray.mydayCount', { n: ov.myday })}   📅 ${ov.due}   📝 ${listNotes({ limit: 1 }).length ? '✓' : '0'}`, enabled: false },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => { globalShortcut.unregisterAll(); app.quit() } }
  ]
  const menu = Menu.buildFromTemplate(items)
  if (process.platform === 'darwin') {
    trayContextMenu = menu
  } else {
    tray.setContextMenu(menu)
  }
}

let trayContextMenu = null

/** right-click menu (macOS path) */
export function popUpTrayMenu() {
  if (!tray) return
  refreshTrayMenu()
  if (trayContextMenu) tray.popUpContextMenu(trayContextMenu)
  else tray.popUpContextMenu()
}

function fmtMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function updateTrayTitle() {
  if (!tray) return
  const pomo = getPomodoro()
  if (pomo.running) {
    tray.setTitle(fmtMs(pomo.remainingMs), { fontType: 'monospacedDigit' })
  } else {
    tray.setTitle('')
  }
  tray.setImage(trayIcon())
}

export function registerGlobalShortcut() {
  globalShortcut.unregisterAll()
  const raw = getSetting('globalShortcut', 'CommandOrControl+Alt+T')
  // a stored accelerator may carry duplicated separators ("A++B") — Electron
  // cannot register those, so normalise before use
  const sc = String(raw || '').split('+').filter(Boolean).join('+')
  if (sc) {
    try {
      globalShortcut.register(sc, () => toggleQuickPanel(true))
      if (sc !== raw) setSetting('globalShortcut', sc)
    } catch (e) { console.error('global shortcut failed', e) }
  }
}

// ---------- quick panel window ----------

// the panel can be dragged by its header; the position is remembered so it
// reopens where the user left it instead of snapping back under the tray
let quickPos = null
let quickPosSaveTimer = null

function rememberQuickPos() {
  clearTimeout(quickPosSaveTimer)
  quickPosSaveTimer = setTimeout(() => {
    if (!quickPos) return
    try { setSetting('quickPanelPos', quickPos) } catch { /* ignore */ }
  }, 400)
}

/** the user-resized panel size is persisted the same way as its position */
const QUICK_MIN = { w: 360, h: 400 }
const QUICK_MAX = { w: 800, h: 1400 }
let quickSizeSaveTimer = null

function rememberQuickSize() {
  clearTimeout(quickSizeSaveTimer)
  quickSizeSaveTimer = setTimeout(() => {
    if (!quickWin || quickWin.isDestroyed()) return
    try {
      const [w, h] = quickWin.getSize()
      setSetting('quickPanelSize', { w, h })
    } catch { /* ignore */ }
  }, 400)
}

/** apply the pinned (always-on-top) state to the panel */
function applyQuickPin() {
  if (!quickWin || quickWin.isDestroyed()) return
  const pinned = !!getSetting('quickPanelPinned', false)
  quickWin.setAlwaysOnTop(pinned, 'floating')
}

function ensureQuickWindow() {
  if (quickWin && !quickWin.isDestroyed()) return quickWin
  quickWin = new BrowserWindow({
    width: 400,
    height: 520,
    minWidth: QUICK_MIN.w,
    minHeight: QUICK_MIN.h,
    show: false,
    frame: false,
    // frameless but user-resizable: the OS draws invisible resize edges on
    // the bottom / left / right borders (the top edge is the drag header)
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: false,
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    alwaysOnTop: !!getSetting('quickPanelPinned', false),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: ['--quick-panel']
    }
  })
  quickWin.loadFile(path.join(__dirname, '../renderer/quick.html'))
  quickWin.on('move', () => {
    if (!quickWin || quickWin.isDestroyed()) return
    const [x, y] = quickWin.getPosition()
    quickPos = { x, y }
    rememberQuickPos()
  })
  quickWin.on('resize', () => {
    if (!quickWin || quickWin.isDestroyed()) return
    rememberQuickSize()
  })
  quickWin.on('blur', () => {
    // Dismiss on focus loss — but only when the panel is NOT pinned.
    // A pinned panel stays open until the tray icon is clicked again.
    // (no app.isFocused — that API does not exist in Electron)
    setTimeout(() => {
      if (!quickWin || quickWin.isDestroyed() || !quickWin.isVisible()) return
      if (quickWin.webContents.isDevToolsOpened()) return
      if (getSetting('quickPanelPinned', false)) return
      hideQuick()
    }, 150)
  })
  return quickWin
}

export function toggleQuickPanel(forceAdd = false) {
  if (quickWin && quickWin.isVisible()) { hideQuick(); return }
  showQuickPanel(forceAdd)
}

export function showQuickPanel(forceAdd = false) {
  const win = ensureQuickWindow()
  const display = screen.getPrimaryDisplay()
  const wa = display.workArea
  // reopen at the user-resized size (default: 400 × half of the work area),
  // clamped into the CURRENT work area so a smaller display can't crop it
  const saved = getSetting('quickPanelSize', null)
  const maxW = Math.min(QUICK_MAX.w, wa.width - 16)
  const maxH = Math.min(QUICK_MAX.h, wa.height - 12)
  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)))
  const w = clamp(saved?.w || 400, QUICK_MIN.w, maxW)
  const h = clamp(saved?.h || Math.min(560, Math.floor(wa.height * 0.5)), QUICK_MIN.h, maxH)
  win.setSize(w, h, false)

  let x, y
  if (quickPos) {
    // reopen where the user dragged it, fully inside the work area
    x = clamp(quickPos.x, wa.x + 8, wa.x + wa.width - w - 8)
    y = clamp(quickPos.y, wa.y + 4, wa.y + wa.height - h - 4)
  } else {
    const trayBounds = tray ? tray.getBounds() : null
    if (trayBounds && trayBounds.width > 0) {
      x = clamp(Math.round(trayBounds.x + trayBounds.width / 2 - w / 2), wa.x + 8, wa.x + wa.width - w - 8)
      y = wa.y + 6
    } else {
      x = wa.x + wa.width - w - 12
      y = wa.y + 6
    }
  }
  win.setPosition(x, y, false)
  applyQuickPin()
  win.show()
  win.focus()
  win.webContents.send('quick:show', { forceAdd })
  refreshTrayMenu()
}

export function hideQuick() {
  if (quickWin && quickWin.isVisible()) quickWin.hide()
}

export function openMainWindow() {
  const w = mainWindowRef()
  if (w) {
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }
}

async function quickAddFromPanel(payload) {
  if (!payload || !String(payload.subject || '').trim()) return null
  if (payload.kind === 'note') {
    const text = String(payload.subject).trim()
    const lines = text.split('\n')
    const title = lines[0].slice(0, 60) || '未命名便签'
    const content = lines.slice(1).join('\n')
    const note = createNote({ title, content, color: payload.color || 'yellow' })
    const w = mainWindowRef()
    if (w) w.webContents.send('db:changed')
    return note
  }
  const s = parseSmartDate(payload.subject || '')
  const task = createTask({
    list_id: ensureInboxId(),
    subject: payload.subject,
    due_date: payload.due_date || s.dueDate,
    reminder_date: payload.reminder_date || s.reminder
  })
  refreshTrayMenu()
  updateTrayTitle()
  const w = mainWindowRef()
  if (w) w.webContents.send('db:changed')
  return task
}

function buildQuickData() {
  const ov = overviewForTray()
  // "已计划": every task that has a due date / reminder, sorted by due date
  // (undated ones last, today first)
  const planned = querySmartList('planned', {})
    .filter((x) => x.status !== 'completed')
    .sort((a, b) => {
      const ad = a.due_date || a.reminder_date || '9999-12-31'
      const bd = b.due_date || b.reminder_date || '9999-12-31'
      if (ad !== bd) return ad < bd ? -1 : 1
      if (a.importance !== b.importance) return a.importance === 'important' ? -1 : 1
      return (a.position || 0) - (b.position || 0)
    })
  const notes = listNotes({ limit: 200 })
  return { overview: ov, planned, notes }
}

function localYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function destroyTray() {
  globalShortcut.unregisterAll()
  if (tray) { tray.destroy(); tray = null }
}
