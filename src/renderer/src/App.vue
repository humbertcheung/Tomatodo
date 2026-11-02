<script setup>
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
import { state, openView, openTask, toggleTaskComplete, updateTask, deleteTask, initStore, toast, dismissToast, askConfirm, pomoStart, pomoPause, togglePin, setSetting, openFocus } from './store'
import { t } from './i18n'
import Sidebar from './components/Sidebar.vue'
import TaskListView from './components/TaskListView.vue'
import TaskDetail from './components/TaskDetail.vue'
import NotesView from './components/NotesView.vue'
import NoteDetail from './components/NoteDetail.vue'
import PomodoroFocus from './components/PomodoroFocus.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import SettingsModal from './components/SettingsModal.vue'
import AboutModal from './components/AboutModal.vue'
import NotePopup from './components/NotePopup.vue'
import DialogHost from './components/DialogHost.vue'
import { PanelLeft, Search, Pin, PinOff, ListChecks, Image as ImageIcon, X, Sun, Moon } from 'lucide-vue-next'

const isMac = window.api?.platform === 'darwin'
const aboutOpen = ref(false)
const tomatoLogo = ref(null)

const detailOpen = computed(() =>
  state.mode === 'todo' ? !!state.selectedTaskId : !!state.selectedNoteId
)
// sidebar shows unless user closed it or window is narrow (auto-hide frees space for content)
const sidebarVisible = computed(() => state.sidebarOpen && !state.narrow)
const sidebarOverlay = computed(() => state.sidebarOpen && state.narrow)
const isFocus = computed(() => state.focusMode)

// appearance quick toggle: light ↔ dark
async function cycleTheme() {
  const cur = state.settings.theme ?? 'system'
  await setSetting('theme', cur === 'dark' ? 'light' : 'dark')
}

// background layer: image > solid color preset > none
// each preset carries its base tone so inputs can derive a deeper sibling color
const BG_PRESETS = [
  {
    id: 'dawn', base: '#f3cfae', baseDark: '#4a3d8f',
    css: 'linear-gradient(135deg, #fbc2a9 0%, #f6d5c3 45%, #c9d7f0 100%)',
    cssDark: 'linear-gradient(135deg, #1c1035 0%, #33184d 45%, #10304f 100%)'
  },
  {
    id: 'mint', base: '#cfe8dd', baseDark: '#1f6e63',
    css: 'linear-gradient(135deg, #d3f0e3 0%, #c3e4f0 55%, #e8e2f5 100%)',
    cssDark: 'linear-gradient(135deg, #07231f 0%, #0d3a38 55%, #142a3c 100%)'
  },
  {
    id: 'sakura', base: '#f4dfe8', baseDark: '#a04a78',
    css: 'linear-gradient(135deg, #fbe0e8 0%, #f3e3f5 50%, #e3e9f5 100%)',
    cssDark: 'linear-gradient(135deg, #2b0f26 0%, #3d1038 50%, #1c1035 100%)'
  },
  {
    id: 'ocean', base: '#d3e6ef', baseDark: '#2a6ea8',
    css: 'linear-gradient(135deg, #c9e4f5 0%, #d8e8f0 50%, #eef0e2 100%)',
    cssDark: 'linear-gradient(135deg, #0a1c38 0%, #0e2c48 50%, #0c2030 100%)'
  },
  {
    id: 'dusk', base: '#d8d2e8', baseDark: '#6a5ac0',
    css: 'linear-gradient(135deg, #e8c9e0 0%, #c9d0f0 55%, #cfe8ef 100%)',
    cssDark: 'linear-gradient(135deg, #1a0f30 0%, #1b1444 55%, #0e2138 100%)'
  }
]

