<script setup>
import { ref, onMounted, computed } from 'vue'
import { state, setSetting, toast, askConfirm, refreshTasks, refreshNotes, setQuickModule } from '../store'
import { t } from '../i18n'
import { X, Palette, SlidersHorizontal, PanelTop, BellRing, Database, Info, Download, Image, Timer, ListChecks, CloudSun, Archive, FolderOpen, Upload } from 'lucide-vue-next'

const emit = defineEmits(['close'])
// injected from package.json at build time — always matches the app version
const version = __APP_VERSION__
const tab = ref('appearance')
const loginItem = ref(false)

// quick panel section order (drag to reorder)
const SECTION_NAMES = { planned: '已计划', notes: '便签' }
const sectionOrder = ref(['planned', 'notes'])
let dragIdx = -1
onMounted(async () => {
  const saved = await window.api.settings.get('quickSectionOrder')
  if (Array.isArray(saved) && saved.length === 2) sectionOrder.value = saved
  const quick = document.querySelector('.qpanel') // warm reference (no-op)
  void quick
})
function onDrop(e, toIdx) {
  if (dragIdx < 0 || dragIdx === toIdx) return
  const arr = [...sectionOrder.value]
  const [moved] = arr.splice(dragIdx, 1)
  arr.splice(toIdx, 0, moved)
  sectionOrder.value = arr
  dragIdx = -1
  // persisted in the DB — the quick panel picks it up immediately
  setSetting('quickSectionOrder', arr)
  toast(t('settings.saved'))
}
const aboutLogo = ref(null)

onMounted(async () => {
  loginItem.value = await window.api.getLoginItem()
  aboutLogo.value = await window.api.iconUrl()
})

async function toggleLogin(e) {
  loginItem.value = e.target.checked
  await window.api.setLoginItem(e.target.checked)
  toast(t('settings.saved'))
}

async function onExport() {
  await window.api.exportData()
}

// ---- scheduled backup ----
const backup = ref({ enabled: false, freq: 'daily', time: '22:00', lastAt: null, path: '', exists: false, size: 0 })
const backupBusy = ref(false)

async function loadBackup() {
  try { backup.value = await window.api.backupStatus() } catch { /* ignore */ }
}
onMounted(loadBackup)

async function onBackupToggle(e) {
  backup.value = { ...backup.value, enabled: e.target.checked }
  backup.value = await window.api.backupSettings({ enabled: e.target.checked })
  toast(t('settings.saved'))
}
async function onBackupFreq(e) {
  backup.value = await window.api.backupSettings({ freq: e.target.value })
  toast(t('settings.saved'))
}
async function onBackupTime(e) {
  backup.value = await window.api.backupSettings({ time: e.target.value })
  toast(t('settings.saved'))
}
async function onBackupNow() {
  backupBusy.value = true
  try {
    const r = await window.api.backupRun()
    if (r?.ok) {
      toast(t('settings.backupDone'))
      await loadBackup()
    } else {
      toast(t('settings.backupFailed'))
    }
  } finally {
    backupBusy.value = false
  }
}
async function onOpenBackupDir() { await window.api.backupOpen() }

/** show/hide one of the quick panel's modules */

// restore a backup archive (replaces the current data)
const restoring = ref(false)
async function onRestore() {
  const ok = await askConfirm({
    title: t('settings.restoreConfirmTitle'),
    message: t('settings.restoreConfirmMessage')
  })
  if (!ok) return
  restoring.value = true
  try {
    const r = await window.api.backupRestore()
    if (r?.canceled) return
    if (r?.ok) {
      toast(t('settings.restoreDone', { tasks: r.tasks, notes: r.notes }))
      await refreshTasks()
      await refreshNotes()
    } else {
      toast(r?.error || t('settings.restoreFailed'))
    }
  } finally {
    restoring.value = false
  }
}
async function onOpenNotesDir() { await window.api.notesOpenDir() }

function fmtBackupSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
function fmtBackupTime(iso) {
  if (!iso) return t('settings.backupNever')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

async function chooseBg() {
  const p = await window.api.dialog?.pickImage?.()
  if (p) await setSetting('bgImage', p)
  else toast(t('settings.saved'))
}
async function clearBg() {
  await setSetting('bgImage', null)
}

// weather settings
const wxGeo = ref(null)
async function refreshGeo() {
  wxGeo.value = await window.api.weather.refresh()
  toast(t('settings.saved'))
}

const isMac = window.api?.platform === 'darwin'

// solid background presets (shared with the content-area context menu)
const BG_PRESETS = [
  { id: 'dawn', css: 'linear-gradient(135deg, #fbc2a9 0%, #f6d5c3 45%, #c9d7f0 100%)' },
  { id: 'mint', css: 'linear-gradient(135deg, #d3f0e3 0%, #c3e4f0 55%, #e8e2f5 100%)' },
  { id: 'sakura', css: 'linear-gradient(135deg, #fbe0e8 0%, #f3e3f5 50%, #e3e9f5 100%)' },
  { id: 'ocean', css: 'linear-gradient(135deg, #c9e4f5 0%, #d8e8f0 50%, #eef0e2 100%)' },
  { id: 'dusk', css: 'linear-gradient(135deg, #e8c9e0 0%, #c9d0f0 55%, #cfe8ef 100%)' }
]

// accelerator ⇄ display string per platform (⌘ ⇧ ⌥ on macOS, Ctrl+Shift+Alt on Win/Linux)
/**
 * Render an Electron accelerator for display: ⌘⇧T on macOS, Ctrl+Shift+T
 * elsewhere. The separator is NOT kept between symbols — keeping it made
 * every round-trip add another '+' ("CommandOrControl++Shift++T"), which
 * Electron cannot register, so the shortcut silently died.
 */
function fmtAccelerator(acc) {
  const parts = String(acc || '').split('+').filter(Boolean)
  const syms = parts.map((p) => {
    const k = p.toLowerCase()
    if (k === 'commandorcontrol') return isMac ? '⌘' : 'Ctrl'
    if (k === 'command' || k === 'meta' || k === 'super') return isMac ? '⌘' : 'Win'
    if (k === 'control' || k === 'ctrl') return isMac ? '⌃' : 'Ctrl'
    if (k === 'alt' || k === 'option') return isMac ? '⌥' : 'Alt'
    if (k === 'shift') return isMac ? '⇧' : 'Shift'
    return p.length === 1 ? p.toUpperCase() : p
  })
  return syms.join(isMac ? '' : '+')
}

/** turn a display string back into an Electron accelerator */
function parseAccelerator(display) {
  const sym = { '⌘': 'CommandOrControl', '⌃': 'Control', '⌥': 'Alt', '⇧': 'Shift' }
  const out = []
  for (const ch of String(display || '').trim()) {
    if (sym[ch]) out.push(sym[ch])
    else if (ch !== '+') out.push(ch.toUpperCase())
  }
  return out.join('+')
}

const DEFAULT_SHORTCUT = 'CommandOrControl+Alt+T'
const shortcutDisplay = ref(fmtAccelerator(state.settings.globalShortcut ?? DEFAULT_SHORTCUT))
const shortcutCapturing = ref(false)

async function commitShortcut() {
  // the accelerator is captured from real key presses; this only re-syncs
  // the display after a change elsewhere
  shortcutDisplay.value = fmtAccelerator(state.settings.globalShortcut ?? DEFAULT_SHORTCUT)
}

/** capture the real key combination instead of asking the user to type it */
function captureShortcut(e) {
  e.preventDefault()
  e.stopPropagation()
  // the user is still typing the combination — only the modifier keys are
  // not enough to make a shortcut
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Dead'].includes(e.key)) {
    shortcutDisplay.value = fmtAccelerator(buildAccelerator(e))
    return
  }
  const acc = buildAccelerator(e)
  if (!acc) return
  shortcutDisplay.value = fmtAccelerator(acc)
  shortcutCapturing.value = false
  setSetting('globalShortcut', acc)
  toast(t('settings.saved'))
}

