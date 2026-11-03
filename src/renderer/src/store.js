// Reactive app store v2 — flat todos + notes, dual mode, dialogs, pomodoro.
import { reactive, computed } from 'vue'
import { t, setLanguage } from './i18n'

export const state = reactive({
  ready: false,
  mode: 'todo',                      // 'todo' | 'note'
  settings: {},
  view: { kind: 'smart', id: 'myday' },
  tasks: [],
  notes: [],
  noteFilter: '',
  selectedTaskId: null,
  selectedNoteId: null,
  notePopupId: null,
  searchOpen: false,
  settingsOpen: false,
  sidebarOpen: true,                 // user toggle
  narrow: false,                     // window below responsive threshold
  focusMode: false,                  // pomodoro minimal mode
  pinned: false,                     // window always-on-top
  ctxMenu: null,                     // content-area context menu
  toasts: [],
  lang: 'zh',
  theme: 'light',
  pomodoro: { running: false, mode: 'work', remainingMs: 25 * 60 * 1000, totalMs: 25 * 60 * 1000, sessionsToday: 0 },
  dialog: null                       // {type:'text'|'confirm'|'link', ...resolve}
})

export async function initStore() {
  state.settings = await window.api.settings.all()
  applyLanguage()
  applyTheme()
  await refreshTasks()
  await refreshNotes()
  state.ready = true
  window.api.onDataChanged(() => { refreshTasks(); refreshNotes() })
  window.api.onThemeChanged((mode) => {
    if ((state.settings.theme ?? 'system') === 'system') {
      state.theme = mode
      document.documentElement.dataset.theme = mode
    }
  })
  window.api.onPomodoroTick((p) => { Object.assign(state.pomodoro, p) })
  state.pomodoro = await window.api.pomodoro.get()
  window.api.onOpenNote((id) => { openNoteById(id) })
}

function applyLanguage() {
  const lang = state.settings.language ?? 'system'
  const sys = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  state.lang = lang === 'system' ? sys : lang
  setLanguage(state.lang)
}

export function applyTheme() {
  const pref = state.settings.theme ?? 'system'
  state.theme = pref === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : pref
  document.documentElement.dataset.theme = state.theme
}

// ---------- tasks ----------

let taskQueryToken = 0
export async function refreshTasks() {
  const token = ++taskQueryToken
  const v = { ...state.view }
  const mode = state.mode
  if (mode !== 'todo') { state.tasks = []; return }
  let rows
  if (v.kind === 'smart') {
    // smart lists always include their completed rows (collapsed section)
    const includeCompleted = ['myday', 'important', 'planned', 'all'].includes(v.id) ? 1 : 0
    rows = await window.api.tasks.smart(v.id, { ...smartSort(), include_completed: includeCompleted })
  } else {
    rows = await window.api.tasks.listByList(v.id, { show_completed: 1, ...smartSort() })
  }
  // drop out-of-order responses (fast view switching must never show stale data)
  if (token !== taskQueryToken || mode !== state.mode || state.view.id !== v.id || state.view.kind !== v.kind) return
  state.tasks = rows
}

function smartSort() {
  return state.settings.allSort || { sort_type: 'position', sort_dir: 'asc' }
}

export function openView(kind, id) {
  state.view = { kind, id }
  state.selectedTaskId = null
  refreshTasks()
}

export function openTask(id) {
  const exists = state.tasks.find((x) => x.id === id)
  if (!exists) {
    window.api.tasks.get(id).then((tk) => {
      if (tk) { state.mode = 'todo'; state.view = { kind: 'smart', id: 'open' }; refreshTasks().then(() => { state.selectedTaskId = id }) }
    })
  } else {
    state.selectedTaskId = id
  }
}

/**
 * Show / hide one of the quick panel's modules.
 *
 * The flags live in ONE settings key ('quickModules'), so the switches and
 * the panel can never disagree. The merge happens against the CURRENT store
 * value and the store is updated SYNCHRONOUSLY — otherwise two switches
 * toggled in quick succession overwrite each other, and the re-render can
 * flip a switch back on before the write lands.
 */
export async function setQuickModule(key, on) {
  const cur = { ...(state.settings.quickModules || {}) }
  cur[key] = !!on
  state.settings = { ...state.settings, quickModules: cur }
  await window.api.settings.set('quickModules', cur)
  return cur
}

