<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { state, openView, switchMode, createNote, pomoStart, pomoPause, pomoReset, askConfirm, deleteNote, openFocus } from '../store'
import { t } from '../i18n'
import {
  Sun, Star, CalendarDays, CircleDashed, LayoutList, CheckCircle2,
  StickyNote, ListChecks, Settings2, Search, Play, Pause, RotateCcw, Pin, Plus, Maximize2
} from 'lucide-vue-next'

defineProps({ overlay: { type: Boolean, default: false } })

const SMART = [
  { id: 'myday', icon: Sun, key: 'smart.myday', accent: 'grad' },
  { id: 'important', icon: Star, key: 'smart.important', accent: 'crimson' },
  { id: 'planned', icon: CalendarDays, key: 'smart.planned', accent: 'teal' },
  { id: 'open', icon: CircleDashed, key: 'smart.open', accent: 'orange' },
  { id: 'all', icon: LayoutList, key: 'smart.all', accent: 'steel' },
  { id: 'completed', icon: CheckCircle2, key: 'smart.completed', accent: 'green' }
]

const smartCounts = ref({})
let refreshTimer = null

async function refreshCounts() {
  const ov = await window.api.overview()
  const [important, planned, all, completed, myday, open] = await Promise.all([
    window.api.tasks.smart('important', { include_completed: 1 }),
    window.api.tasks.smart('planned', { include_completed: 1 }),
    window.api.tasks.smart('all', { include_completed: 1 }),
    window.api.tasks.smart('completed', {}),
    window.api.tasks.smart('myday', { include_completed: 1 }),
    window.api.tasks.smart('open', {})
  ])
  smartCounts.value = {
    myday: myday.length,
    important: important.length,
    planned: planned.length,
    open: open.length,
    all: all.length,
    completed: completed.length
  }
}

let offDataChanged = null
onMounted(() => {
  refreshCounts()
  refreshTimer = setInterval(refreshCounts, 4000)
  // refresh counts immediately on any data change (e.g. starring a task)
  offDataChanged = window.api.onDataChanged(refreshCounts)
})
onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  offDataChanged?.()
})

function isSmartActive(id) { return state.mode === 'todo' && state.view.kind === 'smart' && state.view.id === id }
function count(id) { return smartCounts.value[id] || 0 }