/** build an Electron accelerator from a keyboard event */
function buildAccelerator(e) {
  const parts = []
  if (e.metaKey) parts.push('Command')
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (!/^F\d{1,2}$/.test(key) && !['Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right', 'Escape', 'Enter', 'Plus', 'Return'].includes(key)) {
    return null
  }
  if (!parts.length) return null
  parts.push(key)
  return parts.join('+')
}

const tabs = [
  { id: 'appearance', icon: Palette, label: () => t('settings.appearance') },
  { id: 'wallpaper', icon: Image, label: () => t('settings.wallpaper') },
  { id: 'general', icon: SlidersHorizontal, label: () => t('settings.general') },
  { id: 'tray', icon: PanelTop, label: () => t('settings.tray') },
  { id: 'pomo', icon: Timer, label: () => t('settings.pomo') },
  { id: 'weather', icon: CloudSun, label: () => t('settings.weather') },
  { id: 'notifications', icon: BellRing, label: () => t('settings.notifications') },
  { id: 'data', icon: Database, label: () => t('settings.data') },
  { id: 'about', icon: Info, label: () => t('settings.about') }
]

const bgPreview = computed(() => {
  const p = state.settings.bgImage
  if (!p) return null
  return 'url("file://' + p.split('/').map(encodeURIComponent).join('/') + '")'
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal settings-modal" role="dialog" :aria-label="t('settings.title')">
        <div class="settings-side">
          <button
            v-for="tb in tabs" :key="tb.id"
            class="side-tab" :class="{ active: tab === tb.id }"
            @click="tab = tb.id"
          >
            <component :is="tb.icon" :size="15" /> {{ tb.label() }}
          </button>
        </div>
        <div class="settings-main">
          <div class="settings-head">
            <h3>{{ tabs.find((x) => x.id === tab).label() }}</h3>
            <button class="icon-btn" @click="emit('close')"><X :size="16" /></button>
          </div>

          <div class="settings-body">
            <!-- appearance -->
            <template v-if="tab === 'appearance'">
              <div class="set-row">
                <label>{{ t('settings.theme') }}</label>
                <div class="seg">
                  <button v-for="v in ['system', 'light', 'dark']" :key="v"
                    class="seg-btn" :class="{ on: (state.settings.theme ?? 'system') === v }"
                    @click="setSetting('theme', v)">
                    {{ t('settings.theme' + v.charAt(0).toUpperCase() + v.slice(1)) }}
                  </button>
                </div>
              </div>
              <div class="set-row">
                <label>{{ t('settings.language') }}</label>
                <select class="set-select" :value="state.settings.language ?? 'system'" @change="setSetting('language', $event.target.value)">
                  <option value="system">{{ t('settings.langSystem') }}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
            </template>

            <!-- wallpaper -->
            <template v-if="tab === 'wallpaper'">
              <div class="set-row">
                <label>{{ t('settings.bgImage') }}</label>
                <div class="bg-preview" :style="bgPreview ? { backgroundImage: bgPreview } : {}">
                  <span v-if="!bgPreview" class="bg-empty"><Image :size="22" /></span>
                </div>
              </div>
              <div class="set-row wrap">
                <label></label>
                <div class="row-btns">
                  <button class="btn" @click="chooseBg"><Image :size="14" /> {{ t('settings.bgChoose') }}</button>
                  <button v-if="state.settings.bgImage" class="btn ghost danger-text" @click="clearBg">{{ t('settings.bgClear') }}</button>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('ctx.colorTitle') }}</label>
                <div class="swatch-row">
                  <button
                    v-for="p in BG_PRESETS" :key="p.id"
                    class="swatch" :class="{ on: state.settings.bgColor === p.id && !state.settings.bgImage }"
                    :style="{ background: p.css }"
                    :aria-label="p.id"
                    @click="setSetting('bgColor', p.id); setSetting('bgImage', null)"
                  ></button>
                </div>
              </div>
              <div class="set-row">
                <label>{{ t('settings.bgBlur') }}</label>
                <input type="range" min="0" max="24" class="set-range" :value="state.settings.bgBlur ?? 6" @input="setSetting('bgBlur', Number($event.target.value))" />
                <span class="range-val">{{ state.settings.bgBlur ?? 6 }}px</span>
              </div>
              <div class="set-row">
                <label>{{ t('settings.bgDim') }}</label>
                <input type="range" min="0" max="80" class="set-range" :value="state.settings.bgDim ?? 30" @input="setSetting('bgDim', Number($event.target.value))" />
                <span class="range-val">{{ state.settings.bgDim ?? 30 }}%</span>
              </div>
            </template>

            <!-- general -->
            <template v-if="tab === 'general'">
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.newTasksOnTop ?? false" @change="setSetting('newTasksOnTop', $event.target.checked)" />
                <span>{{ t('settings.newTasksOnTop') }}</span>
              </label>
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.moveStarredToTop ?? false" @change="setSetting('moveStarredToTop', $event.target.checked)" />
                <span>{{ t('settings.moveStarredToTop') }}</span>
              </label>
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.recognizeDates ?? true" @change="setSetting('recognizeDates', $event.target.checked)" />
                <span>{{ t('settings.recognizeDates') }}</span>
              </label>
              <label class="set-row check-row" :class="{ dim: !(state.settings.recognizeDates ?? true) }">
                <input type="checkbox" class="set-check" :checked="state.settings.stripDates ?? true" @change="setSetting('stripDates', $event.target.checked)" />
                <span>{{ t('settings.stripDates') }}</span>
              </label>
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.playSound ?? true" @change="setSetting('playSound', $event.target.checked)" />
                <span>{{ t('settings.playSound') }}</span>
              </label>
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.confirmDelete ?? true" @change="setSetting('confirmDelete', $event.target.checked)" />
                <span>{{ t('settings.confirmDelete') }}</span>
              </label>
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="loginItem" @change="toggleLogin" />
                <span>{{ t('settings.launchAtLogin') }}</span>
              </label>
            </template>

            <!-- tray -->
            <template v-if="tab === 'tray'">
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.showTray ?? true" @change="setSetting('showTray', $event.target.checked)" />
                <span>{{ t('settings.showTray') }}</span>
              </label>
              <div class="set-row wrap">
                <label>{{ t('settings.trayIconStyle') }}</label>
                <div class="seg">
                  <button class="seg-btn" :class="{ on: (state.settings.trayIconStyle ?? 'color') === 'template' }" @click="setSetting('trayIconStyle', 'template'); window.api.relaunchTray()">{{ t('settings.trayIconMono') }}</button>
                  <button class="seg-btn" :class="{ on: state.settings.trayIconStyle === 'color' }" @click="setSetting('trayIconStyle', 'color'); window.api.relaunchTray()">{{ t('settings.trayIconColor') }}</button>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.quickModules') }}</label>
                <div class="btn-row">
                  <label class="switch">
                    <input type="checkbox" :checked="state.settings.quickModules?.planned !== false" @change="setQuickModule('planned', $event.target.checked)" />
                    <span class="switch-track"><span class="switch-knob"></span></span>
                    <span class="switch-label">{{ t('quick.planned') }}</span>
                  </label>
                  <label class="switch">
                    <input type="checkbox" :checked="state.settings.quickModules?.notes !== false" @change="setQuickModule('notes', $event.target.checked)" />
                    <span class="switch-track"><span class="switch-knob"></span></span>
                    <span class="switch-label">{{ t('quick.notes') }}</span>
                  </label>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.sectionOrder') }}</label>
                <div class="order-list">
                  <div
                    v-for="(key, idx) in sectionOrder" :key="key"
                    class="order-card" draggable="true"
                    :class="{ dragging: dragIdx === idx }"
                    @dragstart="dragIdx = idx"
                    @dragover.prevent
                    @drop="onDrop($event, idx)"
                    @dragend="dragIdx = -1"
                  >
                    <span class="order-grip">⋮⋮</span> {{ SECTION_NAMES[key] }}
                  </div>
                </div>
                <div class="set-hint full">{{ t('settings.sectionOrderHint') }}</div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.globalShortcut') }}</label>
                <input
                  v-model="shortcutDisplay"
                  class="set-input shortcut"
                  spellcheck="false"
                  :value="shortcutDisplay"
                  @keydown="captureShortcut"
                  @blur="commitShortcut"
                />
                <div class="set-hint full">
                  {{ isMac ? '点击输入框后直接按下组合键，例如 ⌥⌘T' : '点击输入框后直接按下组合键，例如 Ctrl+Alt+T' }}
                </div>
              </div>
            </template>

            <!-- pomodoro -->
            <template v-if="tab === 'pomo'">
              <div class="set-row">
                <label>{{ t('pomo.workMin') }}</label>
                <input type="number" min="1" max="120" class="set-input time" :value="state.settings.pomodoroWork ?? 25" @change="setSetting('pomodoroWork', Math.max(1, Number($event.target.value) || 25))" />
              </div>
              <div class="set-row">
                <label>{{ t('pomo.breakMin') }}</label>
                <input type="number" min="1" max="60" class="set-input time" :value="state.settings.pomodoroBreak ?? 5" @change="setSetting('pomodoroBreak', Math.max(1, Number($event.target.value) || 5))" />
              </div>
              <div class="set-hint">{{ t('pomo.title') }} · {{ t('pomo.sessions', { n: state.pomodoro.sessionsToday }) }}</div>
            </template>

            <!-- weather -->
            <template v-if="tab === 'weather'">
              <div class="set-row wrap">
                <label>{{ t('wxset.mode') }}</label>
                <div class="seg">
                  <button class="seg-btn" :class="{ on: (state.settings.weatherMode ?? 'auto') === 'auto' }" @click="setSetting('weatherMode', 'auto')">{{ t('wxset.auto') }}</button>
                  <button class="seg-btn" :class="{ on: (state.settings.weatherMode ?? 'auto') === 'manual' }" @click="setSetting('weatherMode', 'manual')">{{ t('wxset.manual') }}</button>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('wxset.city') }}</label>
                <input
                  class="set-input"
                  :value="state.settings.weatherCity ?? '北京'"
                  :placeholder="t('wxset.city')"
                  spellcheck="false"
                  @keydown.enter="setSetting('weatherCity', $event.target.value.trim() || '北京'); refreshGeo()"
                  @blur="setSetting('weatherCity', $event.target.value.trim() || '北京')"
                />
                <div class="set-hint full">{{ t('wxset.cityHint') }}</div>
                <div v-if="wxGeo?.city" class="set-hint full">当前定位：{{ wxGeo.city }}<span v-if="wxGeo.unresolved">（未找到该城市）</span></div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('wxset.apiBase') }}</label>
                <input
                  class="set-input wide"
                  :value="state.settings.weatherApiBase ?? ''"
                  placeholder="https://api.open-meteo.com/v1/forecast"
                  spellcheck="false"
                  @keydown.enter="setSetting('weatherApiBase', $event.target.value.trim())"
                  @blur="setSetting('weatherApiBase', $event.target.value.trim())"
                />
              </div>
              <div class="set-row wrap">
                <label>{{ t('wxset.apiKey') }}</label>
                <input
                  class="set-input"
                  :value="state.settings.weatherApiKey ?? ''"
                  placeholder="—"
                  spellcheck="false"
                  @keydown.enter="setSetting('weatherApiKey', $event.target.value.trim())"
                  @blur="setSetting('weatherApiKey', $event.target.value.trim())"
                />
                <div class="set-hint full">{{ t('wxset.apiHint') }}</div>
              </div>
              <div class="set-row wrap">
                <label></label>
                <button class="btn" @click="refreshGeo"><CloudSun :size="14" /> {{ t('wxset.refresh') }}</button>
              </div>
            </template>

            <!-- notifications -->
            <template v-if="tab === 'notifications'">
              <label class="set-row check-row">
                <input type="checkbox" class="set-check" :checked="state.settings.dueTodayNotifications ?? true" @change="setSetting('dueTodayNotifications', $event.target.checked)" />
                <span>{{ t('settings.dueTodayNotif') }}</span>
              </label>
              <div class="set-row">
                <label>{{ t('settings.dueTodayTime') }}</label>
                <input type="time" class="set-input time" :value="state.settings.dueTodayTime ?? '09:00'" @change="setSetting('dueTodayTime', $event.target.value)" />
              </div>
              <div class="set-row">
                <label>{{ t('settings.weatherAlertNotify') }}</label>
                <div>
                  <label class="switch">
                    <input type="checkbox" :checked="state.settings.weatherAlertNotify ?? true" @change="setSetting('weatherAlertNotify', $event.target.checked)" />
                    <span class="switch-track"><span class="switch-knob"></span></span>
                  </label>
                  <div class="set-hint full">{{ t('settings.weatherAlertNotifyHint') }}</div>
                </div>
              </div>
            </template>

            <!-- data -->
            <template v-if="tab === 'data'">
              <div class="set-row">
                <label>{{ t('settings.export') }}</label>
                <button class="btn primary" @click="onExport"><Download :size="15" /> {{ t('settings.export') }}</button>
              </div>

              <!-- scheduled backup -->
              <div class="set-row">
                <label>{{ t('settings.backup') }}</label>
                <label class="switch">
                  <input type="checkbox" :checked="backup.enabled" @change="onBackupToggle" />
                  <span class="switch-track"><span class="switch-knob"></span></span>
                  <span class="switch-label">{{ t('settings.backupEnable') }}</span>
                </label>
              </div>
              <div class="set-row">
                <label>{{ t('settings.backupFreq') }}</label>
                <select class="set-select" :value="backup.freq" @change="onBackupFreq">
                  <option value="daily">{{ t('settings.backupDaily') }}</option>
                  <option value="weekday">{{ t('settings.backupWeekday') }}</option>
                  <option value="weekly">{{ t('settings.backupWeekly') }}</option>
                </select>
              </div>
              <div class="set-row">
                <label>{{ t('settings.backupTime') }}</label>
                <input class="set-input time" type="time" :value="backup.time" @change="onBackupTime" />
              </div>
              <div class="set-row">
                <label>{{ t('settings.backupLast') }}</label>
                <span class="set-note">{{ fmtBackupTime(backup.lastAt) }} · {{ fmtBackupSize(backup.size) }}</span>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.backupFile') }}</label>
                <div class="btn-row">
                  <button class="btn" :disabled="backupBusy" @click="onBackupNow">
                    <Archive :size="15" /> {{ t('settings.backupNow') }}
                  </button>
                  <button class="btn ghost" @click="onOpenBackupDir"><FolderOpen :size="15" /> {{ t('settings.backupOpenDir') }}</button>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.notesDir') }}</label>
                <div class="btn-row">
                  <button class="btn ghost" @click="onOpenNotesDir"><FolderOpen :size="15" /> {{ t('settings.notesOpenDir') }}</button>
                </div>
              </div>
              <div class="set-row wrap">
                <label>{{ t('settings.restore') }}</label>
                <div class="btn-row">
                  <button class="btn" :disabled="restoring" @click="onRestore">
                    <Upload :size="15" /> {{ restoring ? t('settings.restoring') : t('settings.restoreBtn') }}
                  </button>
                </div>
                <div class="set-hint full">{{ t('settings.restoreHint') }}</div>
              </div>
            </template>

            <!-- about -->
            <template v-if="tab === 'about'">
              <img v-if="aboutLogo" class="about-logo-img" :src="aboutLogo" alt="Tomatodo" />
              <div v-else class="about-logo"><ListChecks :size="26" /></div>
              <div class="about-name">Tomatodo</div>
              <div class="about-ver">{{ version }} · Electron + Vue + SQLite</div>
              <p class="about-text">{{ t('settings.aboutText') }}</p>
              <p class="about-disclaimer">{{ t('settings.disclaimer') }}</p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-modal { flex-direction: row; width: min(700px, calc(100vw - 80px)); height: 480px; padding: 0; }
