<script setup>
/**
 * macOS Stickies-style note popup — opens on double-click.
 * Resizable (corner handle), draggable (header), rich editable content
 * with image paste; delete included. Original implementation.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { state, updateNote, deleteNote, askConfirm } from '../store'
import { t } from '../i18n'
import { X, Trash2 } from 'lucide-vue-next'

const note = computed(() => state.notes.find((n) => n.id === state.notePopupId))
const title = ref('')
const editor = ref(null)
let saveTimer = null
let dragState = null

const pos = ref({ x: 140, y: 90 })
const size = ref({ w: 320, h: 260 })
let resizeState = null

// per-note window geometry is persisted so size/position survive reopening
async function loadGeometry(id) {
  try {
    const saved = await window.api.settings.get('noteWindows')
    const g = saved && saved[id]
    if (g) {
      pos.value = { x: g.x, y: g.y }
      size.value = { w: g.w, h: g.h }
    }
  } catch { /* defaults */ }
}
async function saveGeometry(id) {
  try {
    const saved = (await window.api.settings.get('noteWindows')) || {}
    saved[id] = { x: Math.round(pos.value.x), y: Math.round(pos.value.y), w: Math.round(size.value.w), h: Math.round(size.value.h) }
    await window.api.settings.set('noteWindows', saved)
  } catch { /* ignore */ }
}

/** keep the sticky inside the app window; grow the app window when needed */
async function ensureInsideApp() {
  const vw = window.innerWidth, vh = window.innerHeight
  const margin = 12
  let changed = false
  if (pos.value.x + size.value.w > vw - margin) {
    pos.value.x = Math.max(margin, vw - margin - size.value.w)
    changed = true
  }
  if (pos.value.y + size.value.h > vh - margin) {
    pos.value.y = Math.max(margin, vh - margin - size.value.h)
    changed = true
  }
  if (changed) {
    // ask the main process to enlarge the app window so the sticky can fit
    try {
      await window.api.window.ensureBounds({ x: pos.value.x, y: pos.value.y, w: size.value.w, h: size.value.h })
    } catch { /* ignore */ }
  }
}

/** custom resize handle (bottom-right): persists the new size */
function onResizeDown(e) {
  e.preventDefault()
  e.stopPropagation()
  resizeState = { sx: e.clientX, sy: e.clientY, w: size.value.w, h: size.value.h }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeUp)
}
function onResizeMove(e) {
  if (!resizeState) return
  const w = Math.max(240, resizeState.w + (e.clientX - resizeState.sx))
  const h = Math.max(180, resizeState.h + (e.clientY - resizeState.sy))
  size.value = { w, h }
  ensureInsideApp()
}
async function onResizeUp() {
  resizeState = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeUp)
  if (note.value) await saveGeometry(note.value.id)
}

function loadContent() {
  if (!note.value) return
  const c = note.value.content || ''
  nextTick(() => {
    if (!editor.value) return
    if (/<[a-z][\s\S]*>/i.test(c)) editor.value.innerHTML = c
    else editor.value.textContent = c
  })
}

watch(() => state.notePopupId, (id) => {
  if (id) {
    title.value = note.value?.title || ''
    loadGeometry(id)
    loadContent()
    nextTick(() => editor.value?.focus())
  }
}, { immediate: true })

watch(() => note.value?.content, () => {
  // external updates (right panel edits) sync into the popup
  if (note.value && editor.value && document.activeElement !== editor.value) {
    const c = note.value.content || ''
    if (/<[a-z][\s\S]*>/i.test(c)) editor.value.innerHTML = c
    else editor.value.textContent = c
  }
})

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!note.value) return
    const html = editor.value ? editor.value.innerHTML : ''
    const plain = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
    const t = title.value.trim()
    if (t !== note.value.title || html !== note.value.content) {
      updateNote(note.value.id, { title: t, content: html })
    }
    void plain
  }, 500)
}

async function onPaste(e) {
  const cd = e.clipboardData
  if (!cd) return
  const { pasteRichContent } = await import('../lib/richtext')
  const handled = await pasteRichContent(editor.value, cd)
  if (handled) { e.preventDefault(); scheduleSave() }
}

function fmtCmd(cmd) {
  editor.value?.focus()
  document.execCommand(cmd, false, null)
  scheduleSave()
}

async function onCopy() {
  if (!note.value) return
  await window.api.notes.copy(note.value.id)
}

async function onDelete() {
  if (!note.value) return
  const ok = await askConfirm({ title: t('note.delete'), message: `“${note.value.title || ''}”` })
  if (ok) {
    await deleteNote(note.value)
    close()
  }
}
function close() {
  scheduleSave()
  state.notePopupId = null
}

// ---- drag by header ----
function onBarDown(e) {
  if (e.target.closest('button')) return
  dragState = { sx: e.clientX - pos.value.x, sy: e.clientY - pos.value.y }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragUp)
}
function onDragMove(e) {
  if (!dragState) return
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 160, e.clientX - dragState.sx)),
    y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragState.sy))
  }
}
async function onDragUp() {
  dragState = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
  if (note.value) await saveGeometry(note.value.id)
}

function fmtDate(iso) {
  if (!iso) return ''
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(iso).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => { if (note.value) loadContent() })
onBeforeUnmount(() => clearTimeout(saveTimer))
</script>

