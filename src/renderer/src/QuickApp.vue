<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { t } from './i18n'
import { parseSmartDate } from '@shared/nlp'
import { htmlToText } from '@shared/rtf'
import {
  Plus, Check, ArrowRight, Sun, CalendarDays, ListChecks, StickyNote, Search, Pin,
  ChevronRight, Star, ExternalLink
} from 'lucide-vue-next'

const tomatoLogo = ref(null)
const inputEl = ref(null)
const subject = ref('')
const sectionOrder = ref(['myday', 'due', 'notes'])
const data = ref(null)
const kind = ref('todo')            // capture target: 'todo' | 'note'
const parsed = ref(null)

onMounted(async () => {
  try { tomatoLogo.value = await window.api.iconUrl() } catch { tomatoLogo.value = null }
  window.__quickLogo = tomatoLogo.value
  data.value = await window.api.quickData()
  sectionOrder.value = await window.api.settings.get('quickSectionOrder') || ['myday', 'due', 'notes']
  document.documentElement.dataset.theme =
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  window.api.onThemeChanged((mode) => { document.documentElement.dataset.theme = mode })
  // re-read order + data on every panel invocation (settings may have changed)
  window.api.onQuickShow(async () => {
    try {
      sectionOrder.value = (await window.api.settings.get('quickSectionOrder')) || ['myday', 'due', 'notes']
    } catch { sectionOrder.value = ['myday', 'due', 'notes'] }
    data.value = await window.api.quickData()
    focusInput()
  })
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

// 置顶: keep the panel above other windows
const pinned = ref(false)
async function togglePin() {
  pinned.value = await window.api.quickAlwaysOnTop(!pinned.value)
}
onMounted(async () => {
  try { pinned.value = await window.api.quickIsAlwaysOnTop() } catch { pinned.value = false }
})

const filteredNotes = computed(() => {
  if (!data.value) return []
  const q = noteFilter.value.trim().toLowerCase()
  if (!q) return data.value.notes
  return data.value.notes.filter((n) =>
    (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
  )
})

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
  // the check mark is a gesture of its own: it flips completion and never
  // expands the row (the click handler is stopped at the button)
  await window.api.quickToggleDone(task.id, !isDone(task))
  data.value = await window.api.quickData()
}

const isDone = (task) => task?.status === 'completed'

// expanded rows — clicking a row reveals more, clicking again collapses it
const openTasks = ref(new Set())
const openNotes = ref(new Set())

// NOTE: refs are auto-unwrapped in templates, so the handler must close over
// the ref itself instead of receiving it as an argument.
function toggleExpand(setRef, id) {
  const next = new Set(setRef.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  setRef.value = next
}
const toggleTaskExpand = (id) => toggleExpand(openTasks, id)
const toggleNoteExpand = (id) => toggleExpand(openNotes, id)
const taskOpen = (id) => openTasks.value.has(id)
const noteOpen = (id) => openNotes.value.has(id)

/** plain-text body of a task note (stored as HTML) */
function taskNote(task) {
  const raw = task?.note_html || ''
  if (!raw) return ''
  return htmlToText(raw)
}

/** does expanding this task reveal anything at all? */
function taskHasDetail(task) {
  return !!(task?.due_date || task?.reminder_date || task?.importance === 'important' || taskNote(task))
}

/** plain-text body of a note (stored as HTML) */
function noteText(n) {
  if (n?.preview) return n.preview
  return htmlToText(n?.content || '')
}

function noteTitle(n) {
  return (n?.title || '').trim() || noteText(n).split('\n')[0] || '…'
}

function formatDue(dateStr) {
  if (!dateStr) return ''
  const lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' })
}

function openNote(n) {
  window.api.quickOpenNote(n.id)
}

function closePanel() { window.api.quickClose() }
function openMainWin() { window.api.quickOpenMain() }
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

    <!-- unified scroll body: today's tasks + all notes -->
    <div class="qbody">
      <div class="qsec-block" :style="secStyle('myday')">
        <div class="qsect">
          <span class="qsect-label">{{ t('quick.myday') }} · {{ data.today.length }}</span>
        </div>
        <div v-if="!data.today.length && !data.due.length" class="qempty">{{ t('quick.noTasks') }}</div>
        <div v-for="task in data.today" :key="task.id" class="qrow">
          <div
            class="qtask"
            :class="{ done: isDone(task), open: taskOpen(task.id) }"
            role="button"
            tabindex="0"
            :aria-expanded="taskOpen(task.id)"
            @click="toggleTaskExpand(task.id)"
            @keydown.enter.prevent="toggleTaskExpand(task.id)"
            @keydown.space.prevent="toggleTaskExpand(task.id)"
          >
            <button
              class="qcheck"
              :class="{ on: isDone(task) }"
              :aria-label="t('quick.markDone')"
              :aria-pressed="isDone(task)"
              @click.stop="toggleDone(task)"
            >
              <Check :size="11" />
            </button>
            <span class="qtask-label">{{ task.subject }}</span>
            <ChevronRight class="qcaret" :class="{ open: taskOpen(task.id) }" :size="13" />
          </div>
          <div v-if="taskOpen(task.id)" class="qdetail">
            <div class="qmeta">
              <span v-if="task.due_date" class="qchip"><CalendarDays :size="11" /> {{ formatDue(task.due_date) }}</span>
              <span v-if="task.importance === 'important'" class="qchip star"><Star :size="11" /> {{ t('quick.important') }}</span>
            </div>
            <p v-if="taskNote(task)" class="qbody-text">{{ taskNote(task) }}</p>
            <p v-else-if="!taskHasDetail(task)" class="qbody-text dim">{{ t('quick.noMore') }}</p>
          </div>
        </div>
      </div>

      <div class="qsec-block" :style="secStyle('due')">
        <template v-if="data.due.length">
          <div class="qsect"><span class="qsect-label">{{ t('quick.today') }} · {{ data.due.length }}</span></div>
          <div v-for="task in data.due" :key="task.id" class="qrow">
            <div
              class="qtask"
              :class="{ done: isDone(task), open: taskOpen(task.id) }"
              role="button"
              tabindex="0"
              :aria-expanded="taskOpen(task.id)"
              @click="toggleTaskExpand(task.id)"
              @keydown.enter.prevent="toggleTaskExpand(task.id)"
              @keydown.space.prevent="toggleTaskExpand(task.id)"
            >
              <button
                class="qcheck"
                :class="{ on: isDone(task) }"
                :aria-label="t('quick.markDone')"
                :aria-pressed="isDone(task)"
                @click.stop="toggleDone(task)"
              >
                <Check :size="11" />
              </button>
              <span class="qtask-label">{{ task.subject }}</span>
              <ChevronRight class="qcaret" :class="{ open: taskOpen(task.id) }" :size="13" />
            </div>
            <div v-if="taskOpen(task.id)" class="qdetail">
              <div class="qmeta">
                <span v-if="task.due_date" class="qchip"><CalendarDays :size="11" /> {{ formatDue(task.due_date) }}</span>
                <span v-if="task.importance === 'important'" class="qchip star"><Star :size="11" /> {{ t('quick.important') }}</span>
              </div>
              <p v-if="taskNote(task)" class="qbody-text">{{ taskNote(task) }}</p>
              <p v-else-if="!taskHasDetail(task)" class="qbody-text dim">{{ t('quick.noMore') }}</p>
            </div>
          </div>
        </template>
      </div>

      <div class="qsec-block" :style="secStyle('notes')">
        <div class="qsect">
          <span class="qsect-label">{{ t('quick.notes') }} · {{ filteredNotes.length }}</span>
          <div class="qnf">
            <Search :size="11" class="qnf-ico" />
            <input v-model="noteFilter" class="qnf-input" :placeholder="t('quick.notesFilter')" />
          </div>
        </div>
        <div v-if="!filteredNotes.length" class="qempty">{{ t('quick.noNotes') }}</div>
        <div v-for="n in filteredNotes" :key="n.id" class="qrow">
          <div
            class="qnote"
            :data-color="n.color"
            :class="{ open: noteOpen(n.id) }"
            role="button"
            tabindex="0"
            :aria-expanded="noteOpen(n.id)"
            @click="toggleNoteExpand(n.id)"
            @keydown.enter.prevent="toggleNoteExpand(n.id)"
            @keydown.space.prevent="toggleNoteExpand(n.id)"
          >
            <span class="qn-ico"><StickyNote :size="12" /></span>
            <span class="qn-body">
              <span class="qn-title">{{ noteTitle(n) }}</span>
              <span v-if="noteText(n)" class="qn-snippet">{{ noteText(n).slice(0, 40) }}</span>
            </span>
            <span v-if="n.pinned" class="qn-pin"><Pin :size="11" /></span>
            <ChevronRight class="qcaret" :class="{ open: noteOpen(n.id) }" :size="13" />
          </div>
          <div v-if="noteOpen(n.id)" class="qdetail">
            <p v-if="noteText(n)" class="qbody-text">{{ noteText(n) }}</p>
            <button class="qopen-btn" @click.stop="openNote(n)">
              {{ t('quick.openNote') }} <ExternalLink :size="11" />
            </button>
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
  font-family: inherit;
  color: var(--fg-text);
  padding: 8px 0;
  min-width: 0;
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
.qempty.small { padding: 10px 12px; font-size: var(--fs-xs); }

.qrow { display: flex; flex-direction: column; }
.qtask {
  display: flex; align-items: center; gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-text);
  font-size: var(--fs-base);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--t-fast);
  outline: none;
}
.qtask:hover, .qtask:focus-visible { background: var(--bg-hover); }
.qtask.open { background: var(--bg-hover); }
.qtask.done .qtask-label { color: var(--fg-tertiary); text-decoration: line-through; }
/* the check mark is its own target — it must never expand the row */
.qcheck {
  width: 16px; height: 16px;
  padding: 0;
  border: 1.5px solid var(--fg-tertiary);
  border-radius: var(--r-full);
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: transparent;
  flex-shrink: 0;
  transition: all var(--t-fast);
  cursor: pointer;
}
.qtask:hover .qcheck { border-color: var(--success); color: var(--success); }
.qcheck.on {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}
.qtask-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qcaret {
  color: var(--fg-tertiary);
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform var(--t-fast), opacity var(--t-fast);
}
.qcaret.open { transform: rotate(90deg); opacity: 1; }

/* expanded detail block */
.qdetail {
  margin: 0 8px 6px 33px;
  padding: 8px 10px;
  border-left: 2px solid var(--border);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  background: var(--bg-card);
  animation: qdetail-in var(--t-fast) var(--ease);
}
@keyframes qdetail-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
.qmeta { display: flex; flex-wrap: wrap; gap: 6px; }
.qchip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 7px;
  border-radius: var(--r-full);
  background: var(--bg-hover);
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
}
.qchip.star { color: var(--theme-orange); background: var(--theme-orange-soft); }
.qbody-text.dim { color: var(--fg-tertiary); font-style: italic; }
.qbody-text {
  margin: 6px 0 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--fg-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}
