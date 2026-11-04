/**
 * Main process entry — wires DB, windows, IPC, tray, menu, reminders.
 * Original implementation. Electron-vite bundles to CJS here.
 */
import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, nativeImage, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import * as db from './db'
import { setupTray, rebuildTray, refreshTrayMenu, updateTrayTitle, showQuickPanel, hideQuick, registerGlobalShortcut, destroyTray, openMainWindow } from './tray'
import { buildAppMenu } from './menu'
import { startReminders, stopReminders } from './reminders'
import { setMiniLang } from '@shared/i18n-mini'
import { deriveNextOccurrence } from '@shared/recurrence'
import { getPomodoro, startPomodoro, pausePomodoro, resetPomodoro, restorePomodoro, setPomodoroTickHook } from './pomodoro'
import { getWeather, invalidateWeatherCache } from './weather'
import { publishWidgetSnapshot, startWidgetActionBridge } from './widget.js'
import { htmlToRtf, htmlToText, rtfToHtml } from '@shared/rtf'
import { backupStatus, backupStatusAfter, runBackup, restoreFromBackup, openBackupDir, openNotesDir, startBackupScheduler } from './backup'

let mainWindow = null
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    openMainWindow()
    // deep link in argv on Windows/Linux
    const url = argv.find((a) => a.startsWith('ms-to-do://'))
    if (url) handleDeepLink(url)
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 360,
    minHeight: 480,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f24' : '#fafafb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (e) => {
    // close-to-tray keeps menu bar presence (observed "app icon in Dock / Menu Bar" behavior)
    if (!quitting && db.getSetting('closeToTray', true) && db.getSetting('showTray', true)) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // headless UI review hook: TODOMENU_SHOT=<dir> captures screenshots then quits
  if (process.env.TODOMENU_SHOT) {
    const shotDir = process.env.TODOMENU_SHOT
    fs.mkdirSync(shotDir, { recursive: true })
    if (process.env.TODOMENU_DARK) db.setSetting('theme', 'dark')
    mainWindow.once('ready-to-show', async () => {
      mainWindow.show()
      if (process.env.TODOMENU_DEMO) { seedDemo(); broadcastChanged() }
      await new Promise((r) => setTimeout(r, 1600))
      // give async side panels (weather) time to resolve before capturing
      if (process.env.TODOMENU_WEATHER_WAIT !== '0') await new Promise((r) => setTimeout(r, 9000))
      try {
        // weather IPC probe (diagnostics)
        if (process.env.TODOMENU_WXDEBUG) {
          try {
            const wx = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                const url = await window.api?.assetUrl?.('tomato-cutout.png')
                const img = document.querySelector('.tomato-img')
                const hero = document.querySelector('.hero')
                const card = document.querySelector('.task-card')
                const bar = document.querySelector('.add-docked')
                const rectOf = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) } : null
                const rects = {
                  hero: rectOf(hero), card: rectOf(card), dockedBar: rectOf(bar),
                  tasksScroll: rectOf(document.querySelector('.tasks-scroll')),
                  gutter: getComputedStyle(document.querySelector('.tasks-scroll')).scrollbarGutter
                }
                const inner = document.querySelector('.hero-inner')
                const wx = document.querySelector('.wx')
                return JSON.stringify({
                  url,
                  rects,
                  hasApi: !!window.api?.weather,
                  heroInner: inner ? { w: inner.offsetWidth, h: inner.offsetHeight, text: inner.textContent.slice(0, 30) } : null,
                  wxBox: wx ? { w: wx.offsetWidth, h: wx.offsetHeight } : null,
                  stacked: !!document.querySelector('.hero.stacked'),
                  errors: (window.__errs || []).slice(0, 3)
                })
              })()`, true)
            fs.writeFileSync(path.join(shotDir, 'wx.json'), String(wx))
          } catch (e) { fs.writeFileSync(path.join(shotDir, 'wx.json'), 'EXEC-FAIL:' + e) }
        }
        const img = await mainWindow.webContents.capturePage()
        fs.writeFileSync(
          path.join(shotDir, process.env.TODOMENU_DARK ? 'main-dark.png' : 'main.png'),
          img.toPNG()
        )
        // notes view shot (+ note detail for overflow check)
        if (process.env.TODOMENU_NOTES) {
          await mainWindow.webContents.executeJavaScript("window.__todoDebug.switchMode('note')", true)
          await new Promise((r) => setTimeout(r, 900))
          const nimg = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(shotDir, process.env.TODOMENU_DARK ? 'notes-dark.png' : 'notes.png'), nimg.toPNG())
          await mainWindow.webContents.executeJavaScript(
            "window.__todoDebug.state.selectedNoteId = window.__todoDebug.state.notes[0]?.id || null", true)
          await new Promise((r) => setTimeout(r, 700))
          const ndimg = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(shotDir, 'note-detail.png'), ndimg.toPNG())
          // geometry persistence + overflow growth verification
          try {
            const geom = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                const id = window.__todoDebug.state.notes[0]?.id
                const before = document.querySelector('.sticky-pop')?.getBoundingClientRect()
                // simulate: persist a geometry, reopen, and read it back
                const saved = (await window.api.settings.get('noteWindows')) || {}
                saved[id] = { x: 120, y: 80, w: 420, h: 300 }
                await window.api.settings.set('noteWindows', saved)
                window.__todoDebug.state.notePopupId = null
                await new Promise(r => setTimeout(r, 120))
                window.__todoDebug.state.notePopupId = id
                await new Promise(r => setTimeout(r, 400))
                const rect = document.querySelector('.sticky-pop')?.getBoundingClientRect()
                // overflow test: push the sticky beyond the viewport
                const res = await window.api.window.ensureBounds({ x: 40, y: 40, w: 900, h: 700 })
                return JSON.stringify({
                  before: before ? { w: Math.round(before.width), h: Math.round(before.height) } : null,
                  restored: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
                  grew: res ? { w: res.width, h: res.height } : null,
                  vw: window.innerWidth, vh: window.innerHeight
                })
              })()`, true)
            fs.writeFileSync(path.join(shotDir, 'geom.json'), String(geom))
          } catch (e) { fs.writeFileSync(path.join(shotDir, 'geom.json'), 'FAIL:' + (e?.message || e)) }

          // stickies popup shot
          try {
            await mainWindow.webContents.executeJavaScript(
              "window.__todoDebug.state.selectedNoteId = null; window.__todoDebug.state.notePopupId = window.__todoDebug.state.notes[0]?.id || null", true)
            await new Promise((r) => setTimeout(r, 700))
            const pimg = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'note-popup.png'), pimg.toPNG())
            // the delete confirmation must paint ABOVE the sticky popup
            await mainWindow.webContents.executeJavaScript(
              "document.querySelector('.sp-del')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))", true)
            await new Promise((r) => setTimeout(r, 700))
            const dimg = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'note-delete-confirm.png'), dimg.toPNG())
            const layer = await mainWindow.webContents.executeJavaScript(
              `(() => {
                const modal = document.querySelector('.modal-backdrop')
                const sticky = document.querySelector('.sticky-pop')
                const btn = document.querySelector('.modal .dlg-actions .btn')
                if (!modal || !sticky) return JSON.stringify({ modal: !!modal, sticky: !!sticky })
                const m = getComputedStyle(modal)
                const s = getComputedStyle(sticky)
                // what actually paints on top: the topmost element at the button's centre
                const r = btn.getBoundingClientRect()
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
                return JSON.stringify({
                  modal: true, sticky: true,
                  modalZ: m.zIndex, stickyZ: s.zIndex,
                  modalAbove: parseInt(m.zIndex, 10) > parseInt(s.zIndex, 10),
                  hitIsDialog: !!(hit && hit.closest('.modal')),
                  dialogTitle: document.querySelector('.modal .dlg-head h3')?.textContent || ''
                })
              })()`, true)
            fs.writeFileSync(path.join(shotDir, 'layer.json'), String(layer))
            await mainWindow.webContents.executeJavaScript(
              "document.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))", true)
            await new Promise((r) => setTimeout(r, 300))
            await mainWindow.webContents.executeJavaScript(
              "window.__todoDebug.state.notePopupId = null", true)
            await new Promise((r) => setTimeout(r, 300))

            // probe: deleting a note must delete its RTF document too
            try {
              const del = await mainWindow.webContents.executeJavaScript(`(async () => {
                const sleep = (ms) => new Promise(r => setTimeout(r, ms))
                const id = window.__todoDebug.state.notes[0]?.id
                const note = window.__todoDebug.state.notes[0]
                const before = await window.api.notes.readFile(id)
                window.__todoDebug.state.notePopupId = id
                await sleep(500)
                document.querySelector('.sp-del')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                await sleep(500)
                document.querySelector('.modal .btn.primary, .modal .btn.danger-fill')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                await sleep(900)
                const after = await window.api.notes.readFile(id)
                const stillListed = window.__todoDebug.state.notes.some(n => n.id === id)
                return JSON.stringify({ id, hadContentBefore: !!before, fileGone: after === null, stillListed })
              })()`, true)
              fs.writeFileSync(path.join(shotDir, 'delete-probe.json'), String(del))
            } catch (e) { fs.writeFileSync(path.join(shotDir, 'delete-probe.json'), 'FAIL:' + (e?.message || e)) }
          } catch (e) { console.error('POPUP SHOT FAILED:', e?.message || e) }
          await mainWindow.webContents.executeJavaScript("window.__todoDebug.switchMode('todo')", true)
          await new Promise((r) => setTimeout(r, 500))
        }
        // backup probe: run a backup through the real IPC path
        if (process.env.TODOMENU_BACKUP) {
          try {
            const r = await mainWindow.webContents.executeJavaScript(
              "window.api.backupRun()", true)
            const st = await mainWindow.webContents.executeJavaScript(
              "window.api.backupStatus()", true)
            fs.writeFileSync(path.join(shotDir, 'backup-probe.json'), JSON.stringify({ run: r, status: st }, null, 2))
          } catch (e) { fs.writeFileSync(path.join(shotDir, 'backup-probe.json'), 'FAIL:' + (e?.message || e)) }
        }
        // settings screenshot (the data tab holds the backup section)
        if (process.env.TODOMENU_SETTINGS) {
          try {
            await mainWindow.webContents.executeJavaScript(
              "window.__todoDebug.state.settingsOpen = true", true)
            await new Promise((r) => setTimeout(r, 700))
            await mainWindow.webContents.executeJavaScript(
              "[...document.querySelectorAll('.side-tab')].find(el => el.textContent.includes('数据'))?.click()",
              true)
            await new Promise((r) => setTimeout(r, 600))
            const simg = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'settings-data.png'), simg.toPNG())
            // probe: does a setting survive the IPC round trip?
            try {
              const probe = await mainWindow.webContents.executeJavaScript(`(async () => {
                const sleep = (ms) => new Promise(r => setTimeout(r, ms))
                const out = {}
                // 1) settings:set round trip
                await window.api.settings.set('quickSectionOrder', ['due', 'notes', 'myday'])
                await sleep(300)
                out.sectionOrderReadBack = await window.api.settings.get('quickSectionOrder')
                out.sectionOrderInState = window.__todoDebug.state.settings.quickSectionOrder
                // 2) backup settings round trip
                await window.api.backupSettings({ enabled: true, freq: 'weekly', time: '09:30' })
                await sleep(300)
                const bs = await window.api.backupStatus()
                out.backup = { enabled: bs.enabled, freq: bs.freq, time: bs.time }
                // 3) the backup switch: simulate a real click and check it sticks
                const sw = document.querySelector('.switch input')
                out.switchExists = !!sw
                out.switchHasTrack = !!document.querySelector('.switch-track')
                if (sw) {
                  sw.checked = true
                  sw.dispatchEvent(new Event('change', { bubbles: true }))
                  await sleep(700)
                  out.switchCheckedAfterClick = document.querySelector('.switch input')?.checked
                  const bs2 = await window.api.backupStatus()
                  out.enabledAfterClick = bs2.enabled
                }
                // 4) does the drag handler fire? (open the tab that has the cards)
                const tabs = [...document.querySelectorAll('.side-tab')]
                for (const tb of tabs) {
                  if (document.querySelector('.order-card')) break
                  tb.click()
                  await sleep(250)
                }
                out.tabWithCards = document.querySelector('.side-tab.active')?.textContent?.trim() || '?'
                const cards = document.querySelectorAll('.order-card')
                out.orderCards = cards.length
                out.cardLabels = [...cards].map(c => c.textContent.trim())
                if (cards.length >= 2) {
                  const dt = new DataTransfer()
                  cards[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
                  cards[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
                  cards[1].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
                  await sleep(400)
                  out.afterDrop = await window.api.settings.get('quickSectionOrder')
                }
                // 5) the section-order cards now live in the tray tab
                out.orderInTrayTab = [...document.querySelectorAll('.side-tab')].some(tb =>
                  tb.textContent.includes('菜单栏') && tb.classList.contains('active'))
                return JSON.stringify(out)
              })()`, true)
              fs.writeFileSync(path.join(shotDir, 'settings-probe.json'), String(probe))
            } catch (e) { fs.writeFileSync(path.join(shotDir, 'settings-probe.json'), 'FAIL:' + (e?.message || e)) }
            // also capture the tray tab (it holds the quick-panel section order)
            try {
              await mainWindow.webContents.executeJavaScript(
                "[...document.querySelectorAll('.side-tab')].find(el => el.textContent.includes('菜单栏'))?.click()",
                true)
              await new Promise((r) => setTimeout(r, 600))
              const timg = await mainWindow.webContents.capturePage()
              fs.writeFileSync(path.join(shotDir, 'settings-tray.png'), timg.toPNG())
            } catch { /* ignore */ }
            await mainWindow.webContents.executeJavaScript(
              "window.__todoDebug.state.settingsOpen = false", true)
            await new Promise((r) => setTimeout(r, 300))
          } catch (e) { console.error('SETTINGS SHOT FAILED:', e?.message || e) }
        }
        // attachment probe: adding an attachment must update the open card
        if (process.env.TODOMENU_ATTACH) {
          try {
            const att = await mainWindow.webContents.executeJavaScript(`(async () => {
              const sleep = (ms) => new Promise(r => setTimeout(r, ms))
              const out = {}
              // open the first task so the detail panel shows
              const card = document.querySelector('.task-card')
              card?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              await sleep(700)
              const id = window.__todoDebug.state.selectedTaskId
              out.taskId = id || null
              const chipsBefore = document.querySelectorAll('.meta-chip').length
              out.chipsBefore = chipsBefore
              // add a link attachment straight through the store
              await window.api.attachments.create({
                task_id: id, type: 'link', name: 'test link', path_or_url: 'https://example.com'
              })
              await sleep(900)
              const after = [...document.querySelectorAll('.meta-chip')].map(c => c.textContent.trim())
              out.chipsAfter = after
              // the attachment chips carry their own classes
              out.linkChipShown = document.querySelectorAll('.link-chip').length > 0
              out.fileChipShown = document.querySelectorAll('.file-chip').length > 0
              out.linkChipText = document.querySelector('.link-chip')?.textContent.trim() || null
              // remove it again so the probe leaves no trace
              const atts = await window.api.attachments.listByTask(id)
              for (const a of atts) await window.api.attachments.remove(a.id)
              await sleep(500)
              return JSON.stringify(out)
            })()`, true)
            fs.writeFileSync(path.join(shotDir, 'attach-probe.json'), String(att))
          } catch (e) { fs.writeFileSync(path.join(shotDir, 'attach-probe.json'), 'FAIL:' + (e?.message || e)) }
        }
        // pomodoro focus shot
        if (process.env.TODOMENU_POMO) {
          await mainWindow.webContents.executeJavaScript("window.__todoDebug.startFocus()", true)
          await new Promise((r) => setTimeout(r, 1400))
          const pimg = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(shotDir, 'focus.png'), pimg.toPNG())
          await mainWindow.webContents.executeJavaScript("window.__todoDebug.setFocus(false)", true)
          await new Promise((r) => setTimeout(r, 400))
        }
        // in-process data-flow verification: complete → switch views → read counts
        if (process.env.TODOMENU_FLOW) {
          try {
            const flow = await mainWindow.webContents.executeJavaScript(`(async () => {
              const d = window.__todoDebug
              d.openView('smart', 'myday')
              await new Promise(r => setTimeout(r, 400))
              const before = d.counts()
              await d.toggleFirst()
              const after = d.counts()
              d.openView('smart', 'completed')
              await new Promise(r => setTimeout(r, 400))
              const completedView = d.counts()
              d.openView('smart', 'open')
              await new Promise(r => setTimeout(r, 400))
              const openViewCounts = d.counts()
              d.openView('smart', 'myday')
              await new Promise(r => setTimeout(r, 400))
              const mydayAgain = d.counts()
              return JSON.stringify({ before, after, completedView, openView: openViewCounts, mydayAgain })
            })()`, true)
            fs.writeFileSync(path.join(shotDir, 'flow.json'), flow)
            // background render path: preset color then image
            const testPng = path.join(shotDir, 'testbg.png')
            const buf = Buffer.alloc(64 * 64 * 4)
            for (let i = 0; i < buf.length; i += 4) { buf[i] = 226; buf[i + 1] = 205; buf[i + 2] = 245; buf[i + 3] = 255 }
            fs.writeFileSync(testPng, nativeImage.createFromBitmap(buf, { width: 64, height: 64 }).toPNG())
            await db.setSetting('bgColor', 'dawn')
            mainWindow.webContents.reload()
            await new Promise((r) => setTimeout(r, 1400))
            const bgimg = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'bg-color.png'), bgimg.toPNG())
            await db.setSetting('bgImage', testPng)
            await db.setSetting('bgColor', null)
            mainWindow.webContents.reload()
            await new Promise((r) => setTimeout(r, 1400))
            const bgimg2 = await mainWindow.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'bg-image.png'), bgimg2.toPNG())
            await db.setSetting('bgImage', null)
          } catch (e) { console.error('flow failed', e) }
          app.quit()
          return
        }

        // stacked hero shot (narrow window → vertical layout)
        if (process.env.TODOMENU_STACK) {
          mainWindow.setSize(560, 900)
          await new Promise((r) => setTimeout(r, 900))
          const stimg = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(shotDir, 'stacked.png'), stimg.toPNG())
          // resize-handle probe: simulate a drag on the corner handle
          try {
            const resizeTest = await mainWindow.webContents.executeJavaScript(
              `(async () => {
                if (!window.__todoDebug.state.notePopupId) {
                  window.__todoDebug.state.notePopupId = window.__todoDebug.state.notes[0]?.id || null
                  await new Promise(r => setTimeout(r, 400))
                }
                const pop = document.querySelector('.sticky-pop')
                const handle = document.querySelector('.sp-resize')
                if (!pop || !handle) return JSON.stringify({ handle: !!handle, pop: !!pop })
                const before = pop.getBoundingClientRect().width
                const hr = handle.getBoundingClientRect()
                handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: hr.x + 4, clientY: hr.y + 4 }))
                window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: hr.x + 104, clientY: hr.y + 64 }))
                window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
                await new Promise(r => setTimeout(r, 250))
                const after = pop.getBoundingClientRect().width
                return JSON.stringify({ handle: true, before: Math.round(before), after: Math.round(after) })
              })()`, true)
            fs.writeFileSync(path.join(shotDir, 'resize.json'), String(resizeTest))
          } catch (e) { fs.writeFileSync(path.join(shotDir, 'resize.json'), 'FAIL:' + (e?.message || e)) }

          const boxes = await mainWindow.webContents.executeJavaScript(
            `(() => {
              const r = (el) => el ? { h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) } : null
              const hero = document.querySelector('.hero')
              const split = document.querySelector('.hero-split')
              return JSON.stringify({
                hero: r(hero), split: r(split),
                inner: r(document.querySelector('.hero-inner')),
                wx: r(document.querySelector('.wx')),
                chart: r(document.querySelector('.wx-chart')),
                canvas: r(document.querySelector('.wx-chart canvas')),
                now: r(document.querySelector('.wx-now')),
                tabs: r(document.querySelector('.wx-tabs'))
              })
            })()`, true)
          fs.writeFileSync(path.join(shotDir, 'boxes.json'), String(boxes))
          mainWindow.setSize(1180, 780)
          await new Promise((r) => setTimeout(r, 600))
        }

        // narrow window shot (sidebar should auto-hide)
        if (process.env.TODOMENU_NARROW) {
          mainWindow.setSize(480, 700)
          await new Promise((r) => setTimeout(r, 900))
          const wimg = await mainWindow.webContents.capturePage()
          fs.writeFileSync(path.join(shotDir, 'narrow.png'), wimg.toPNG())
          mainWindow.setSize(1180, 780)
        }
        // quick panel shot
        if (process.env.TODOMENU_QUICK) {
          showQuickPanel(true)
          await new Promise((r) => setTimeout(r, 1500))
          const qw = BrowserWindow.getAllWindows().find((w) => w !== mainWindow)
          if (qw) {
            const qi = await qw.webContents.capturePage()
            fs.writeFileSync(path.join(shotDir, 'quick.png'), qi.toPNG())
            try {
              const out = await qw.webContents.executeJavaScript(`(async () => {
                const sleep = (ms) => new Promise(r => setTimeout(r, ms))
                const o = {}
                o.sections = [...document.querySelectorAll('.qsect-label')].map(e => e.textContent.trim())
                o.taskWeight = document.querySelector('.qtask-title')
                  ? getComputedStyle(document.querySelector('.qtask-title')).fontWeight : null
                o.noteWeight = document.querySelector('.qn-title')
                  ? getComputedStyle(document.querySelector('.qn-title')).fontWeight : null
                o.pinBtn = !!document.querySelector('.qpin')
                document.querySelector('.qn-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                await sleep(500)
                const rich = document.querySelector('.qrich')
                o.rich = { present: !!rich, br: rich ? rich.innerHTML.includes('<br>') : false, p: rich ? rich.innerHTML.includes('<p') : false }
                // expand a note row and click 打开 — the popup chain
                document.querySelector('.qn-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                await sleep(400)
                o.openBtn = !!document.querySelector('.qopen-btn')
                document.querySelector('.qopen-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
                return JSON.stringify(o)
              })()`, true)
              fs.writeFileSync(path.join(shotDir, 'quick-probe.json'), String(out))
            } catch (e) { fs.writeFileSync(path.join(shotDir, 'quick-probe.json'), 'FAIL:' + (e?.message || e)) }
            // the main window should now show the sticky popup
            await new Promise((r) => setTimeout(r, 2000))
            try {
              const st = await mainWindow.webContents.executeJavaScript(
                `JSON.stringify({ popup: !!document.querySelector('.sticky-pop'), title: document.querySelector('.sp-name')?.value || '' })`, true)
              fs.writeFileSync(path.join(shotDir, 'note-open-probe.json'), String(st))
              const cap = await mainWindow.webContents.capturePage()
              fs.writeFileSync(path.join(shotDir, 'note-opened.png'), cap.toPNG())
            } catch (e) { fs.writeFileSync(path.join(shotDir, 'note-open-probe.json'), 'FAIL:' + (e?.message || e)) }
          }
          hideQuick()
        }
      } catch (e) { console.error('shot failed', e) }
      if (process.env.TODOMENU_DARK) db.setSetting('theme', 'system')
      app.quit()
    })
  }
}