// inputs follow the wallpaper: solid color → the same tone, slightly deepened;
// image → white; none → theme token (handled in CSS)
const fieldStyle = computed(() => {
  const presetId = state.settings.bgColor
  const dark = state.theme === 'dark'
  if (state.settings.bgImage) return { '--bg-field': dark ? '#1c1c2c' : '#ffffff' }
  if (presetId) {
    const p = BG_PRESETS.find((x) => x.id === presetId)
    if (p) {
      // light: bg tone slightly deepened; dark: a deep neon sibling
      const field = dark
        ? `color-mix(in srgb, ${p.baseDark} 42%, #0b0b16)`
        : `color-mix(in srgb, ${p.base} 92%, black)`
      const tint = dark
        ? `color-mix(in srgb, ${p.baseDark} 55%, #8b8bd0)`
        : p.base
      return { '--bg-field': field, '--card-tint': tint }
    }
  }
  return {}
})
const bgPresetCss = computed(() => {
  const c = state.settings.bgColor
  if (!c) return null
  const p = BG_PRESETS.find((x) => x.id === c) || BG_PRESETS[0]
  return state.theme === 'dark' ? (p.cssDark || p.css) : p.css
})
const bgUrl = computed(() => {
  const p = state.settings.bgImage
  if (!p) return null
  return 'file://' + p.split('/').map(encodeURIComponent).join('/')
})
const wpImgStyle = computed(() => {
  if (bgUrl.value) {
    const blur = Number(state.settings.bgBlur ?? 6)
    return { backgroundImage: `url("${bgUrl.value}")`, filter: `blur(${blur}px)` }
  }
  if (bgPresetCss.value) return { background: bgPresetCss.value }
  return null
})
const wpDimStyle = computed(() => {
  const dim = Number(state.settings.bgDim ?? 30) / 100
  const hasBg = bgUrl.value || bgPresetCss.value
  return hasBg ? { opacity: String(dim * 0.55) } : { opacity: '0' }
})

// responsive auto-collapse: crossing the threshold hides the sidebar;
// while narrow it can still be opened manually as an overlay
function onResize() {
  const wasNarrow = state.narrow
  state.narrow = window.innerWidth < 600
  if (!wasNarrow && state.narrow) {
    state.sidebarOpen = false
    state.selectedTaskId = null
    state.selectedNoteId = null
  }
  if (wasNarrow && !state.narrow) state.sidebarOpen = true
}

async function handleCommand(cmd) {
  if (cmd.startsWith('open-smart:')) { state.mode = 'todo'; openView('smart', cmd.slice(11)); return }
  switch (cmd) {
    case 'focus-new-task': window.dispatchEvent(new CustomEvent('focus-new-task')); break
    case 'new-note': state.mode = 'note'; import('./store').then((m) => m.createNote()); break
    case 'open-pomodoro': openFocus(); break
    case 'search': state.searchOpen = true; break
    case 'preferences': state.settingsOpen = true; break
    case 'about': aboutOpen.value = true; break
    case 'export': window.api.exportData(); break
    case 'toggle-complete': if (state.selectedTaskId) { const task = state.tasks.find((x) => x.id === state.selectedTaskId); if (task) toggleTaskComplete(task) } break
    case 'toggle-important': if (state.selectedTaskId) { const task = state.tasks.find((x) => x.id === state.selectedTaskId); if (task) updateTask(task.id, { importance: task.importance === 'important' ? 'normal' : 'important' }) } break
    case 'toggle-myday': if (state.selectedTaskId) { const task = state.tasks.find((x) => x.id === state.selectedTaskId); if (task) updateTask(task.id, { my_day_date: task.my_day_date ? null : todayStr() }) } break
    case 'due-today': setDue(todayStr()); break
    case 'due-tomorrow': { const d = new Date(); d.setDate(d.getDate() + 1); setDue(fmt(d)) } break
    case 'remove-due-date': setDue(null); break
    case 'rename-task': window.dispatchEvent(new CustomEvent('rename-selected-task')); break
    case 'delete-task': if (state.selectedTaskId) { const task = state.tasks.find((x) => x.id === state.selectedTaskId); if (task) deleteTask(task) } break
    case 'hide-completed': window.dispatchEvent(new CustomEvent('toggle-completed-section')); break
    case 'toggle-stay-in-front': await onTogglePin(); break
  }
}