.settings-side {
  width: 172px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--divider);
  padding: 12px 8px;
  display: flex; flex-direction: column; gap: 2px;
  flex-shrink: 0;
  overflow-y: auto;
}
.side-tab {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-base);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--t-fast);
}
.side-tab:hover { background: var(--bg-hover); }
.side-tab.active { background: var(--bg-selected); color: var(--fg-text); font-weight: 500; }
.settings-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.settings-head {
  display: flex; align-items: center;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--divider);
}
.settings-head h3 { font-size: var(--fs-md); font-weight: 600; }
.settings-head .icon-btn { margin-left: auto; }
.settings-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }

.set-row { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; }
.set-row > label:first-child { font-size: var(--fs-base); color: var(--fg-text); min-width: 130px; flex-shrink: 0; }
.check-row { cursor: pointer; gap: 10px; }
.check-row.dim { opacity: 0.45; pointer-events: none; }
.set-check { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.seg { display: inline-flex; background: var(--bg-hover); border-radius: var(--r-sm); padding: 2px; }
.seg-btn {
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  padding: 5px 12px;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--t-fast), color var(--t-fast);
}
.seg-btn.on { background: var(--accent); color: var(--fg-on-accent); font-weight: 500; }
.set-select, .set-input {
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--bg-input);
  color: var(--fg-text);
  font-size: var(--fs-base);
  padding: 7px 10px;
  font-family: inherit;
  outline: none;
  min-width: 170px;
  max-width: 100%;
  box-sizing: border-box;
}
.set-input:focus, .set-select:focus { border-color: var(--accent); }
/* switch toggle */
.switch { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch-track {
  position: relative;
  width: 40px; height: 22px;
  border-radius: var(--r-full);
  background: var(--bg-field);
  border: 1px solid var(--border-strong);
  transition: background var(--t-fast), border var(--t-fast);
  flex-shrink: 0;
}
.switch-knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  border-radius: var(--r-full);
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform var(--t-med) var(--ease);
}
.switch input:checked + .switch-track { background: var(--accent); border-color: var(--accent); }
.switch input:checked + .switch-track .switch-knob { transform: translateX(18px); }
.switch input:focus-visible + .switch-track { box-shadow: 0 0 0 3px var(--accent-soft); }
.switch-label { font-size: var(--fs-base); color: var(--fg-text); }
.set-note { font-size: var(--fs-sm); color: var(--fg-secondary); }
.btn-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.set-input.time { min-width: 110px; }
.set-input.shortcut { min-width: 150px; font-family: var(--font-mono); font-size: var(--fs-sm); }
.set-hint { font-size: var(--fs-xs); color: var(--fg-tertiary); }
.set-hint.full { flex-basis: 100%; padding-left: 142px; }
.set-range { flex: 1; accent-color: var(--accent); min-width: 120px; }
.range-val { font-size: var(--fs-xs); color: var(--fg-tertiary); width: 44px; font-variant-numeric: tabular-nums; }

