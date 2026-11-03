<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { t } from './i18n'
import { parseSmartDate } from '@shared/nlp'
import { htmlToText } from '@shared/rtf'
import {
  Plus, Check, ArrowRight, Sun, CalendarDays, ListChecks, StickyNote, Search, Pin,
  ChevronRight, Star, ExternalLink, Clock, Flame
} from 'lucide-vue-next'

const tomatoLogo = ref(null)
const inputEl = ref(null)
const subject = ref('')
/* the panel shows two modules: 已计划 (planned) and 便签 (notes) */
const sectionOrder = ref(['planned', 'notes'])
const showPlanned = ref(true)
const showNotes = ref(true)
const data = ref(null)
const kind = ref('todo')            // capture target: 'todo' | 'note'
const parsed = ref(null)

/* rows the user expanded — id → true */
const expanded = ref(new Set())

const SECTION_NAMES = { planned: '已计划', notes: '便签' }

async function loadOrder() {
  // the order AND the visibility flags live in the settings — read both
  try {
    const [flags, saved] = await Promise.all([
      window.api.settings.get('quickModules'),
      window.api.settings.get('quickSectionOrder')
    ])
    showPlanned.value = flags?.planned !== false
    showNotes.value = flags?.notes !== false
    if (Array.isArray(saved) && saved.length) {
      // keep only the sections we actually render, in the saved order
      const known = ['planned', 'notes']
      const order = saved.filter((k) => known.includes(k))
      for (const k of known) if (!order.includes(k)) order.push(k)
      sectionOrder.value = order
    }
  } catch {
    sectionOrder.value = ['planned', 'notes']
  }
}

onMounted(async () => {
  try { tomatoLogo.value = await window.api.iconUrl() } catch { tomatoLogo.value = null }
  window.__quickLogo = tomatoLogo.value
  await loadOrder()
  data.value = await window.api.quickData()
  document.documentElement.dataset.theme =
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  window.api.onThemeChanged((mode) => { document.documentElement.dataset.theme = mode })
  // re-read order + data on every panel invocation (settings may have changed)
  window.api.onQuickShow(async () => {
    await loadOrder()
    data.value = await window.api.quickData()
    focusInput()
  })
  // the order changed in the settings → apply it right away
  window.api.onQuickSectionOrder?.(() => { loadOrder() })
  focusInput()
})

function focusInput() {
  nextTick(() => inputEl.value?.focus())
}

function onInput() {
  try { parsed.value = kind.value === 'todo' ? parseSmartDate(subject.value) : null } catch { parsed.value = null }
}

const hint = computed(() => {
  if (kind.value !== 'todo' || !parsed.value?.dueDate) return ''
  const lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  const d = new Date(parsed.value.dueDate + 'T00:00:00')
  return '📅 ' + d.toLocaleDateString(lang, { month: 'short', day: 'numeric' }) +
    (parsed.value.reminder ? ' ⏰' : '')
})

const noteFilter = ref('')
function secStyle(key) {
  return { order: sectionOrder.value.indexOf(key) }
}

const filteredNotes = computed(() => {
  if (!data.value) return []
  const q = noteFilter.value.trim().toLowerCase()
  if (!q) return data.value.notes
  return data.value.notes.filter((n) =>
    (n.title || '').toLowerCase().includes(q) || (n.preview || '').toLowerCase().includes(q))
})

/* ---------- planned rows ---------- */

function isOpen(id) { return expanded.value.has(id) }
function toggleOpen(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expanded.value = next
}