async function onTogglePin() {
  const on = await togglePin()
  toast(on ? '📌 ' + t('pin.on') + ' · ' + t('pin.off') : t('pin.off'))
}

function setDue(v) {
  if (state.selectedTaskId) updateTask(state.selectedTaskId, { due_date: v })
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// click blank content area → close detail
function onContentClick(e) {
  if (state.ctxMenu) { state.ctxMenu = null; return }
  if (!detailOpen.value) return
  if (e.target.closest('.task-card, .note-card, .add-bar, .pop-anchor, .detail-col, .note-editor, input, button, textarea')) return
  if (state.mode === 'todo') state.selectedTaskId = null
  else state.selectedNoteId = null
}

// right-click blank content → wallpaper quick menu
function onContentContext(e) {
  if (e.target.closest('.task-card, .note-card, .add-bar, .detail-col, .sidebar, .topbar, input, button, textarea, .note-editor')) return
  e.preventDefault()
  state.ctxMenu = {
    x: Math.min(e.clientX, window.innerWidth - 270),
    y: Math.min(e.clientY, window.innerHeight - 300)
  }
}

async function ctxPickImage() {
  state.ctxMenu = null
  try {
    const p = await window.api.dialog.pickImage()
    if (p) {
      await setSetting('bgImage', p)
      await setSetting('bgColor', null)
    }
  } catch (err) {
    toast('⚠ ' + (err?.message || String(err)))
  }
}
async function ctxPickColor(c) {
  await setSetting('bgColor', c)
  await setSetting('bgImage', null)
}
async function ctxClear() {
  state.ctxMenu = null
  await setSetting('bgImage', null)
  await setSetting('bgColor', null)
}

let offCommand = null
let offOpenTask = null
let offOpenNote = null

onMounted(async () => {
  offCommand = window.api.onCommand(handleCommand)
  offOpenTask = window.api.onOpenTask((taskId) => openTask(taskId))
  offOpenNote = window.api.onOpenNote((id) => { state.mode = 'note'; state.selectedNoteId = id })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  onResize()
  tomatoLogo.value = await window.api.iconUrl()
})

onBeforeUnmount(() => {
  offCommand?.(); offOpenTask?.(); offOpenNote?.()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); state.searchOpen = true }
  if (e.metaKey && e.key === 'b') { e.preventDefault(); state.sidebarOpen = !state.sidebarOpen }
  if (e.key === 'Escape') {
    if (state.ctxMenu) state.ctxMenu = null
    else if (state.searchOpen) state.searchOpen = false
    else if (state.settingsOpen) state.settingsOpen = false
    else if (aboutOpen.value) aboutOpen.value = false
    else if (state.dialog) { import('./store').then((m) => m.resolveDialog(null)) }
    else if (state.focusMode) state.focusMode = false
    else if (state.selectedTaskId) state.selectedTaskId = null
    else if (state.selectedNoteId) state.selectedNoteId = null
  }
}
</script>