/** create a note with its RTF document on disk (demo seed + migrations) */
function seedNote({ title, content, color, pinned }) {
  const html = /<[a-z]/i.test(content || '') ? content : `<p>${(content || '').replace(/\n/g, '<br>')}</p>`
  const note = db.createNote({ title, content: html, color, pinned })
  try {
    const dir = path.join(app.getPath('userData'), 'notes')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${note.id}.rtf`)
    fs.writeFileSync(file, htmlToRtf(html), 'utf8')
    db.updateNote(note.id, { file, preview: htmlToText(html).slice(0, 500) })
  } catch (e) { console.error('SEED NOTE FILE FAILED:', e && e.stack || e) }
  return note
}

/** demo content for UI review (only with TODOMENU_DEMO=1, dev-local DB) */
function seedDemo() {
  if (db.getSetting('demo_seeded', false)) return
  const today = localYMD()
  const tomorrow = localYMD(1)
  const week = localYMD(5)
  const yesterday = localYMD(-1)
  db.createTask({ subject: '完成逆向规格文档', due_date: today, importance: 'important', my_day_date: today })
  db.createTask({ subject: '实现菜单栏快速添加面板', due_date: today, my_day_date: today })
  db.createTask({ subject: '周会同步进度', due_date: week, importance: 'normal' })
  db.createTask({ subject: '回复审阅意见（逾期示例）', due_date: yesterday })
  db.createTask({ subject: '明天 3点 预约牙医', due_date: tomorrow })
  db.createTask({ subject: '买菜：鸡蛋、牛奶、青菜', my_day_date: today })
  db.createTask({ subject: '每周跑步三次', recurrence_json: JSON.stringify({ type: 'weekly', interval: 1, weekdays: [1, 3, 5] }), due_date: week })
  const t1 = db.createTask({ subject: '整理书房' })
  db.createStep({ task_id: t1.id, subject: '书籍分类' })
  db.createStep({ task_id: t1.id, subject: '清理桌面' })
  const done = db.createTask({ subject: '已完成示例：缴费' })
  db.updateTask(done.id, { status: 'completed', completed_at: new Date().toISOString() })

  seedNote({ title: '会议纪要 · 产品评审', content: '<p>1. 确认 v2 交互稿</p><p>2. 便签功能本周上线</p><p>3. 番茄钟进入内测</p>', color: 'yellow', pinned: 1 })
  seedNote({ title: '购物清单', content: '鸡蛋、牛奶、青菜、咖啡豆', color: 'green' })
  seedNote({ title: '灵感：菜单栏日历', content: '点击菜单栏图标显示迷你日历 + 今日任务', color: 'blue' })
  seedNote({ title: '健身计划', content: '周一 胸\n周三 背\n周五 腿', color: 'pink', pinned: 1 })
  seedNote({ title: '书摘', content: '「把最重要的事放在一天的开始。」', color: 'purple' })
  db.setSetting('demo_seeded', true)
}

/**
 * Register the bundled WidgetKit extension with LaunchServices so the
 * desktop widgets show up in the widget gallery.
 */
function registerWidgetExtension() {
  if (process.platform !== 'darwin') return
  try {
    const appPath = app.getPath('exe')
    const appBundle = path.dirname(path.dirname(appPath))
    const appex = path.join(appBundle, 'Contents', 'PlugIns', 'TomatodoWidget.appex')
    if (!fs.existsSync(appex)) return
    const lsregister =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    execFile(lsregister, ['-f', appBundle], () => {})
  } catch { /* registration is best effort */ }
}

function localYMD(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** send an event to every open renderer window */
function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function broadcastChanged() {
  refreshTrayMenu()
  updateTrayTitle()
  // keep the desktop widgets in sync
  publishWidgetSnapshot()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db:changed')
  if (BrowserWindow.getAllWindows().some((w) => w !== mainWindow)) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w !== mainWindow && !w.isDestroyed()) w.webContents.send('db:changed')
    }
  }
}

function updateBadge() {
  if (process.platform !== 'darwin') return
  const mode = db.getSetting('badge', 'never')
  if (mode === 'never') { app.dock.setBadge(''); return }
  const ov = db.overviewForTray()
  const n = mode === 'myday' ? ov.myday : mode === 'open' ? ov.open : ov.due
  app.dock.setBadge(n > 0 ? String(n) : '')
}

function handleDeepLink(url) {
  const u = String(url || '')
  // observed scheme shape: ms-to-do://tasks/<id> — open the main window on that task
  let m = u.match(/^ms-to-do:\/\/tasks\/(.+)$/)
  if (m && mainWindow) {
    openMainWindow()
    mainWindow.webContents.send('app:openTask', m[1])
    return
  }
  // our own scheme (the desktop widgets deep-link here):
  //   tomatodo://task/<id> · tomatodo://note/<id> · tomatodo://open
  m = u.match(/^tomatodo:\/\/(task|note)\/(.+)$/)
  if (m) {
    openMainWindow()
    mainWindow.webContents.send(m[1] === 'task' ? 'app:openTask' : 'app:openNote', decodeURIComponent(m[2]))
    return
  }
  if (u.startsWith('tomatodo://')) openMainWindow()
}

function sendCommand(cmd) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    openMainWindow()
    mainWindow.webContents.send('app:command', cmd)
  }
}

function registerIpc() {
  const notesDir = () => path.join(app.getPath('userData'), 'notes')
  const h = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args))

  h('lists:list', () => db.listLists())
  h('lists:counts', () => db.listCountByList())
  h('lists:create', (p) => { const r = db.createList(p); broadcastChanged(); return r })
  h('lists:update', (id, f) => { const r = db.updateList(id, f); broadcastChanged(); return r })
  h('lists:remove', (id) => { db.deleteList(id); broadcastChanged() })

  h('groups:list', () => db.listGroups())
  h('groups:create', (p) => { const r = db.createGroup(p); broadcastChanged(); return r })
  h('groups:update', (id, f) => { const r = db.updateGroup(id, f); broadcastChanged(); return r })
  h('groups:remove', (id) => { db.deleteGroup(id); broadcastChanged() })

  h('tasks:get', (id) => db.getTask(id))
  h('tasks:listByList', (id, opts) => db.listTasks(id, opts || {}))
  h('tasks:smart', (kind, opts) => db.querySmartList(kind, opts || {}))
  h('tasks:search', (q) => db.searchTasks(q))
  h('tasks:create', (p) => {
    const task = db.createTask(p)
    // strip-recognized-date behavior handled in renderer before create
    broadcastChanged()
    return task
  })
  h('tasks:update', (id, f) => {
    // recurring completion spawns the next occurrence (observed behavior)
    const r = db.updateTask(id, f)
    broadcastChanged()
    return r
  })
  h('tasks:complete', (id) => {
    const task = db.getTask(id)
    if (!task) return null
    const next = deriveNextOccurrence(task)
    if (next) {
      const created = db.createTask({ ...next, list_id: task.list_id })
      broadcastChanged()
      return created
    }
    return null
  })
  h('tasks:remove', (id) => { db.deleteTask(id); broadcastChanged() })
  h('tasks:restore', (snap) => {
    const r = db.restoreTask(snap)
    broadcastChanged()
    return r
  })
  h('tasks:removeCompleted', (listId) => { db.deleteCompletedTasks(listId); broadcastChanged() })
  h('tasks:move', (id, listId) => { const r = db.moveTaskTo(id, listId); broadcastChanged(); return r })
  h('tasks:copy', (id, listId) => {
    const t = db.getTask(id)
    if (!t) return null
    const { id: _omit, position: _p, ...rest } = t
    const copy = db.createTask({ ...rest, list_id: listId })
    broadcastChanged()
    return copy
  })
  h('tasks:reposition', (id, beforeId, afterId) => { const r = db.reposition(id, beforeId, afterId); broadcastChanged(); return r })

  h('steps:listByTask', (taskId) => db.listSteps(taskId))
  h('steps:create', (p) => { const r = db.createStep(p); broadcastChanged(); return r })
  h('steps:update', (id, f) => { const r = db.updateStep(id, f); broadcastChanged(); return r })
  h('steps:remove', (id) => { const r = db.deleteStep(id); broadcastChanged(); return r })

  h('attachments:listByTask', (taskId) => db.listAttachments(taskId))
  h('attachments:create', (p) => { const r = db.createAttachment(p); broadcastChanged(); return r })
  h('attachments:remove', (id) => { const r = db.deleteAttachment(id); broadcastChanged(); return r })

  h('settings:all', () => {
    const out = {}
    for (const row of db.allSettings()) out[row.key] = safeJSON(row.value)
    return out
  })
  h('settings:get', (k) => db.getSetting(k))
  h('settings:set', (k, v) => {
    db.setSetting(k, v)
    // a new location / API must not be masked by the cached payload
    if (k === 'quickSectionOrder' || k === 'quickModules') {
      // the quick panel must apply the new order / visibility immediately
      broadcast('quick:sectionOrder', v)
    }
    if (['weatherCity', 'weatherMode', 'weatherApiBase', 'weatherApiKey'].includes(k)) {
      invalidateWeatherCache()
      broadcast('weather:changed', { reason: k })
    }
    if (k === 'language') {
      const sys = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
      setMiniLang(v === 'en' ? 'en' : v === 'system' ? undefined : v)
      refreshTrayMenu()
    }
    if (k === 'showTray' || k === 'globalShortcut' || k === 'badge') {
      if (k === 'showTray') rebuildTray()
      else refreshTrayMenu()
      if (k === 'globalShortcut') registerGlobalShortcut()
      if (k === 'badge') updateBadge()
    }
    if (k === 'theme') {
      const pref = v
      const useDark = pref === 'dark' || (pref === 'system' && nativeTheme.shouldUseDarkColors)
      nativeTheme.themeSource = pref === 'system' ? 'system' : pref
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('theme:changed', useDark ? 'dark' : 'light')
    }
    return true
  })

  h('app:overview', () => db.overviewForTray())

  // ---- notes stored as RTF documents (Curiota-style) ----
  h('notes:writeFile', async (id, html) => {
    try {
      fs.mkdirSync(notesDir(), { recursive: true })
      const file = path.join(notesDir(), `${id}.rtf`)
      fs.writeFileSync(file, htmlToRtf(html || ''), 'utf8')
      db.updateNote(id, { file })
      return file
    } catch (e) { return null }
  })
  h('notes:readFile', async (id) => {
    try {
      const file = path.join(notesDir(), `${id}.rtf`)
      if (!fs.existsSync(file)) return null
      const rtf = fs.readFileSync(file, 'utf8')
      return rtfToHtml(rtf)
    } catch { return null }
  })
  h('notes:deleteFile', async (id) => {
    try {
      const file = path.join(notesDir(), `${id}.rtf`)
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return true
    } catch { return false }
  })
  // copy a note to the system clipboard as RTF + HTML (interops with Word/Pages)
  h('app:copyNote', async (id) => {
    try {
      const note = db.getNote(id)
      if (!note) return false
      const { clipboard } = require('electron')
      clipboard.write({
        text: (note.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        html: note.content || '',
        rtf: htmlToRtf(note.content || '')
      })
      return true
    } catch { return false }
  })

  // notes (quick memos)
  h('notes:list', (opts) => db.listNotes(opts || {}))
  h('notes:get', (id) => db.getNote(id))
  h('notes:create', async (p) => {
    const r = db.createNote(p)
    // every note is backed by an RTF document on disk
    try {
      fs.mkdirSync(notesDir(), { recursive: true })
      const file = path.join(notesDir(), `${r.id}.rtf`)
      fs.writeFileSync(file, htmlToRtf(r.content || ''), 'utf8')
      db.updateNote(r.id, { file })
    } catch { /* file is optional */ }
    broadcastChanged()
    return db.getNote(r.id)
  })
  h('notes:update', (id, f) => { const r = db.updateNote(id, f); broadcastChanged(); return r })
  h('notes:remove', (id) => {
    // deleting a note must also delete its RTF document on disk
    try {
      const n = db.getNote(id)
      const file = n?.file || path.join(notesDir(), `${id}.rtf`)
      if (file && fs.existsSync(file)) fs.unlinkSync(file)
    } catch { /* the file is optional */ }
    db.deleteNote(id)
    broadcastChanged()
  })
  // ---- backup ----
  h('backup:status', () => backupStatus())
  h('backup:settings', (patch) => backupStatusAfter(patch))
  h('backup:run', () => {
    const r = runBackup()
    if (r.ok) broadcastChanged()
    return r
  })
  h('backup:restore', async () => {
    // let the user pick the archive.
    // The dialog MUST be parented to the main window: a parentless native
    // dialog opens BEHIND the app on macOS — which is what hid it behind
    // the settings dialog.
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      defaultPath: path.join(app.getPath('documents'), 'Tomatodo'),
      filters: [{ name: 'Tomatodo 备份', extensions: ['zip'] }, { name: '所有文件', extensions: ['*'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
    const r = restoreFromBackup(res.filePaths[0])
    if (r.ok) {
      broadcastChanged()
      broadcast('db:changed')
    }
    return r
  })
  h('backup:open', () => openBackupDir())
  h('notes:openDir', () => openNotesDir())
  h('notes:search', (q) => db.searchNotes(q))

  // pomodoro
  h('pomodoro:get', () => getPomodoro())
  h('pomodoro:start', (mode, minutes) => { updateTrayTitle(); return startPomodoro(mode, minutes) })
  h('pomodoro:pause', () => { updateTrayTitle(); return pausePomodoro() })
  h('pomodoro:reset', (mode) => { updateTrayTitle(); return resetPomodoro(mode) })

  // weather
  h('weather:refresh', async () => {
    invalidateWeatherCache()
    const data = await getWeather()
    broadcast('weather:changed', { reason: 'refresh' })
    return data
  })
  h('weather:get', () => getWeather())

  // app icon as renderable URL (brand logo / about page)
  h('app:assetUrl', (name) => {
    const allow = new Set(['tomato-cutout.png', 'icon.png'])
    if (!allow.has(name)) return null
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, name) : null,
      path.join(__dirname, '..', '..', 'resources', name),
      path.join(app.getAppPath(), 'resources', name)
    ].filter(Boolean)
    for (const p of candidates) {
      if (fs.existsSync(p)) return 'file://' + p.split('/').map(encodeURIComponent).join('/')
    }
    return null
  })
  // inline a clipboard-referenced image (file:// → data URL) for rich notes
  h('clipboard:readImage', async (filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      const st = fs.statSync(filePath)
      if (!st.isFile() || st.size > 12 * 1024 * 1024) return null
      const ext = path.extname(filePath).toLowerCase()
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' }[ext]
      if (!mime) return null
      const buf = fs.readFileSync(filePath)
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  })

  // grow the app window so a sticky note can never overflow the viewport
  h('win:ensureBounds', (rect) => {
    if (!mainWindow || !rect) return null
    const b = mainWindow.getBounds()
    const needW = Math.max(b.width, Math.ceil(rect.x + rect.w + 24))
    const needH = Math.max(b.height, Math.ceil(rect.y + rect.h + 24))
    const screen = require('electron').screen.getPrimaryDisplay().workArea
    const w = Math.min(needW, screen.width)
    const h = Math.min(needH, screen.height)
    if (w !== b.width || h !== b.height) {
      const nb = { x: b.x, y: b.y, width: w, height: h }
      mainWindow.setBounds(nb, false)
      return nb
    }
    return b
  })

  h('app:iconUrl', () => {
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'icon.png') : null,
      path.join(__dirname, '..', '..', 'resources', 'icon.png'),
      path.join(app.getAppPath(), 'resources', 'icon.png')
    ].filter(Boolean)
    for (const p of candidates) {
      if (fs.existsSync(p)) return 'file://' + p.split('/').map(encodeURIComponent).join('/')
    }
    return null
  })

  h('dialog:pickImage', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
    })
    if (canceled || !filePaths[0]) return null
    return filePaths[0]
  })
  h('app:updateBadge', () => { updateBadge(); return true })
  h('app:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export data',
      defaultPath: path.join(app.getPath('documents'), `tomatodo-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    fs.writeFileSync(filePath, JSON.stringify(db.exportJSON(), null, 2))
    shell.showItemInFolder(filePath)
    return filePath
  })
  h('app:openExternal', (url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  h('app:openPath', (p) => shell.openPath(p))
  h('dialog:pickFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] })
    if (canceled || !filePaths[0]) return null
    return { path: filePaths[0], name: path.basename(filePaths[0]) }
  })
  h('app:setLoginItem', (enabled) => {
    app.setLoginItemSettings({ openAtLogin: enabled, hidden: true })
    return true
  })
  h('app:getLoginItem', () => app.getLoginItemSettings().openAtLogin)
  h('app:relaunchTray', () => { refreshTrayMenu(); updateTrayTitle(); return true })
  h('app:command-ack', () => true)

  h('win:close', () => mainWindow && mainWindow.close())
  h('win:minimize', () => mainWindow && mainWindow.minimize())
  h('win:toggleAlwaysOnTop', () => {
    if (!mainWindow) return false
    mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop())
    return mainWindow.isAlwaysOnTop()
  })
  // pomodoro compact card: shrink window, restore on exit
  h('win:setCompact', (on) => {
    if (!mainWindow) return false
    if (on) {
      if (!mainWindow.__savedBounds) mainWindow.__savedBounds = mainWindow.getBounds()
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(280, 120)
      const b = mainWindow.__savedBounds
      mainWindow.setBounds({ x: b.x + Math.max(0, b.width - 320), y: b.y, width: 320, height: 140 })
    } else if (mainWindow.__savedBounds) {
      const b = mainWindow.__savedBounds
      mainWindow.setMinimumSize(360, 480)
      mainWindow.setBounds(b)
      mainWindow.__savedBounds = null
    }
    return true
  })
}

