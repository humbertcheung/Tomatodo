<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { state, updateTask, deleteTask, toggleTaskComplete, toast, listSteps, addStep, toggleStep, deleteStep, listAttachments, attachFile, attachLink, removeAttachment, askConfirm, askText } from '../store'
import { t } from '../i18n'
import { describeRecurrence } from '@shared/recurrence'
import {
  X, Sun, Star, CalendarDays, Bell, Repeat, StickyNote, ListTodo,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Paperclip, Link2,
  Trash2, ChevronRight, Plus, Check
} from 'lucide-vue-next'

const props = defineProps({ taskId: { type: String, required: true } })
const emit = defineEmits(['close'])

const task = computed(() => state.tasks.find((x) => x.id === props.taskId))

const steps = ref([])
const attachments = ref([])
const titleEditing = ref(false)
const titleText = ref('')
const noteRef = ref(null)
const pop = ref(null)
const stepInput = ref('')

watch(() => props.taskId, async () => {
  pop.value = null
  if (task.value) {
    steps.value = await listSteps(task.value.id)
    attachments.value = await listAttachments(task.value.id)
    setNoteHtml(task.value.note_html)
  }
}, { immediate: true })

watch(() => task.value?.note_html, (v) => {
  if (noteRef.value && v !== undefined && noteRef.value.innerHTML !== v) setNoteHtml(v)
})

function setNoteHtml(html) {
  nextTick(() => { if (noteRef.value) noteRef.value.innerHTML = html || '' })
}

const recurDesc = computed(() => {
  if (!task.value?.recurrence_json) return null
  try { return describeRecurrence(JSON.parse(task.value.recurrence_json), state.lang) } catch { return null }
})

const dueLabel = computed(() => {
  const d = task.value?.due_date
  if (!d) return t('task.none')
  const today = localYMD()
  if (d === today) return t('task.dueToday')
  const tomorrow = localYMD(1)
  if (d === tomorrow) return t('task.dueTomorrow')
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(d + 'T00:00:00').toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' })
})

const reminderLabel = computed(() => {
  const r = task.value?.reminder_date
  if (!r) return t('task.none')
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  const d = new Date(r)
  return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
})