export async function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value }
  await window.api.settings.set(key, value)
  if (key === 'theme') applyTheme()
  if (key === 'language') applyLanguage()
  if (key === 'badge') window.api.updateBadge()
}

export async function createTask(payload) {
  if (state.settings.recognizeDates !== false) {
    const { parseSmartDate } = await import('@shared/nlp')
    const parsed = parseSmartDate(payload.subject)
    if (parsed.dueDate) {
      payload = {
        ...payload,
        subject: state.settings.stripDates === false ? payload.subject : parsed.subject,
        due_date: payload.due_date || parsed.dueDate,
        reminder_date: payload.reminder_date || parsed.reminder
      }
    }
  }
  const task = await window.api.tasks.create(payload)
  await refreshTasks()
  return task
}

export async function toggleTaskComplete(task) {
  const completing = task.status === 'notCompleted'
  await window.api.tasks.update(task.id, {
    status: completing ? 'completed' : 'notCompleted',
    completed_at: completing ? new Date().toISOString() : null
  })
  if (completing) {
    const next = await window.api.tasks.completeTask(task.id)
    if (state.settings.playSound !== false) playCompleteSound()
    if (next) toast('🔁 ' + t('task.due') + ' → ' + formatDateShort(next.due_date))
  }
  await refreshTasks()
}

export async function updateTask(id, fields) {
  return window.api.tasks.update(id, fields).then(async (r) => { await refreshTasks(); return r })
}

export async function deleteTask(task) {
  const snapshot = { ...task }
  await window.api.tasks.remove(task.id)
  if (state.selectedTaskId === task.id) state.selectedTaskId = null
  await refreshTasks()
  toast(t('task.deleted'), async () => {
    await window.api.tasks.restore(snapshot)
    await refreshTasks()
  })
}

export async function setAllSort(sort_type, sort_dir) {
  await setSetting('allSort', { sort_type, sort_dir })
  await refreshTasks()
}


export async function clearCompleted() {
  await window.api.tasks.removeCompleted(null)
  await refreshTasks()
}

// ---------- notes ----------

let noteQueryToken = 0
export async function refreshNotes() {
  const token = ++noteQueryToken
  const filter = state.noteFilter
  if (state.mode !== 'note') return
  const rows = await window.api.notes.list({ q: filter || null })
  if (token !== noteQueryToken || state.mode !== 'note') return
  state.notes = rows
}

/**
 * Open a note: switch to the note mode, make sure the notes are actually
 * loaded (refreshNotes() is a no-op outside the note mode) and then raise
 * the sticky popup for it.
 */
let openNoteToken = 0

export async function openNoteById(id) {
  // a token makes concurrent calls safe: only the last one may raise the
  // popup, so a superseded call cannot open an empty note
  const token = ++openNoteToken
  state.mode = 'note'
  state.selectedTaskId = null
  if (!state.notes.some((n) => n.id === id)) {
    await refreshNotes()
  }
  if (token !== openNoteToken) return
  // the notes must be in place BEFORE the popup id is raised — otherwise the
  // popup renders before the note it refers to exists
  state.selectedNoteId = id
  state.notePopupId = id
}

export function switchMode(mode) {
  state.mode = mode
  state.selectedTaskId = null
  state.selectedNoteId = null
  if (mode === 'todo') refreshTasks()
  else refreshNotes()
}

export async function createNote(payload = {}) {
  const note = await window.api.notes.create({ title: '', content: '', color: pickNoteColor(), ...payload })
  if (note.content) window.api.notes.writeFile(note.id, note.content).catch(() => {})
  await refreshNotes()
  state.selectedNoteId = note.id
  return note
}

export async function updateNote(id, fields) {
  const payload = { ...fields }
  // rich content is persisted as an RTF document (source of truth) + a plain
  // text preview used by the list views
  if (payload.content !== undefined) {
    const { htmlToText } = await import('./lib/richtext')
    payload.preview = htmlToText(payload.content).slice(0, 500)
  }
  const r = await window.api.notes.update(id, payload)
  if (payload.content !== undefined) {
    window.api.notes.writeFile(id, payload.content).catch(() => {})
  }
  const i = state.notes.findIndex((n) => n.id === id)
  if (i >= 0) Object.assign(state.notes[i], r)
  return r
}