.bg-preview {
  width: 200px; height: 90px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background-size: cover;
  background-position: center;
  background-color: var(--bg-hover);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.bg-empty { font-size: 22px; opacity: 0.5; }
.row-btns { display: flex; gap: 8px; }

.about-logo-img {
  width: 88px; height: 88px;
  border-radius: 20px;
  box-shadow: var(--shadow-pop);
  margin: 8px auto 0;
  display: block;
  object-fit: cover;
}
.set-input.wide { min-width: 260px; }
.order-list { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
.order-card {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-card);
  font-size: var(--fs-sm);
  cursor: grab;
  user-select: none;
  transition: box-shadow var(--t-fast), border var(--t-fast);
}
.order-card:hover { border-color: var(--border-strong); }
.order-card.dragging { opacity: 0.45; border-style: dashed; }
.order-grip { color: var(--fg-tertiary); letter-spacing: -2px; }
.about-logo {
  width: 64px; height: 64px;
  border-radius: var(--r-xl);
  background: var(--today-grad);
  color: #fff;
  font-size: 30px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-today);
  margin: 8px auto 0;
}
.about-name { text-align: center; font-size: var(--fs-lg); font-weight: 700; margin-top: 12px; }
.about-ver { text-align: center; font-size: var(--fs-xs); color: var(--fg-tertiary); margin-top: 2px; }
.about-text { font-size: var(--fs-sm); color: var(--fg-secondary); text-align: center; max-width: 380px; margin: 0 auto; }
.about-disclaimer { font-size: var(--fs-xs); color: var(--fg-tertiary); text-align: center; }
</style>