function safeJSON(s) {
  if (s === null || s === undefined) return null
  try { return JSON.parse(s) } catch { return null }
}

// ---------- lifecycle ----------

// the desktop widgets deep-link into the app through this scheme
if (process.defaultApp) {
  app.setAsDefaultProtocolClient('tomatodo', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('tomatodo')
}

app.whenReady().then(() => {
  const info = db.openDatabase(app.getPath('userData'))
  console.log('[Tomatodo] sqlite driver:', info.driver, '→', info.file)

  // scheduled backups (also catches a slot missed while the app was closed)
  startBackupScheduler()
  // make the widget extension discoverable (the widget gallery reads the
  // LaunchServices / ExtensionKit database — after an in-place upgrade the
  // bundle changed and the old registration no longer applies)
  registerWidgetExtension()
  // first widget snapshot
  setTimeout(() => publishWidgetSnapshot(), 1500)
  // apply the actions the widget intents queued
  startWidgetActionBridge()

  // dock/window icon (dev shows the default Electron icon otherwise)
  try {
    const iconCandidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'icon.png') : null,
      path.join(__dirname, '..', '..', 'resources', 'icon.png'),
      path.join(app.getAppPath(), 'resources', 'icon.png')
    ].filter(Boolean)
    for (const iconPath of iconCandidates) {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) {
          if (process.platform === 'darwin' && app.dock) app.dock.setIcon(icon)
          break
        }
      }
    }
  } catch { /* icon is cosmetic */ }

  // sync mini-language with saved preference
  const langPref = db.getSetting('language', 'system')
  const sysLang = app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
  setMiniLang(langPref === 'system' ? sysLang : langPref)

  registerIpc()
  createMainWindow()
  setupTray({ getMainWindow: () => mainWindow })
  buildAppMenu({ getMainWindow: () => mainWindow, sendCommand })
  startReminders({ getWindow: () => mainWindow, tray: null })
  restorePomodoro()
  setPomodoroTickHook(() => updateTrayTitle())
  updateBadge()

  // rebuild tray when settings change tray visibility
  ipcMain.on('app:rebuildTray', () => { refreshTrayMenu(); updateTrayTitle() })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().filter((w) => w !== null).length === 0) createMainWindow()
    else openMainWindow()
  })
})

app.on('before-quit', () => { quitting = true; stopReminders() })
app.on('will-quit', () => { destroyTray() })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// deep link
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url) })

// theme sync to renderer on system change
nativeTheme.on('updated', () => {
  const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('theme:changed', mode)
  }
})