// note-mode sidebar list: title + one-line snippet, click → select & scroll into view
const notes = computed(() => state.notes)
function snippet(n) {
  if (n.preview) return n.preview.length > 26 ? n.preview.slice(0, 26) + '…' : n.preview
  const c = (n.content || '')
    .replace(/<img[^>]*>/gi, '[图片] ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return c.length > 26 ? c.slice(0, 26) + '…' : c
}
function pickNote(n) {
  state.selectedNoteId = n.id
  window.dispatchEvent(new CustomEvent('locate-note', { detail: n.id }))
}
async function removeNote(n, e) {
  e.stopPropagation()
  const ok = await askConfirm({ title: t('note.delete'), message: `“${n.title || snippet(n)}”` })
  if (ok) await deleteNote(n)
}

const quickSearch = () => { state.searchOpen = true }

// ---- pomodoro ring ----
const pomo = computed(() => state.pomodoro)
const pomoFrac = computed(() => {
  if (!pomo.value.totalMs) return 0
  return Math.max(0, Math.min(1, pomo.value.remainingMs / pomo.value.totalMs))
})
const pomoClock = computed(() => {
  const s = Math.max(0, Math.round(pomo.value.remainingMs / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})
const R = 26
const CIRC = 2 * Math.PI * R

function togglePomo() {
  if (pomo.value.running) pomoPause()
  else pomoStart()
}
</script>

<template>
  <aside class="sidebar" :class="{ overlay }" @click.stop>
    <div class="sidebar-scroll">
      <!-- mode switch -->
      <div class="mode-switch" role="tablist" :aria-label="t('mode.switch')">
        <button class="mode-tab" :class="{ on: state.mode === 'todo' }" role="tab" :aria-selected="state.mode === 'todo'" @click="switchMode('todo')">
          <ListChecks :size="15" /> {{ t('mode.todo') }}
        </button>
        <button class="mode-tab" :class="{ on: state.mode === 'note' }" role="tab" :aria-selected="state.mode === 'note'" @click="switchMode('note')">
          <StickyNote :size="15" /> {{ t('mode.note') }}
        </button>
      </div>

      <!-- todo mode: smart views -->
      <nav v-if="state.mode === 'todo'" class="smart-nav">
        <button
          v-for="s in SMART" :key="s.id"
          class="smart-row" :class="{ active: isSmartActive(s.id) }"
          @click="openView('smart', s.id)"
        >
          <span class="smart-icon" :data-accent="s.accent">
            <component :is="s.icon" :size="16" :stroke-width="2.1" />
          </span>
          <span class="row-label">{{ t(s.key) }}</span>
          <span v-if="count(s.id)" class="row-count">{{ count(s.id) }}</span>
        </button>
      </nav>

      <!-- note mode: scrollable note list -->
      <nav v-else class="note-nav">
        <button class="smart-row head" @click="state.selectedNoteId = null">
          <span class="smart-icon" data-accent="yellow"><StickyNote :size="16" /></span>
          <span class="row-label">{{ t('note.title') }}</span>
          <span class="row-count">{{ notes.length }}</span>
        </button>
        <button class="new-note-btn" @click="createNote()">
          <Plus :size="14" /> {{ t('note.new') }}
        </button>
        <div class="note-list">
          <div v-if="!notes.length" class="note-list-empty">{{ t('note.empty') }}</div>
          <button
            v-for="n in notes" :key="n.id"
            class="side-note" :class="{ selected: state.selectedNoteId === n.id }"
            @click="pickNote(n)"
          >
            <span class="sn-ico" :data-color="n.color"><StickyNote :size="13" /></span>
            <span class="sn-body">
              <span class="sn-title">
                <Pin v-if="n.pinned" :size="10" class="sn-pin" />
                {{ n.title || t('note.placeholder') }}
              </span>
              <span class="sn-snippet">{{ snippet(n) || '…' }}</span>
            </span>
            <span class="sn-del" @click.stop="removeNote(n, $event)"><Plus :size="12" class="sn-x" /></span>
          </button>
        </div>
      </nav>

      <div v-if="state.mode === 'todo'" class="side-flex"></div>

      <!-- pomodoro card -->
      <div
        class="pomo-card" :class="{ running: pomo.running, break: pomo.mode === 'break' }"
        @dblclick="openFocus()"
      >
        <button class="pomo-expand" :aria-label="t('pomo.openApp')" @click.stop="openFocus()">
          <Maximize2 :size="12" />
        </button>
        <div class="pomo-ring-wrap">
          <svg viewBox="0 0 64 64" width="56" height="56">
            <circle cx="32" cy="32" :r="R" fill="none" stroke="var(--divider)" stroke-width="5" />
            <circle
              cx="32" cy="32" :r="R" fill="none"
              :stroke="pomo.mode === 'break' ? 'var(--success)' : '#e5484d'" stroke-width="5" stroke-linecap="round"
              :stroke-dasharray="CIRC"
              :stroke-dashoffset="CIRC * (1 - pomoFrac)"
              transform="rotate(-90 32 32)"
              style="transition: stroke-dashoffset 0.6s linear;"
            />
          </svg>
          <span class="pomo-clock">{{ pomoClock }}</span>
        </div>
        <div class="pomo-info">
          <div class="pomo-mode">{{ pomo.mode === 'work' ? t('pomo.work') : t('pomo.break') }} · {{ t('pomo.title') }}</div>
          <div class="pomo-sessions">🍅 {{ t('pomo.sessions', { n: pomo.sessionsToday }) }}</div>
          <div class="pomo-actions">
            <button class="icon-btn pomo-btn" :aria-label="pomo.running ? t('pomo.pause') : t('pomo.start')" @click="togglePomo">
              <component :is="pomo.running ? Pause : Play" :size="14" />
            </button>
            <button class="icon-btn pomo-btn" :aria-label="t('pomo.reset')" @click="pomoReset()">
              <RotateCcw :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="sidebar-foot">
        <button class="foot-btn" @click="quickSearch">
          <Search :size="16" /><span>{{ t('search.placeholder') }}</span>
        </button>
        <button class="foot-btn" @click="state.settingsOpen = true">
          <Settings2 :size="16" /><span>{{ t('settings.title') }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 252px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-sidebar);
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--divider);
  min-width: 0;
  overflow: hidden;
  animation: side-in 200ms cubic-bezier(.2, 0, 0, 1);
}
.sidebar.overlay {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  z-index: 30;
  box-shadow: var(--shadow-pop);
}
@keyframes side-in { from { margin-left: -12px; opacity: 0; } to { margin-left: 0; opacity: 1; } }
.sidebar-scroll { flex: 1; display: flex; flex-direction: column; padding: 8px 12px 12px; overflow: hidden; min-height: 0; }

.mode-switch {
  display: flex;
  background: var(--bg-hover);
  border-radius: var(--r-md);
  padding: 3px;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.mode-tab {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border: none; border-radius: calc(var(--r-md) - 3px);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 7px 0;
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast), box-shadow var(--t-fast);
  font-family: inherit;
}
.mode-tab.on { background: var(--bg-card); color: var(--fg-text); box-shadow: var(--shadow-card); }

.smart-nav { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.smart-row {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: var(--r-md);
  background: transparent;
  font-size: var(--fs-base);
  color: var(--fg-text);
  cursor: pointer;
  text-align: left;
  transition: background var(--t-fast);
  font-family: inherit;
}
.smart-row:hover { background: var(--bg-hover); }
.smart-row.active, .smart-row.head.active { background: var(--bg-selected); font-weight: 500; }

.smart-icon {
  width: 27px; height: 27px;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
}
.smart-icon[data-accent="grad"] { background: var(--today-grad); }
.smart-icon[data-accent="crimson"] { background: linear-gradient(135deg, #e05a7a, #c73a5b); }
.smart-icon[data-accent="teal"] { background: linear-gradient(135deg, #17b3a6, #0f9b9b); }
.smart-icon[data-accent="orange"] { background: linear-gradient(135deg, #f09a3e, #e07c2c); }
.smart-icon[data-accent="steel"] { background: linear-gradient(135deg, #6d8399, #5a7184); }
.smart-icon[data-accent="green"] { background: linear-gradient(135deg, #3cb371, #2e9e5b); }
.smart-icon[data-accent="yellow"] { background: linear-gradient(135deg, #eec253, #d9a419); color: #5c4708; }

.row-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-count {
  font-size: var(--fs-xs);
  color: var(--fg-tertiary);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

/* note mode list */
.note-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
.new-note-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 10px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: all var(--t-fast);
  font-family: inherit;
  flex-shrink: 0;
}
.new-note-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.note-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-right: 2px;
  margin-bottom: 10px;   /* breathing room above the pomodoro card */
}
.note-list-empty { padding: 18px 8px; text-align: center; font-size: var(--fs-xs); color: var(--fg-tertiary); }
.side-note {
  display: flex; align-items: flex-start; gap: 9px;
  width: 100%;
  padding: 9px 8px;
  border: none; border-radius: var(--r-md);
  border-bottom: 1px solid var(--divider);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--t-fast);
  font-family: inherit;
}
.side-note:last-child { border-bottom-color: transparent; }
.side-note:hover { background: var(--bg-hover); }
.side-note.selected { background: var(--bg-selected); }
.sn-ico {
  width: 24px; height: 24px;
  border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.sn-ico[data-color="yellow"] { background: var(--theme-yellow-soft); color: var(--theme-yellow); }
.sn-ico[data-color="green"] { background: var(--theme-green-soft); color: var(--theme-green); }
.sn-ico[data-color="blue"] { background: var(--theme-blue-soft); color: var(--theme-blue); }
.sn-ico[data-color="pink"] { background: var(--theme-pink-soft); color: var(--theme-pink); }
.sn-ico[data-color="purple"] { background: var(--theme-purple-soft); color: var(--theme-purple); }
.sn-ico[data-color="orange"] { background: var(--theme-orange-soft); color: var(--theme-orange); }
.sn-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sn-title {
  font-size: var(--fs-sm); font-weight: 500; color: var(--fg-text);
  display: flex; align-items: center; gap: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sn-pin { color: var(--theme-orange); flex-shrink: 0; }
.sn-snippet {
  font-size: var(--fs-xs); color: var(--fg-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sn-del {
  width: 20px; height: 20px;
  display: none; align-items: center; justify-content: center;
  border-radius: var(--r-sm);
  color: var(--fg-tertiary);
  flex-shrink: 0;
}
.side-note:hover .sn-del { display: inline-flex; }
.sn-del:hover { background: var(--theme-red-soft); color: var(--danger); }
.sn-x { transform: rotate(45deg); }

.side-flex { flex: 1; min-height: 12px; }

/* pomodoro card */
.pomo-card {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: var(--r-lg);
  background: linear-gradient(140deg, var(--bg-card) 0%, var(--theme-red-soft) 130%);
  border: 1px solid var(--divider);
  box-shadow: var(--shadow-card);
  flex-shrink: 0;
  transition: border var(--t-med), box-shadow var(--t-med), transform var(--t-med);
  cursor: default;
}
.pomo-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-pop); }
.pomo-card.running {
  border-color: rgba(229, 72, 77, 0.55);
  box-shadow: 0 0 0 3px rgba(229, 72, 77, 0.10), var(--shadow-card);
  background: linear-gradient(140deg, var(--bg-card) 0%, #ffe9e6 130%);
}
.pomo-card.running.break {
  border-color: rgba(63, 174, 90, 0.5);
  box-shadow: 0 0 0 3px rgba(63, 174, 90, 0.10), var(--shadow-card);
  background: linear-gradient(140deg, var(--bg-card) 0%, var(--theme-green-soft) 130%);
}
.pomo-expand {
  position: absolute;
  top: 6px; right: 6px;
  width: 22px; height: 22px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all var(--t-fast);
}
.pomo-expand:hover { background: var(--accent-soft); color: var(--accent); }
.pomo-ring-wrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
.pomo-ring-wrap svg { display: block; }
.pomo-clock {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg-text);
}
.pomo-info { flex: 1; min-width: 0; }
.pomo-mode { font-size: var(--fs-sm); font-weight: 600; color: var(--fg-text); }
.pomo-sessions { font-size: var(--fs-xs); color: var(--fg-tertiary); margin-top: 2px; }
.pomo-actions { display: flex; gap: 4px; margin-top: 6px; }
.pomo-btn { width: 26px; height: 26px; background: var(--bg-hover); }
.pomo-btn:hover { background: var(--accent-soft); color: var(--accent); }

.sidebar-foot {
  border-top: 1px solid var(--divider);
  margin-top: 12px;
  padding-top: 8px;
  display: flex; flex-direction: column; gap: 1px;
  flex-shrink: 0;
}
.foot-btn {
  display: flex; align-items: center; gap: 9px;
  width: 100%;
  padding: 8px 8px;
  border: none; border-radius: var(--r-md);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-base);
  cursor: pointer;
  text-align: left;
  transition: background var(--t-fast);
  font-family: inherit;
}
.foot-btn:hover { background: var(--bg-hover); color: var(--fg-text); }
.foot-btn span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
