<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { state } from '../store'
import { t } from '../i18n'
import { Star, Sun, CalendarDays, Repeat, ListTodo, Bell, Paperclip, Link2 } from 'lucide-vue-next'

const props = defineProps({
  task: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'toggle', 'star'])

const hover = ref(false)

const isImportant = computed(() => props.task.importance === 'important')
const isCompleted = computed(() => props.task.status === 'completed')

const dueInfo = computed(() => {
  if (!props.task.due_date) return null
  const today = localYMD()
  const tomorrow = localYMD(1)
  let kind = 'future'
  if (props.task.due_date < today) kind = 'overdue'
  else if (props.task.due_date === today) kind = 'today'
  else if (props.task.due_date === tomorrow) kind = 'tomorrow'
  return { label: fmtDue(props.task.due_date), kind }
})

// each card carries its own colour so the list reads as varied rather than
// a wall of identical blue
const tintStyle = computed(() => {
  const t = props.task
  let color = 'var(--accent)'
  if (t.importance === 'important') color = 'var(--theme-crimson)'
  else if (dueInfo.value?.kind === 'overdue') color = 'var(--theme-red)'
  else if (dueInfo.value?.kind === 'today') color = 'var(--theme-orange)'
  else if (dueInfo.value?.kind === 'tomorrow') color = 'var(--theme-yellow)'
  else if (t.my_day_date) color = 'var(--theme-purple)'
  else if (t.reminder_date) color = 'var(--theme-teal)'
  return { '--card-tint': color }
})

const stepsCount = ref(null)
const attachCount = ref(null)
let offChanged = null
async function loadExtras() {
  const [steps, atts] = await Promise.all([
    window.api.steps.listByTask(props.task.id),
    window.api.attachments.listByTask(props.task.id)
  ])
  stepsCount.value = steps
  attachCount.value = atts
}
onMounted(() => {
  loadExtras()
  // live-update chips whenever any data changes (upload, link add, …)
  offChanged = window.api.onDataChanged(() => loadExtras())
})
onBeforeUnmount(() => { offChanged?.() })
const fileCount = computed(() => (attachCount.value || []).filter((a) => a.type === 'file').length)
const linkCount = computed(() => (attachCount.value || []).filter((a) => a.type === 'link').length)

// plain-text preview of the rich note (single line, ellipsis)
const notePreview = computed(() => {
  const html = props.task.note_html || ''
  if (!html) return ''
  const text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text
})

function localYMD(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDue(ymd) {
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  const today = localYMD()
  const tomorrow = localYMD(1)
  if (ymd === today) return t('task.today')
  if (ymd === tomorrow) return t('task.tomorrow')
  const d = new Date(ymd + 'T00:00:00')
  return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div
    class="task-card"
    :class="{ selected, completed: isCompleted }"
    :data-due="dueInfo?.kind || 'none'"
    :style="tintStyle"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    @click="emit('select')"
  >
    <button
      class="check"
      :class="{ checked: isCompleted }"
      :aria-label="t('task.done')"
      @click.stop="emit('toggle')"
    >
      <svg viewBox="0 0 20 20" width="16" height="16">
        <circle class="check-ring" cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path class="check-path" d="M6 10.2 L9 13 L14 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div class="card-body">
      <span class="card-title" :class="{ important: isImportant }">{{ task.subject }}</span>
      <div class="card-meta">
        <span v-if="isImportant" class="meta-chip star-chip"><Star :size="11" :fill="'currentColor'" /></span>
        <span v-if="task.my_day_date" class="meta-chip myday-chip" :title="t('task.myday')"><Sun :size="11" /></span>
        <span v-if="dueInfo" class="meta-chip due-pill" :data-kind="dueInfo.kind" :title="t('task.due')">
          <CalendarDays :size="11" /> {{ dueInfo.label }}
        </span>
        <span v-if="task.reminder_date" class="meta-chip reminder-chip" :title="t('task.reminder')"><Bell :size="11" /></span>
        <span v-if="task.recurrence_json" class="meta-chip repeat-chip" :title="t('task.repeat')"><Repeat :size="11" /></span>
        <span v-if="stepsCount && stepsCount.length" class="meta-chip" :title="t('task.steps')">
          <ListTodo :size="11" /> {{ stepsCount.filter((s) => s.completed).length }}/{{ stepsCount.length }}
        </span>
        <span v-if="fileCount" class="meta-chip file-chip" :title="t('task.attachment')"><Paperclip :size="11" /> {{ fileCount }}</span>
        <span v-if="linkCount" class="meta-chip link-chip" :title="t('task.addLink')"><Link2 :size="11" /> {{ linkCount }}</span>
      </div>
      <div v-if="notePreview && !isCompleted" class="card-note" :title="notePreview">{{ notePreview }}</div>
    </div>

    <button
      v-if="!isCompleted"
      class="star-btn"
      :class="{ visible: hover || isImportant, active: isImportant }"
      :aria-label="t('task.important')"
      @click.stop="emit('star')"
    >
      <Star :size="15" :fill="isImportant ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>

<style scoped>
.task-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: 10px 11px 10px 9px;
  border-radius: var(--r-lg);
  background: var(--surface-card);
  background-color: var(--bg-card);
  border: 1px solid var(--border-card);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  overflow: hidden;
  transition: background var(--t-fast), box-shadow var(--t-fast), transform var(--t-fast), border var(--t-fast);
}
.task-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-pop);
  border-color: color-mix(in srgb, var(--card-tint) 42%, transparent);
}
.task-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), var(--glow-accent);
}
/* a soft colour bloom in the top-left corner ties the card to its state */
.task-card::before {
  content: '';
  position: absolute;
  left: -34px; top: -46px;
  width: 130px; height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--card-tint) 26%, transparent) 0%, transparent 68%);
  pointer-events: none;
  z-index: 0;
}