.qopen-btn {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 8px;
  padding: 4px 10px;
  border: none; border-radius: var(--r-sm);
  background: var(--bg-hover);
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
  font-family: inherit;
  cursor: pointer;
}
.qopen-btn:hover { background: var(--accent); color: var(--fg-on-accent); }

/* the filter pill in the notes section header.
   NB: the selector must be plain `.qnf` — the markup has no `.notes-head`
   ancestor, so the old descendant selector never matched and the icon
   ended up flush against the placeholder text. */
.qnf {
  margin-left: auto;
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-hover);
  border-radius: var(--r-full);
  padding: 3px 10px;
  min-width: 0;
}
.qnf-ico { color: var(--fg-tertiary); flex-shrink: 0; }
.qnf-input {
  border: none; outline: none; background: transparent;
  font-size: var(--fs-xs); color: var(--fg-text); font-family: inherit;
  width: 110px; min-width: 0;
}
.qnote {
  display: flex; align-items: flex-start; gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-text);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--t-fast);
  outline: none;
}
.qnote:hover, .qnote:focus-visible { background: var(--bg-hover); }
.qnote.open { background: var(--bg-hover); }
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
.qn-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.qn-title {
  font-size: var(--fs-sm); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qn-snippet {
  font-size: var(--fs-xs); color: var(--fg-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qn-pin { color: var(--theme-orange); flex-shrink: 0; margin-top: 2px; }
.qnote .qcaret { margin-top: 3px; }

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