<template>
  <div class="app-root" :class="{ narrow: state.narrow, mac: isMac, 'has-bg': !!(state.settings.bgImage || state.settings.bgColor) }" :style="fieldStyle" @click="onContentClick" @contextmenu="onContentContext">
    <!-- wallpaper layer -->
    <div v-if="wpImgStyle" class="wallpaper">
      <div class="wp-img" :style="wpImgStyle"></div>
      <div class="wp-dim" :style="wpDimStyle"></div>
    </div>

    <!-- top drag bar: toggle · pin · theme at left (after traffic lights) · brand right -->
    <header class="topbar">
      <button class="icon-btn top-btn" :aria-label="t('mode.switch')" @click="state.sidebarOpen = !state.sidebarOpen">
        <PanelLeft :size="17" />
      </button>
      <button class="icon-btn top-btn" :class="{ 'pin-on': state.pinned }" :aria-label="state.pinned ? t('pin.on') : t('pin.off')" @click="onTogglePin">
        <component :is="state.pinned ? Pin : PinOff" :size="16" />
      </button>
      <button class="icon-btn top-btn" :aria-label="t('settings.theme')" @click="cycleTheme">
        <component :is="state.theme === 'dark' ? Moon : Sun" :size="16" />
      </button>
      <div class="brand">
        <img v-if="tomatoLogo" class="brand-logo-img" :src="tomatoLogo" alt="Tomatodo" />
        <div v-else class="brand-logo"><ListChecks :size="14" :stroke-width="2.4" /></div>
        <span class="brand-name">Tomatodo</span>
      </div>
    </header>

    <!-- pomodoro minimal mode -->
    <PomodoroFocus v-if="isFocus" @pin="onTogglePin" />

    <div v-else class="app-body">
      <!-- sidebar: in-flow normally, overlay when narrow -->
      <template v-if="state.sidebarOpen">
        <Sidebar :overlay="sidebarOverlay" />
        <div v-if="sidebarOverlay" class="overlay-backdrop" @click="state.sidebarOpen = false"></div>
      </template>

      <main class="main-col" @click="onContentClick">
        <TaskListView v-if="state.mode === 'todo'" />
        <NotesView v-else />
      </main>

      <aside v-if="detailOpen" class="detail-col" @click.stop>
        <TaskDetail v-if="state.mode === 'todo' && state.selectedTaskId" :task-id="state.selectedTaskId" @close="state.selectedTaskId = null" />
        <NoteDetail v-else-if="state.selectedNoteId" :note-id="state.selectedNoteId" @close="state.selectedNoteId = null" />
      </aside>
    </div>

    <!-- wallpaper context menu -->
    <Teleport to="body">
      <div v-if="state.ctxMenu" class="ctx-backdrop" @click="state.ctxMenu = null" @contextmenu.prevent="state.ctxMenu = null">
        <div class="popover ctx" :style="{ left: state.ctxMenu.x + 'px', top: state.ctxMenu.y + 'px' }" @click.stop>
          <button class="pop-item" @click="ctxPickImage"><ImageIcon :size="15" /> {{ t('ctx.wallpaper') }}</button>
          <div class="pop-label">{{ t('ctx.colorTitle') }}</div>
          <div class="swatch-row">
            <button
              v-for="p in BG_PRESETS" :key="p.id"
              class="swatch" :class="{ on: state.settings.bgColor === p.id && !state.settings.bgImage }"
              :style="{ background: p.css }"
              :aria-label="p.id"
              @click="ctxPickColor(p.id)"
            ></button>
          </div>
          <button v-if="state.settings.bgImage || state.settings.bgColor" class="pop-item" @click="ctxClear"><X :size="15" /> {{ t('ctx.wallpaperClear') }}</button>
          <template v-if="state.settings.bgImage || state.settings.bgColor">
            <div class="pop-sep"></div>
            <div class="pop-slider">
              <span class="ps-label">{{ t('ctx.blur') }}</span>
              <input type="range" min="0" max="24" :value="state.settings.bgBlur ?? 6" @input="setSetting('bgBlur', Number($event.target.value))" />
            </div>
            <div class="pop-slider">
              <span class="ps-label">{{ t('ctx.dim') }}</span>
              <input type="range" min="0" max="80" :value="state.settings.bgDim ?? 30" @input="setSetting('bgDim', Number($event.target.value))" />
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <SearchOverlay v-if="state.searchOpen" @close="state.searchOpen = false" />
    <SettingsModal v-if="state.settingsOpen" @close="state.settingsOpen = false" />
    <AboutModal v-if="aboutOpen" @close="aboutOpen = false" />
    <DialogHost />
    <NotePopup />

    <div class="toast-wrap">
      <div v-for="one in state.toasts" :key="one.id" class="toast">
        {{ one.text }}
        <span v-if="one.undoFn" class="toast-undo" @click="one.undoFn(); dismissToast(one.id)">{{ t('task.undo') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: var(--surface-content);
  background-color: var(--bg-content);
}

/* wallpaper */
.wallpaper { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.wp-img { position: absolute; inset: -28px; background-size: cover; background-position: center; }
.wp-dim { position: absolute; inset: 0; background: var(--bg-content); }

/* with a wallpaper, chrome becomes translucent so the whole window shows it */
.app-root.has-bg .topbar { background: transparent; }
.app-root.has-bg :deep(.sidebar) { background: color-mix(in srgb, var(--bg-sidebar) 62%, transparent); }
.app-root.has-bg .detail-col { background: color-mix(in srgb, var(--bg-card) 72%, transparent); }

/* top bar — left padding avoids macOS traffic lights */
.topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 52px;
  padding: 0 14px 0 12px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  /* glassy bar with a faint accent hairline */
  /* A translucent gradient instead of backdrop-filter: a real blur has
     to re-sample the whole window whenever anything below it repaints,
     which turns a single CSS animation into ~15% GPU time. */
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--bg-content) 94%, transparent) 0%,
    color-mix(in srgb, var(--bg-content) 72%, transparent) 100%);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--accent) 12%, transparent);
}
.app-root.mac .topbar { padding-left: 84px; }
.top-btn { -webkit-app-region: no-drag; }
.top-btn.pin-on { color: var(--accent); background: var(--accent-soft); }
.top-center { position: absolute; left: 50%; transform: translateX(-50%); }
.pin-btn {
  -webkit-app-region: no-drag;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: var(--bg-card);
  color: var(--fg-tertiary);
  font-size: var(--fs-xs);
  padding: 5px 13px;
  cursor: pointer;
  transition: all var(--t-fast);
  box-shadow: var(--shadow-card);
  font-family: inherit;
}
.pin-btn:hover { color: var(--fg-text); border-color: var(--border-strong); }
.pin-btn.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.brand {
  margin-left: auto;
  display: flex; align-items: center; gap: 7px;
  -webkit-app-region: no-drag;
}
.brand-logo {
  width: 24px; height: 24px;
  border-radius: 8px;
  background: var(--today-grad);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-today);
}
.brand-logo-img {
  width: 26px; height: 26px;
  border-radius: 8px;
  box-shadow: var(--shadow-card);
  object-fit: cover;
}
.brand-name { font-weight: 600; font-size: var(--fs-sm); color: var(--fg-secondary); letter-spacing: -0.1px; }

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
  z-index: 1;
}
.main-col {
  flex: 1 1 0;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  position: relative;
}
.detail-col {
  width: 252px;              /* same as the left sidebar */
  flex-shrink: 0;
  border-left: 1px solid var(--divider);
  background: var(--bg-card);
  animation: detail-in 220ms cubic-bezier(.2, 0, 0, 1);
  overflow: hidden;
  z-index: 5;
}
.narrow .detail-col { position: absolute; right: 0; top: 0; bottom: 0; box-shadow: var(--shadow-pop); width: min(300px, 100vw - 24px); }
@keyframes detail-in {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* sidebar overlay mode (narrow windows) */
.overlay-backdrop {
  position: absolute;
  inset: 0;
  background: var(--backdrop);
  z-index: 25;
  animation: fade-in var(--t-fast) var(--ease);
}
.toast-undo { color: #8ab4ff; cursor: pointer; font-weight: 600; margin-left: 8px; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

/* wallpaper context menu */
.ctx-backdrop { position: fixed; inset: 0; z-index: 120; }
.ctx { position: absolute; min-width: 236px; }
.pop-slider {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px;
}
.ps-label { font-size: var(--fs-xs); color: var(--fg-secondary); width: 44px; flex-shrink: 0; }
.pop-slider input[type="range"] { flex: 1; accent-color: var(--accent); }
.swatch-row { display: flex; gap: 8px; padding: 4px 10px 8px; }
.swatch {
  width: 26px; height: 26px;
  border-radius: var(--r-full);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--t-fast), border var(--t-fast);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
}
.swatch:hover { transform: scale(1.12); }
.swatch.on { border-color: var(--accent); }
</style>