.check {
  position: relative;
  z-index: 1;
  width: 22px; height: 22px;
  margin-top: 1px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--fg-tertiary);
  flex-shrink: 0;
  position: relative;
}
.check:hover { color: var(--accent); }
.check-ring { transition: opacity var(--t-fast); }
.check-path {
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  transition: stroke-dashoffset 220ms var(--ease) 40ms;
  opacity: 0;
}
.check.checked { color: var(--success); }
.check.checked .check-ring { opacity: 0.35; }
.check.checked .check-path { stroke-dashoffset: 0; opacity: 1; }

.card-body {
  position: relative;
  z-index: 1; flex: 1; min-width: 0; }
.card-title {
  display: block;
  font-size: var(--fs-base);
  color: var(--fg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.45;
}
.card-title.important { font-weight: 600; }
.completed .card-title {
  color: var(--fg-tertiary);
  text-decoration: line-through;
  text-decoration-color: var(--fg-disabled);
}
/* exactly two lines: title + one meta line, overflow becomes … */
.card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  min-height: 18px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-xs);
  color: var(--fg-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: var(--r-full);
  background: var(--bg-hover);
}
.star-chip { color: var(--theme-crimson); background: var(--theme-crimson-soft); }
.myday-chip { color: var(--theme-orange); background: var(--theme-orange-soft); }
.file-chip { background: transparent; }

/* due date chip — blue like the detail panel's calendar chip */
.due-pill { font-weight: 600; color: var(--theme-blue); background: var(--theme-blue-soft); }
.due-pill[data-kind="overdue"] { color: #fff; background: var(--danger); }
.due-pill[data-kind="today"] { color: #fff; background: var(--theme-orange); }
.due-pill[data-kind="tomorrow"] { color: var(--theme-blue); background: var(--theme-blue-soft); }
.due-pill[data-kind="future"] { color: var(--theme-blue); background: var(--theme-blue-soft); }

/* chip colors consistent with the detail panel icons */
.reminder-chip { color: var(--theme-purple); background: var(--theme-purple-soft); }
.repeat-chip { color: var(--theme-teal); background: var(--theme-teal-soft); }
.file-chip { color: var(--theme-orange); background: transparent; }
.link-chip { color: var(--theme-blue); background: var(--theme-blue-soft); }

/* note preview line */
.card-note {
  margin-top: 8px;
  font-size: 11px;
  color: var(--fg-tertiary);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}





/* note preview line */
.card-note {
  margin-top: 8px;
  font-size: 11px;
  color: var(--fg-tertiary);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.star-btn {
  width: 27px; height: 27px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--t-fast), color var(--t-fast), background var(--t-fast);
  flex-shrink: 0;
}
.star-btn.visible { opacity: 1; }
.star-btn:hover { background: var(--theme-crimson-soft); color: var(--theme-crimson); }
.star-btn.active { color: var(--theme-crimson); opacity: 1; }
</style>