const lang = computed(() => (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'))

function fmtDue(task) {
  if (!task.due_date && !task.reminder_date) return t('quick.noDate')
  const iso = task.due_date || task.reminder_date
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  const today = new Date()
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const diff = Math.round((new Date(ymd(d)) - new Date(ymd(today))) / 86400000)
  if (diff === 0) return t('quick.dueToday')
  if (diff === 1) return t('quick.dueTomorrow')
  if (diff < 0) return t('quick.dueOverdue')
  return d.toLocaleDateString(lang.value, { month: 'short', day: 'numeric' })
}
function dueKind(task) {
  if (!task.due_date && !task.reminder_date) return 'none'
  const iso = task.due_date || task.reminder_date
  const today = new Date()
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const diff = Math.round((new Date(ymd(new Date(iso + 'T00:00:00'))) - new Date(ymd(today))) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return 'future'
}

function noteText(n) {
  if (n?.preview) return n.preview
  return htmlToText(n?.content || '')
}

async function add(e) {
  if (e && (e.isComposing || e.keyCode === 229)) return // IME composition Enter
  const v = subject.value.trim()
  if (!v) return
  await window.api.quickAdd({ kind: kind.value, subject: v })
  subject.value = ''
  parsed.value = null
  data.value = await window.api.quickData()
  focusInput()
}

async function toggleDone(task) {
  await window.api.quickToggleDone(task.id, true)
  data.value = await window.api.quickData()
}

function openNote(n) {
  window.api.quickOpenNote(n.id)
}

function closePanel() { window.api.quickClose() }
function openMainWin() { window.api.quickOpenMain() }

// 置顶: keep the panel above other windows
const pinned = ref(false)
async function togglePin() {
  pinned.value = await window.api.quickAlwaysOnTop(!pinned.value)
}
onMounted(async () => {
  try { pinned.value = await window.api.quickIsAlwaysOnTop() } catch { pinned.value = false }
})
</script>

<template>
  <div class="qpanel" v-if="data">
    <div class="qhead">
      <img v-if="tomatoLogo" class="qlogo-img" :src="tomatoLogo" alt="Tomatodo" />
      <div v-else class="qlogo"><ListChecks :size="15" /></div>
      <span class="qtitle">{{ t('quick.title') }}</span>
      <span class="qcounts">
        <span class="qcount sun"><Sun :size="12" /> {{ data.overview.myday }}</span>
        <span class="qcount"><CalendarDays :size="12" /> {{ data.overview.due }}</span>
      </span>
      <button
        class="qpin"
        :class="{ on: pinned }"
        :aria-label="pinned ? t('quick.unpin') : t('quick.pin')"
        :aria-pressed="pinned"
        :title="pinned ? t('quick.unpin') : t('quick.pin')"
        @click="togglePin"
      >
        <Pin :size="13" />
      </button>
    </div>

    <!-- capture: inline target toggle + input -->
    <div class="qadd">
      <div class="qkind" role="tablist" :aria-label="t('mode.switch')">
        <button class="qk-btn" :class="{ on: kind === 'todo' }" :aria-selected="kind === 'todo'" role="tab" @click="kind = 'todo'; parsed = null; focusInput()" :aria-label="t('quick.tabTodo')">
          <ListChecks :size="13" />
        </button>
        <button class="qk-btn" :class="{ on: kind === 'note' }" :aria-selected="kind === 'note'" role="tab" @click="kind = 'note'; parsed = null; focusInput()" :aria-label="t('quick.tabNote')">
          <StickyNote :size="13" />
        </button>
      </div>
      <input
        ref="inputEl"
        v-model="subject"
        class="qinput"
        :placeholder="kind === 'todo' ? t('quick.placeholderTodo') : t('quick.placeholderNote')"
        @input="onInput"
        @keydown.enter="add"
        @compositionend="onInput"
        @keydown.esc="closePanel"
      />
      <button class="qadd-btn" :class="{ on: subject.trim() }" :aria-label="t('quick.add')" @click="add">
        <Plus :size="16" />
      </button>
    </div>
    <div class="qhint-row">
      <span v-if="hint" class="qhint">{{ hint }}</span>
      <span v-else class="qhint dim">{{ kind === 'todo' ? t('add.hint') : t('quick.placeholderNote') }}</span>
    </div>

    <!-- unified scroll body -->
    <div class="qbody">
      <!-- 1) 已计划 -->
      <div v-if="showPlanned" class="qsec-block" :style="secStyle('planned')">
        <div class="qsect">
          <span class="qsect-label">{{ t('quick.planned') }} · {{ data.planned.length }}</span>
        </div>
        <div v-if="!data.planned.length" class="qempty">{{ t('quick.noPlanned') }}</div>
        <div v-for="task in data.planned" :key="task.id" class="qrow">
          <div class="qtask" :class="{ open: isOpen(task.id) }">
            <button class="qcheck" :aria-label="t('quick.markDone')" @click.stop="toggleDone(task)">
              <Check :size="11" />
            </button>
            <button class="qtask-main" @click="toggleOpen(task.id)">
              <span class="qtask-title" :title="task.subject">{{ task.subject }}</span>
              <span class="qtask-tags">
                <span class="qtag" :data-kind="dueKind(task)">
                  <CalendarDays :size="10" /> {{ fmtDue(task) }}
                </span>
                <span v-if="task.importance === 'important'" class="qtag star">
                  <Star :size="10" /> {{ t('quick.important') }}
                </span>
                <span v-if="task.reminder_date" class="qtag bell">
                  <Clock :size="10" /> {{ t('quick.remind') }}
                </span>
              </span>
              <span v-if="isOpen(task.id)" class="qtask-more">
                <span v-if="task.note_html" class="qtask-note">{{ htmlToText(task.note_html) }}</span>
                <span v-else class="qtask-note dim">{{ t('quick.noMore') }}</span>
              </span>
            </button>
            <ChevronRight class="qcaret" :class="{ open: isOpen(task.id) }" :size="13" @click.stop="toggleOpen(task.id)" />
          </div>
        </div>
      </div>

      <!-- 2) 便签 -->
      <div v-if="showNotes" class="qsec-block" :style="secStyle('notes')">
        <div class="qsect">
          <span class="qsect-label">{{ t('quick.notes') }} · {{ filteredNotes.length }}</span>
          <div class="qnf">
            <Search :size="11" class="qnf-ico" />
            <input v-model="noteFilter" class="qnf-input" :placeholder="t('quick.notesFilter')" />
          </div>
        </div>
        <div v-if="!filteredNotes.length" class="qempty">{{ t('quick.noNotes') }}</div>
        <div v-for="n in filteredNotes" :key="n.id" class="qrow">
          <div class="qnote" :data-color="n.color" :class="{ open: isOpen(n.id) }" @click="toggleOpen(n.id)">
            <span class="qn-ico"><StickyNote :size="12" /></span>
            <span class="qn-body">
              <span class="qn-title" :title="n.title || noteText(n)">{{ n.title || noteText(n).split('\n')[0] || '…' }}</span>
              <span class="qn-tags">
                <span v-if="n.pinned" class="qtag star"><Pin :size="10" /> {{ t('quick.pinned') }}</span>
                <span class="qtag date">{{ (n.updated_at || '').slice(0, 10) }}</span>
              </span>
              <span v-if="isOpen(n.id)" class="qtask-more">
                <span class="qtask-note">{{ noteText(n) }}</span>
                <button class="qopen-btn" @click.stop="openNote(n)">
                  {{ t('quick.openNote') }} <ExternalLink :size="11" />
                </button>
              </span>
            </span>
            <ChevronRight class="qcaret" :class="{ open: isOpen(n.id) }" :size="13" @click.stop="toggleOpen(n.id)" />
          </div>
        </div>
      </div>
    </div>

    <button class="qfoot" @click="openMainWin">
      {{ t('quick.openApp') }} <ArrowRight :size="14" />
    </button>
  </div>
</template>

<style scoped>
.qpanel {
  height: calc(100vh - 12px);
  display: flex;
  flex-direction: column;
  background: var(--bg-popover);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--shadow-pop);
  margin: 6px;
}
.qhead {
  display: flex; align-items: center; gap: 8px; padding: 12px 14px 6px;
  /* the header is the drag handle for the frameless panel */
  -webkit-app-region: drag;
  cursor: default;
}
.qlogo-img {
  width: 24px; height: 24px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: var(--shadow-card);
  -webkit-app-region: no-drag;
}
.qlogo {
  width: 22px; height: 22px;
  border-radius: 7px;
  background: var(--today-grad);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.qtitle { font-weight: 600; font-size: var(--fs-base); }
.qcounts { margin-left: auto; display: flex; gap: 8px; }
.qcount {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--fs-xs); color: var(--fg-tertiary);
  font-variant-numeric: tabular-nums;
}
.qcount.sun { color: var(--theme-orange); }