<template>
  <Teleport to="body">
    <div v-if="note" class="sticky-pop" :data-color="note.color"
      :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px' }">
      <div class="sp-bar" @mousedown="onBarDown">
        <span class="sp-title">{{ t('note.title') }}</span>
        <button class="sp-close" :aria-label="t('misc.cancel')" @click="close"><X :size="14" /></button>
      </div>

      <div class="sp-body">
        <input v-model="title" class="sp-name" :placeholder="t('note.placeholder')" :spellcheck="false" @input="scheduleSave" />
        <div class="sp-toolbar">
          <button class="sp-fmt" @mousedown.prevent="fmtCmd('bold')"><b>B</b></button>
          <button class="sp-fmt" @mousedown.prevent="fmtCmd('italic')"><i>I</i></button>
          <button class="sp-fmt" @mousedown.prevent="fmtCmd('underline')"><u>U</u></button>
          <button class="sp-fmt" @mousedown.prevent="fmtCmd('insertUnorderedList')">≡</button>
        </div>
        <div
          ref="editor"
          class="sp-content"
          contenteditable="true"
          data-placeholder="记录内容…"
          @input="scheduleSave"
          @paste="onPaste"
        ></div>
        <div class="sp-foot">
          <span class="sp-meta">{{ t('note.updated') }} · {{ fmtDate(note.updated_at) }}</span>
          <button class="sp-copy" :aria-label="t('note.copy')" @click="onCopy">⧉</button>
          <button class="sp-del" :aria-label="t('note.delete')" @click="onDelete"><Trash2 :size="14" /> {{ t('note.delete') }}</button>
        </div>
      </div>

      <!-- resize handle (bottom-right corner) -->
      <div class="sp-resize" @mousedown="onResizeDown"></div>
    </div>
  </Teleport>
</template>

<style scoped>
.sticky-pop {
  position: fixed;
  z-index: 300;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  min-width: 240px;
  min-height: 200px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.22);
  background: linear-gradient(170deg, #fdf6c3 0%, #fbf2a8 100%);
  color: #4a4322;
}
.sticky-pop[data-color="green"] { background: linear-gradient(170deg, #e2f6d9 0%, #d2efc2 100%); color: #2f4a22; }
.sticky-pop[data-color="blue"] { background: linear-gradient(170deg, #ddeafd 0%, #c9defb 100%); color: #223a5c; }
.sticky-pop[data-color="pink"] { background: linear-gradient(170deg, #fce3ef 0%, #fbd0e4 100%); color: #5c2340; }
.sticky-pop[data-color="purple"] { background: linear-gradient(170deg, #ece2fb 0%, #e0d0fa 100%); color: #3f2a5c; }
.sticky-pop[data-color="orange"] { background: linear-gradient(170deg, #fdeacd 0%, #fcdcb0 100%); color: #5c3f1d; }

.sp-bar {
  display: flex;
  align-items: center;
  padding: 6px 8px 4px;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}
.sp-title { font-size: 10px; font-weight: 600; opacity: 0.55; letter-spacing: 0.4px; }
.sp-close {
  margin-left: auto;
  width: 20px; height: 20px;
  border: none; border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.10);
  color: inherit;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.sp-close:hover { background: rgba(0, 0, 0, 0.18); }

.sp-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 2px 12px 18px;
  min-height: 0;
}
.sp-name {
  border: none; outline: none; background: transparent;
  font-size: 14px; font-weight: 650; color: inherit;
  font-family: inherit;
  padding: 2px 0 6px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.14);
}
.sp-toolbar { display: flex; gap: 2px; padding: 4px 0; }
.sp-fmt {
  min-width: 22px; height: 20px;
  border: none; border-radius: 4px;
  background: rgba(0, 0, 0, 0.07);
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}
.sp-fmt:hover { background: rgba(0, 0, 0, 0.14); }
.sp-content {
  flex: 1;
  overflow-y: auto;
  outline: none;
  font-size: 13px;
  line-height: 1.55;
  min-height: 60px;
}
.sp-content:empty::before {
  content: attr(data-placeholder);
  color: rgba(0, 0, 0, 0.35);
}
.sp-content :deep(img) { max-width: 100%; border-radius: 6px; margin: 2px 0; }
.sp-content :deep(ul), .sp-content :deep(ol) { padding-left: 1.3em; }

.sp-foot {
  display: flex; align-items: center;
  gap: 10px;
  padding-top: 8px;
  flex-shrink: 0;
}
.sp-meta {
  font-size: 10px;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: auto;
  min-width: 0;
}
.sp-copy {
  margin-left: auto;
  width: 24px; height: 22px;
  border: none; border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.07);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.sp-copy:hover { background: rgba(0, 0, 0, 0.16); }
.sp-resize {
  position: absolute;
  right: 0; bottom: 0;
  width: 18px; height: 18px;
  cursor: nwse-resize;
  z-index: 5;
}
/* the grip itself is drawn small and fine — the element stays 18×18 so it
   remains an easy grab target */
.sp-resize::before {
  content: '';
  position: absolute;
  right: 1px; bottom: 1px;
  width: 13px; height: 13px;
  background:
    linear-gradient(135deg, transparent 0 54%, rgba(0,0,0,0.20) 54% 60%, transparent 60% 73%, rgba(0,0,0,0.20) 73% 79%, transparent 79%);
  border-bottom-right-radius: 9px;
}
.sp-del {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.sp-del:hover { background: var(--danger); color: #fff; }
</style>