function localYMD(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// datetime-local input needs LOCAL time, not UTC (toISOString shifts by TZ)
function toLocalInputValue(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const isImageFile = (name) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || '')
const fileUrl = (p) => 'file://' + String(p).split('/').map(encodeURIComponent).join('/')

// file attachment names: split head/extension so CSS can ellipsize the head
// while the suffix stays pinned at the end (e.g. 《大纲》-审… .docx)
function nameExt(name) {
  const n = String(name || '')
  const dot = n.lastIndexOf('.')
  if (dot <= 0 || dot === n.length - 1 || n.length - dot > 6) return null
  return { head: n.slice(0, dot), ext: n.slice(dot) }
}

async function startTitleEdit() {
  titleText.value = task.value.subject
  const v = await askText({ title: t('dialog.rename'), value: task.value.subject, ok: t('dialog.rename') })
  if (v && v !== task.value.subject) await updateTask(task.value.id, { subject: v })
}

// --- note formatting ---
function fmt(cmd) {
  noteRef.value?.focus()
  document.execCommand(cmd, false, null)
  saveNote()
}
let noteTimer = null
function onNoteInput() {
  clearTimeout(noteTimer)
  noteTimer = setTimeout(saveNote, 600)
}
async function saveNote() {
  if (!task.value || !noteRef.value) return
  const html = noteRef.value.innerHTML
  if (html !== task.value.note_html) await updateTask(task.value.id, { note_html: html })
}

// --- steps ---
async function submitStep() {
  const v = stepInput.value.trim()
  if (!v || !task.value) return
  stepInput.value = ''
  await addStep(task.value.id, v)
  steps.value = await listSteps(task.value.id)
}
async function onToggleStep(step) {
  await toggleStep(step)
  steps.value = await listSteps(task.value.id)
}
async function onStepDelete(step) {
  await deleteStep(step.id)
  steps.value = await listSteps(task.value.id)
  toast(t('task.stepDeleted'))
}

// --- due/reminder/repeat ---
function setDue(v) {
  updateTask(task.value.id, { due_date: v })
  pop.value = null
}
function setDueWithTime(v) {
  updateTask(task.value.id, { due_date: v })
  pop.value = null
}
async function setReminderAt(dtLocal) {
  if (!dtLocal) { await updateTask(task.value.id, { reminder_date: null }); pop.value = null; return }
  const d = new Date(dtLocal)
  await updateTask(task.value.id, { reminder_date: d.toISOString() })
  pop.value = null
}
function setRepeat(type) {
  if (!type) { updateTask(task.value.id, { recurrence_json: null }); pop.value = null; return }
  const cur = safeRec()
  const rec = { type, interval: cur.interval || 1, weekdays: cur.weekdays || null }
  updateTask(task.value.id, { recurrence_json: JSON.stringify(rec) })
  pop.value = null
}
function safeRec() {
  try { return JSON.parse(task.value.recurrence_json || '{}') } catch { return {} }
}
function toggleWeekday(d) {
  const cur = safeRec()
  const weekdays = (cur.weekdays || []).includes(d)
    ? (cur.weekdays || []).filter((x) => x !== d)
    : [...(cur.weekdays || []), d]
  updateTask(task.value.id, { recurrence_json: JSON.stringify({ type: 'weekly', interval: cur.interval || 1, weekdays }) })
}

// --- attachments ---
async function onAttachFile() {
  if (!task.value) return
  try {
    await attachFile(task.value.id)
    attachments.value = await listAttachments(task.value.id)
  } catch (err) { toast('⚠ ' + (err?.message || err)) }
}
async function onAttachLink() {
  const url = await askText({ title: t('dialog.linkTitle'), placeholder: t('dialog.linkPlaceholder') })
  if (!url) return
  await attachLink(task.value.id, url)
  attachments.value = await listAttachments(task.value.id)
  toast('🔗 ' + t('task.attachment'))
}
async function onRemoveAttach(a) {
  await removeAttachment(a.id)
  attachments.value = await listAttachments(task.value.id)
}
function openAttach(a) {
  if (a.type === 'link') window.api.openExternal(a.path_or_url)
  else window.api.openPath(a.path_or_url)
}

async function onDelete() {
  if (state.settings.confirmDelete !== false) {
    const ok = await askConfirm({ title: t('task.delete'), message: t('dialog.deleteTaskMsg') })
    if (!ok) return
  }
  await deleteTask(task.value)
}

function closePop(e) {
  // keep the popover open while interacting with its inputs and the native
  // date/time picker dropdown (rendered outside .pop-anchor)
  if (e.target.closest('.pop-anchor, .popover, input, .date-input')) return
  pop.value = null
}
onMounted(() => document.addEventListener('click', closePop))
onBeforeUnmount(() => document.removeEventListener('click', closePop))

const createdLabel = computed(() => {
  if (!task.value?.created_at) return ''
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(task.value.created_at).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
})
const completedLabel = computed(() => {
  if (!task.value?.completed_at) return ''
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(task.value.completed_at).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
})
</script>

<template>
  <div v-if="task" class="detail">
    <div class="detail-top">
      <button class="chip-btn" :class="{ on: !!task.my_day_date, sun: true }" :aria-label="t('task.myday')" @click="updateTask(task.id, { my_day_date: task.my_day_date ? null : localYMD() })">
        <Sun :size="15" /> <span>{{ t('task.myday') }}</span>
      </button>
      <button class="chip-btn" :class="{ on: task.importance === 'important', star: true }" :aria-label="t('task.important')" @click="updateTask(task.id, { importance: task.importance === 'important' ? 'normal' : 'important' })">
        <Star :size="15" :fill="task.importance === 'important' ? 'currentColor' : 'none'" /> <span>{{ t('task.important') }}</span>
      </button>
      <button class="icon-btn close-btn" @click="emit('close')" :aria-label="t('misc.cancel')"><X :size="16" /></button>
    </div>

    <div class="detail-scroll">
      <!-- title -->
      <div class="detail-title-row" @click="startTitleEdit">
        <button class="check detail-check" :class="{ checked: task.status === 'completed' }" @click.stop="toggleTaskComplete(task)">
          <svg viewBox="0 0 20 20" width="21" height="21">
            <circle class="check-ring" cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path class="check-path" d="M6 10.2 L9 13 L14 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <h2 class="detail-title" :class="{ done: task.status === 'completed' }">{{ task.subject }}</h2>
      </div>

      <!-- attribute rows -->
      <div class="attr-rows">
        <div class="pop-anchor">
          <button class="attr-row" @click="pop = pop === 'due' ? null : 'due'">
            <span class="attr-ico ico-blue"><CalendarDays :size="14" /></span>
            <span class="attr-label">{{ t('task.due') }}</span>
            <span class="attr-value" :class="{ set: task.due_date }">{{ dueLabel }}</span>
            <ChevronRight :size="13" class="attr-chev" />
          </button>
          <div v-if="pop === 'due'" class="popover side-pop">
            <button class="pop-item" @click="setDueWithTime(localYMD())">{{ t('task.today') }}</button>
            <button class="pop-item" @click="setDueWithTime(localYMD(1))">{{ t('task.tomorrow') }}</button>
            <button class="pop-item" @click="setDue(localYMD(7))">{{ t('task.nextWeek') }}</button>
            <div class="pop-sep"></div>
            <input type="date" class="date-input" :value="task.due_date || localYMD()" @change="setDueWithTime($event.target.value)" @keydown.stop @click.stop />
            <div class="pop-sep"></div>
            <button class="pop-item danger" @click="setDue(null)">{{ t('task.noDue') }}</button>
          </div>
        </div>

        <div class="pop-anchor">
          <button class="attr-row" @click="pop = pop === 'reminder' ? null : 'reminder'">
            <span class="attr-ico ico-purple"><Bell :size="14" /></span>
            <span class="attr-label">{{ t('task.reminder') }}</span>
            <span class="attr-value" :class="{ set: task.reminder_date }">{{ reminderLabel }}</span>
            <ChevronRight :size="13" class="attr-chev" />
          </button>
          <div v-if="pop === 'reminder'" class="popover side-pop">
            <input
              type="datetime-local"
              class="date-input"
              :value="task.reminder_date ? toLocalInputValue(task.reminder_date) : ''"
              @change="setReminderAt($event.target.value || null)"
              @keydown.stop
              @click.stop
            />
          </div>
        </div>

        <div class="pop-anchor">
          <button class="attr-row" @click="pop = pop === 'repeat' ? null : 'repeat'">
            <span class="attr-ico ico-teal"><Repeat :size="14" /></span>
            <span class="attr-label">{{ t('task.repeat') }}</span>
            <span class="attr-value" :class="{ set: task.recurrence_json }">{{ recurDesc || t('task.once') }}</span>
            <ChevronRight :size="13" class="attr-chev" />
          </button>
          <div v-if="pop === 'repeat'" class="popover side-pop">
            <button class="pop-item" :class="{ selected: !task.recurrence_json }" @click="setRepeat(null)">{{ t('task.once') }} <span class="pop-check">✓</span></button>
            <button class="pop-item" :class="{ selected: safeRec().type === 'daily' }" @click="setRepeat('daily')">{{ t('task.daily') }} <span class="pop-check">✓</span></button>
            <button class="pop-item" :class="{ selected: safeRec().type === 'weekly' }" @click="setRepeat('weekly')">{{ t('task.weekly') }} <span class="pop-check">✓</span></button>
            <button class="pop-item" :class="{ selected: safeRec().type === 'monthly' }" @click="setRepeat('monthly')">{{ t('task.monthly') }} <span class="pop-check">✓</span></button>
            <button class="pop-item" :class="{ selected: safeRec().type === 'yearly' }" @click="setRepeat('yearly')">{{ t('task.yearly') }} <span class="pop-check">✓</span></button>
            <template v-if="safeRec().type === 'weekly'">
              <div class="pop-sep"></div>
              <div class="weekday-row">
                <button
                  v-for="(w, i) in t('task.weekdays')" :key="i"
                  class="weekday-pill" :class="{ on: (safeRec().weekdays || []).includes(i) }"
                  @click="toggleWeekday(i)"
                >{{ w }}</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- steps -->
      <div class="detail-section">
        <div class="section-head"><span class="sec-ico"><ListTodo :size="14" /></span> {{ t('task.steps') }}</div>
        <div v-for="s in steps" :key="s.id" class="step-row">
          <button class="check mini" :class="{ checked: !!s.completed }" @click="onToggleStep(s)">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <circle class="check-ring" cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path class="check-path" d="M6 10.2 L9 13 L14 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="step-label" :class="{ done: s.completed }">{{ s.subject }}</span>
          <button class="icon-btn step-del" @click="onStepDelete(s)"><Trash2 :size="13" /></button>
        </div>
        <div class="step-add">
          <Plus :size="14" class="attr-icon" />
          <input v-model="stepInput" class="step-input" :placeholder="t('task.addStep')" @keydown.enter="submitStep" />
        </div>
      </div>

      <!-- note -->
      <div class="detail-section">
        <div class="section-head wrap">
          <span class="sec-ico"><StickyNote :size="14" /></span> {{ t('task.note') }}
          <div class="note-toolbar">
            <button class="fmt-btn" @mousedown.prevent="fmt('bold')"><Bold :size="13" /></button>
            <button class="fmt-btn" @mousedown.prevent="fmt('italic')"><Italic :size="13" /></button>
            <button class="fmt-btn" @mousedown.prevent="fmt('underline')"><Underline :size="13" /></button>
            <button class="fmt-btn" @mousedown.prevent="fmt('strikeThrough')"><Strikethrough :size="13" /></button>
            <button class="fmt-btn" @mousedown.prevent="fmt('insertUnorderedList')"><List :size="13" /></button>
            <button class="fmt-btn" @mousedown.prevent="fmt('insertOrderedList')"><ListOrdered :size="13" /></button>
          </div>
        </div>
        <div
          ref="noteRef"
          class="note-editor note-body"
          contenteditable="true"
          data-placeholder="添加备注… / Add a note…"
          @input="onNoteInput"
        ></div>
      </div>

      <!-- attachments -->
      <div class="detail-section">
        <div class="section-head wrap">
          <span class="sec-ico"><Paperclip :size="14" /></span> {{ t('task.attachment') }}
          <div class="attach-actions">
            <button class="fmt-btn" :aria-label="t('task.addFile')" @click="onAttachFile"><Paperclip :size="13" /></button>
            <button class="fmt-btn" :aria-label="t('task.addLink')" @click="onAttachLink"><Link2 :size="13" /></button>
          </div>
        </div>
        <div v-for="a in attachments" :key="a.id" class="attach-row">
          <template v-if="a.type === 'file' && isImageFile(a.name)">
            <img class="attach-thumb" :src="fileUrl(a.path_or_url)" :alt="a.name" />
          </template>
          <span v-else class="attr-ico" :class="a.type === 'link' ? 'ico-blue' : 'ico-orange'">
            <component :is="a.type === 'link' ? Link2 : Paperclip" :size="13" />
          </span>
          <button class="attach-name" :title="a.name" @click="openAttach(a)">
            <template v-if="a.type === 'file' && nameExt(a.name)">
              <span class="an-head">{{ nameExt(a.name).head }}</span><span class="an-ext">{{ nameExt(a.name).ext }}</span>
            </template>
            <template v-else>{{ a.name }}</template>
          </button>
          <button class="icon-btn" @click="onRemoveAttach(a)"><Trash2 :size="13" /></button>
        </div>
        <div v-if="!attachments.length" class="attach-empty">{{ t('task.none') }}</div>
      </div>

      <!-- meta -->
      <div class="meta-block">
        <div>{{ t('task.created') }} · {{ createdLabel }}</div>
        <div v-if="completedLabel">{{ t('task.completed') }} · {{ completedLabel }}</div>
      </div>
    </div>

    <div class="detail-foot">
      <button class="delete-btn" @click="onDelete">
        <Trash2 :size="15" /> {{ t('task.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; height: 100%; min-width: 0; }
.detail-top {
  display: flex; gap: 5px; align-items: center;
  padding: 12px 10px 2px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.close-btn { margin-left: auto; }

/* chip action buttons (icon + label pills) */
.chip-btn {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--divider);
  border-radius: var(--r-full);
  background: var(--bg-card);
  color: var(--fg-secondary);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 9px;
  cursor: pointer;
  transition: all var(--t-fast);
  font-family: inherit;
}
.chip-btn:hover { border-color: var(--border-strong); color: var(--fg-text); }
.chip-btn.on.sun { color: var(--theme-orange); border-color: var(--theme-orange); background: var(--theme-orange-soft); }
.chip-btn.on.star { color: var(--theme-crimson); border-color: var(--theme-crimson); background: var(--theme-crimson-soft); }

.detail-scroll { flex: 1; overflow-y: auto; padding: 6px 12px 16px; min-height: 0; }

.detail-title-row { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0 12px; }
.detail-check { margin-top: 2px; }
.detail-title {
  font-size: 14px; font-weight: 600; letter-spacing: -0.1px;
  line-height: 1.45;
  cursor: text;
  outline: none;
  border-radius: var(--r-sm);
  flex: 1;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: normal;
}
.detail-title.done { color: var(--fg-tertiary); text-decoration: line-through; }

.attr-rows { display: flex; flex-direction: column; gap: 2px; }
.pop-anchor { position: relative; }
.attr-row {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--fg-text);
  font-size: var(--fs-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--t-fast);
  font-family: inherit;
}
.attr-row:hover { background: var(--bg-hover); }
.attr-ico {
  width: 23px; height: 23px;
  border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ico-blue { background: var(--theme-blue-soft); color: var(--theme-blue); }
.ico-purple { background: var(--theme-purple-soft); color: var(--theme-purple); }
.ico-teal { background: var(--theme-teal-soft); color: var(--theme-teal); }
.ico-orange { background: var(--theme-orange-soft); color: var(--theme-orange); }
.attr-label { color: var(--fg-secondary); flex-shrink: 0; }
.attr-value { margin-left: auto; color: var(--fg-tertiary); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attr-value.set { color: var(--accent); font-weight: 500; }
.attr-chev { color: var(--fg-disabled); flex-shrink: 0; }
.side-pop { right: 4px; top: 34px; width: 224px; z-index: 120; }
.date-input {
  width: calc(100% - 12px);
  margin: 4px 6px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--bg-input);
  color: var(--fg-text);
  font-family: inherit;
  font-size: var(--fs-sm);
}
.weekday-row { display: flex; gap: 4px; padding: 6px; flex-wrap: wrap; }
.weekday-pill {
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: transparent;
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
}
.weekday-pill.on { background: var(--accent); border-color: var(--accent); color: var(--fg-on-accent); }

.detail-section { margin-top: 13px; min-width: 0; }
.section-head {
  display: flex; align-items: center; gap: 7px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--fg-secondary);
  margin-bottom: 6px;
  min-width: 0;
}
.section-head.wrap { flex-wrap: wrap; }
.sec-ico {
  width: 22px; height: 22px;
  border-radius: 7px;
  background: var(--bg-hover);
  color: var(--fg-secondary);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.note-toolbar, .attach-actions { margin-left: auto; display: flex; gap: 2px; }
.fmt-btn {
  width: 26px; height: 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all var(--t-fast);
}
.fmt-btn:hover { background: var(--bg-hover); color: var(--fg-text); border-color: var(--divider); }

.step-row { display: flex; align-items: center; gap: 9px; padding: 5px 4px; border-radius: var(--r-sm); }
.step-row:hover { background: var(--bg-hover); }
.step-row .step-del { opacity: 0; margin-left: auto; width: 24px; height: 24px; }
.step-row:hover .step-del { opacity: 1; }
.step-label { flex: 1; font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-label.done { color: var(--fg-tertiary); text-decoration: line-through; }
.step-add { display: flex; align-items: center; gap: 9px; padding: 6px 4px; }
.step-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 12px; color: var(--fg-text); font-family: inherit; min-width: 0;
}
.step-input::placeholder { color: var(--fg-tertiary); }

.check { border: none; background: transparent; padding: 0; cursor: pointer; color: var(--fg-tertiary); position: relative; flex-shrink: 0; }
.check:hover { color: var(--accent); }
.check-ring { transition: opacity var(--t-fast); }
.check-path { stroke-dasharray: 14; stroke-dashoffset: 14; transition: stroke-dashoffset 220ms var(--ease) 40ms; opacity: 0; }
.check.checked { color: var(--success); }
.check.checked .check-ring { opacity: 0.35; }
.check.checked .check-path { stroke-dashoffset: 0; opacity: 1; }

.note-body {
  min-height: 84px;
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-card);
  font-size: var(--fs-base);
  line-height: 1.6;
  transition: border var(--t-fast);
  box-sizing: border-box;
}
.note-body:focus { border-color: var(--accent); }

.attach-row { display: flex; align-items: center; gap: 9px; padding: 6px 4px; border-radius: var(--r-sm); min-width: 0; }
.attach-row:hover { background: var(--bg-hover); }
.attach-icon { font-size: 13px; flex-shrink: 0; }
.attach-name {
  flex: 1; text-align: left;
  display: flex; align-items: baseline; min-width: 0;
  border: none; background: transparent;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0;
  font-family: inherit;
  min-width: 0;
}
.an-head { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-ext { flex-shrink: 0; white-space: nowrap; }
.attach-thumb {
  width: 34px; height: 34px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--divider);
  background: var(--bg-hover);
}
.attach-empty { font-size: var(--fs-sm); color: var(--fg-tertiary); padding: 4px; }

.meta-block {
  margin-top: 24px;
  font-size: var(--fs-xs);
  color: var(--fg-tertiary);
  display: flex; flex-direction: column; gap: 3px;
}
.detail-foot {
  border-top: 1px solid var(--divider);
  padding: 10px 14px;
  flex-shrink: 0;
}
.delete-btn {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--theme-red-soft);
  border-radius: var(--r-md);
  background: var(--theme-red-soft);
  color: var(--danger);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 7px 14px;
  cursor: pointer;
  transition: all var(--t-fast);
  font-family: inherit;
}
.delete-btn:hover { background: var(--danger); border-color: var(--danger); color: #fff; }
</style>