/* 置顶 toggle */
.qpin {
  width: 24px; height: 24px;
  margin-left: 8px;
  padding: 0;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  transition: background var(--t-fast), color var(--t-fast);
}
.qpin:hover { background: var(--bg-hover); color: var(--fg-secondary); }
.qpin.on { background: var(--accent); color: var(--fg-on-accent); }
.qpin.on:hover { filter: brightness(1.06); }

.qadd {
  display: flex; align-items: center; gap: 8px;
  margin: 6px 12px 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 3px 4px 3px 4px;
  transition: border var(--t-fast), box-shadow var(--t-fast);
  -webkit-app-region: no-drag;
}
.qadd:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.qkind {
  display: flex; gap: 2px;
  background: var(--bg-hover);
  border-radius: var(--r-sm);
  padding: 2px;
  flex-shrink: 0;
}
.qk-btn {
  width: 26px; height: 26px;
  border: none; border-radius: calc(var(--r-sm) - 2px);
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--t-fast), color var(--t-fast);
}
.qk-btn.on { background: var(--bg-card); color: var(--accent); box-shadow: var(--shadow-card); }
.qinput {
  flex: 1; border: none; outline: none;
  background: transparent;
  font-size: var(--fs-base);
  color: var(--fg-text);
  padding: 8px 0;
  min-width: 0;
  font-family: inherit;
}
.qinput::placeholder { color: var(--fg-tertiary); }
.qadd-btn {
  width: 28px; height: 28px;
  border: none; border-radius: var(--r-sm);
  background: var(--bg-hover);
  color: var(--fg-tertiary);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--t-fast), color var(--t-fast), transform var(--t-fast);
  flex-shrink: 0;
}
.qadd-btn.on { background: var(--accent); color: var(--fg-on-accent); }
.qadd-btn:active { transform: scale(0.94); }