export async function deleteNote(note) {
  const snapshot = { ...note }
  await window.api.notes.remove(note.id)
  window.api.notes.deleteFile(note.id).catch(() => {})
  if (state.selectedNoteId === note.id) state.selectedNoteId = null
  await refreshNotes()
  toast(t('note.deleted'), async () => {
    await window.api.notes.create(snapshot)
    await refreshNotes()
  })
}

const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange']
export function pickNoteColor() {
  return NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]
}
export { NOTE_COLORS }

// ---------- steps ----------

export async function listSteps(taskId) { return window.api.steps.listByTask(taskId) }
export async function addStep(taskId, subject) { await window.api.steps.create({ task_id: taskId, subject }) }
export async function toggleStep(step) { await window.api.steps.update(step.id, { completed: step.completed ? 0 : 1 }) }
export async function deleteStep(id) { await window.api.steps.remove(id) }

// ---------- attachments ----------

export async function listAttachments(taskId) { return window.api.attachments.listByTask(taskId) }
export async function attachFile(taskId) {
  const file = await window.api.dialog.pickFile()
  if (!file) return
  await window.api.attachments.create({ task_id: taskId, type: 'file', name: file.name, path_or_url: file.path })
}
export async function attachLink(taskId, url) {
  await window.api.attachments.create({ task_id: taskId, type: 'link', name: url.replace(/^https?:\/\//, ''), path_or_url: url })
}
export async function removeAttachment(id) { await window.api.attachments.remove(id) }

// ---------- pomodoro ----------

export async function pomoStart(mode = null, minutes = null) {
  Object.assign(state.pomodoro, await window.api.pomodoro.start(mode, minutes))
  if (!state.focusMode) {
    state.focusMode = true
    window.api.window.setCompact(true).catch(() => {})
  }
}
export async function pomoPause() {
  Object.assign(state.pomodoro, await window.api.pomodoro.pause())
}
export async function pomoReset(mode = null) {
  Object.assign(state.pomodoro, await window.api.pomodoro.reset(mode))
  if (mode) exitFocus()
}
export function exitFocus() {
  if (!state.focusMode) return
  state.focusMode = false
  window.api.window.setCompact(false).catch(() => {})
}

/** open the focus view without necessarily starting the timer */
export function openFocus() {
  if (state.focusMode) return
  state.focusMode = true
  window.api.window.setCompact(true).catch(() => {})
}

export async function togglePin() {
  state.pinned = await window.api.window.toggleAlwaysOnTop()
  return state.pinned
}

// ---------- dialogs (prompt/confirm are unsupported in Electron) ----------

export function askText({ title, placeholder = '', value = '', ok = null, danger = false } = {}) {
  return new Promise((resolve) => {
    state.dialog = { type: 'text', title, placeholder, value, ok: ok || t('dialog.ok'), danger, resolve }
  })
}
export function askConfirm({ title, message = '', ok = null, danger = true } = {}) {
  return new Promise((resolve) => {
    state.dialog = { type: 'confirm', title, message, ok: ok || t('dialog.confirm'), danger, resolve }
  })
}
export function resolveDialog(result) {
  if (state.dialog?.resolve) state.dialog.resolve(result)
  state.dialog = null
}

// ---------- ui helpers ----------

export function toast(text, undoFn = null) {
  const id = Math.random().toString(36).slice(2)
  state.toasts.push({ id, text, undoFn })
  setTimeout(() => dismissToast(id), undoFn ? 6000 : 2400)
}

export function dismissToast(id) {
  const i = state.toasts.findIndex((x) => x.id === id)
  if (i >= 0) state.toasts.splice(i, 1)
}

export function playCompleteSound() {
  try {
    const ctx = new AudioContext()
    const notes = [523.25, 783.99]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t0 = ctx.currentTime + i * 0.09
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)
      o.connect(g); g.connect(ctx.destination)
      o.start(t0); o.stop(t0 + 0.3)
    })
  } catch { /* audio unavailable */ }
}

export function formatDateShort(iso) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
}

export const selectedTask = computed(() => state.tasks.find((x) => x.id === state.selectedTaskId) || null)
export const selectedNote = computed(() => state.notes.find((x) => x.id === state.selectedNoteId) || null)