.qhint-row { display: flex; align-items: center; padding: 5px 14px 2px; min-height: 20px; }
.qhint { font-size: var(--fs-xs); color: var(--accent); font-weight: 500; }
.qhint.dim { color: var(--fg-tertiary); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.qbody { flex: 1; overflow-y: auto; padding: 6px 8px 4px; min-height: 0; display: flex; flex-direction: column; align-items: stretch; }
.qsec-block { display: flex; flex-direction: column; }
.qsect { padding: 8px 8px 4px; display: flex; align-items: center; gap: 8px; }
.qsect-label {
  font-size: var(--fs-xs); font-weight: 600;
  color: var(--fg-tertiary);
  text-transform: uppercase; letter-spacing: 0.4px;
  flex-shrink: 0;
}
.qempty { padding: 16px 12px; text-align: center; color: var(--fg-tertiary); font-size: var(--fs-sm); }

.qrow { display: flex; flex-direction: column; }
.qtask, .qnote {
  display: flex; align-items: flex-start; gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-text);
  text-align: left;
  font-family: inherit;
  transition: background var(--t-fast);
}
.qtask:hover, .qnote:hover { background: var(--bg-hover); }
.qtask.open, .qnote.open { background: var(--bg-hover); }
.qcheck {
  width: 16px; height: 16px;
  padding: 0;
  border: 1.5px solid var(--fg-tertiary);
  border-radius: var(--r-full);
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: transparent;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all var(--t-fast);
  cursor: pointer;
}
.qtask:hover .qcheck { border-color: var(--success); color: var(--success); }
.qtask-main {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 3px;
  border: none; background: transparent;
  padding: 0; text-align: left;
  color: inherit; font-family: inherit;
  cursor: pointer;
}
.qtask-title {
  font-size: var(--fs-sm);
  /* the planned list is the focus of the panel — make it read at a glance */
  font-weight: 800;
  letter-spacing: -0.1px;
  line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qtask-tags, .qn-tags { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.qtag {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 6px;
  border-radius: var(--r-full);
  background: var(--bg-hover);
  color: var(--fg-tertiary);
  font-size: 10px;
  line-height: 1.6;
  white-space: nowrap;
}
.qtag[data-kind="today"] { background: var(--theme-orange-soft); color: var(--theme-orange); }
.qtag[data-kind="overdue"] { background: var(--theme-red-soft); color: var(--theme-red); }
.qtag[data-kind="tomorrow"] { background: var(--theme-yellow-soft); color: var(--theme-yellow); }
.qtag[data-kind="future"] { background: var(--theme-blue-soft); color: var(--theme-blue); }
.qtag.star { background: var(--theme-crimson-soft); color: var(--theme-crimson); }
.qtag.bell { background: var(--theme-purple-soft); color: var(--theme-purple); }
.qtag.dim { background: transparent; }
.qtag.date { background: var(--bg-hover); color: var(--fg-tertiary); }
.qtask-more {
  margin-top: 3px;
  padding: 6px 8px;
  border-left: 2px solid var(--border);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  background: var(--bg-card);
}
.qtask-note {
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--fg-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  display: block;
  max-height: 130px;
  overflow-y: auto;
}
.qtask-note.dim { color: var(--fg-tertiary); font-style: italic; }
.qcaret {
  color: var(--fg-tertiary);
  flex-shrink: 0;
  opacity: 0.5;
  margin-top: 2px;
  cursor: pointer;
  transition: transform var(--t-fast), opacity var(--t-fast);
}
.qcaret.open { transform: rotate(90deg); opacity: 1; }

.notes-head .qnf {
  margin-left: auto;
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-hover);
  border-radius: var(--r-full);
  padding: 2px 10px;
  min-width: 0;
}
.qnf-ico { color: var(--fg-tertiary); flex-shrink: 0; }
.qnf-input {
  border: none; outline: none; background: transparent;
  font-size: var(--fs-xs); color: var(--fg-text); font-family: inherit;
  width: 110px; min-width: 0;
}
.qnote { align-items: flex-start; }
.qn-ico {
  width: 20px; height: 20px;
  border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.qnote[data-color="yellow"] .qn-ico { background: var(--theme-yellow-soft); color: var(--theme-yellow); }
.qnote[data-color="green"] .qn-ico { background: var(--theme-green-soft); color: var(--theme-green); }
.qnote[data-color="blue"] .qn-ico { background: var(--theme-blue-soft); color: var(--theme-blue); }
.qnote[data-color="pink"] .qn-ico { background: var(--theme-pink-soft); color: var(--theme-pink); }
.qnote[data-color="purple"] .qn-ico { background: var(--theme-purple-soft); color: var(--theme-purple); }
.qnote[data-color="orange"] .qn-ico { background: var(--theme-orange-soft); color: var(--theme-orange); }
.qn-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.qn-title {
  /* note titles stay regular — only the planned tasks are emphasised */
  font-size: var(--fs-sm); font-weight: 400;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qopen-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 6px;
  padding: 3px 9px;
  border: none; border-radius: var(--r-sm);
  background: var(--bg-hover);
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
  font-family: inherit;
  cursor: pointer;
}
.qopen-btn:hover { background: var(--accent); color: var(--fg-on-accent); }

.qfoot {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 6px 10px 10px;
  padding: 9px;
  border: none;
  border-radius: var(--r-md);
  background: var(--bg-hover);
  color: var(--fg-secondary);
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--t-fast), color var(--t-fast);
  flex-shrink: 0;
}
.qfoot:hover { background: var(--accent); color: var(--fg-on-accent); }
</style>
