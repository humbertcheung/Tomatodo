<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { state, updateNote, deleteNote, askConfirm, NOTE_COLORS } from '../store'
import { t } from '../i18n'
import { X, Pin, PinOff, Trash2 } from 'lucide-vue-next'

const props = defineProps({ noteId: { type: String, required: true } })
const emit = defineEmits(['close'])

const note = computed(() => state.notes.find((n) => n.id === props.noteId))
const title = ref('')
const contentEl = ref(null)
const colorOpen = ref(false)
let saveTimer = null

function setContent(html) {
  nextTick(() => {
    if (!contentEl.value) return
    const c = html || ''
    if (/<[a-z][\s\S]*>/i.test(c)) contentEl.value.innerHTML = c
    else contentEl.value.textContent = c
  })
}
function onContentInput() { scheduleSave() }
async function onPaste(e) {
  const cd = e.clipboardData
  if (!cd) return
  const { pasteRichContent } = await import('../lib/richtext')
  const handled = await pasteRichContent(contentEl.value, cd)
  if (handled) { e.preventDefault(); scheduleSave() }
}
function fmtCmd(cmd) {
  contentEl.value?.focus()
  document.execCommand(cmd, false, null)
  scheduleSave()
}

watch(() => props.noteId, () => {
  title.value = note.value?.title || ''
  setContent(note.value?.content || '')
  colorOpen.value = false
}, { immediate: true })

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!note.value || !contentEl.value) return
    const html = contentEl.value.innerHTML
    const t = title.value.trim()
    if (t !== note.value.title || html !== note.value.content) {
      updateNote(note.value.id, { title: t, content: html })
    }
  }, 500)
}

async function onPin() {
  if (!note.value) return
  await updateNote(note.value.id, { pinned: note.value.pinned ? 0 : 1 })
}
async function setColor(c) {
  if (!note.value) return
  await updateNote(note.value.id, { color: c })
  colorOpen.value = false
}
async function onDelete() {
  if (!note.value) return
  const ok = await askConfirm({ title: t('note.delete'), message: `“${note.value.title || note.value.content.slice(0, 20)}”` })
  if (ok) await deleteNote(note.value)
}

function fmtDate(iso) {
  if (!iso) return ''
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(iso).toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="note" class="ndetail" :data-color="note.color">
    <div class="nd-top">
      <button class="chip-btn" :class="{ on: !!note.pinned }" @click="onPin">
        <component :is="note.pinned ? PinOff : Pin" :size="14" />
        <span>{{ note.pinned ? t('note.unpin') : t('note.pin') }}</span>
      </button>
      <div class="pop-anchor">
        <button class="color-dot" :data-color="note.color" :aria-label="t('note.colors')" @click="colorOpen = !colorOpen">
          <span class="cd-inner"></span>
        </button>
        <div v-if="colorOpen" class="popover color-pop">
          <div class="pop-label">{{ t('note.colors') }}</div>
          <div class="color-row">
            <button
              v-for="c in NOTE_COLORS" :key="c"
              class="color-dot big" :data-color="c"
              :aria-label="c"
              @click="setColor(c)"
            ><span class="cd-inner"></span></button>
          </div>
        </div>
      </div>
      <button class="icon-btn close-btn" :aria-label="t('misc.cancel')" @click="emit('close')"><X :size="16" /></button>
    </div>

    <div class="nd-scroll">
      <div class="nd-toolbar">
        <button class="nd-fmt" @mousedown.prevent="fmtCmd('bold')"><b>B</b></button>
        <button class="nd-fmt" @mousedown.prevent="fmtCmd('italic')"><i>I</i></button>
        <button class="nd-fmt" @mousedown.prevent="fmtCmd('underline')"><u>U</u></button>
        <button class="nd-fmt" @mousedown.prevent="fmtCmd('insertUnorderedList')">≡</button>
        <button class="nd-fmt" @mousedown.prevent="fmtCmd('insertOrderedList')">⒈</button>
      </div>
      <input
        v-model="title"
        class="nd-title"
        :placeholder="t('note.placeholder')"
        :spellcheck="false"
        @input="scheduleSave"
        @keydown.enter="$event.target.blur()"
      />
      <div
        ref="contentEl"
        class="nd-content"
        contenteditable="true"
        :data-placeholder="t('note.contentPlaceholder')"
        @input="onContentInput"
        @paste="onPaste"
      ></div>
      <div class="nd-meta">{{ t('note.updated') }} · {{ fmtDate(note.updated_at) }}</div>
    </div>

    <div class="nd-foot">
      <button class="delete-btn" @click="onDelete"><Trash2 :size="15" /> {{ t('note.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.ndetail { display: flex; flex-direction: column; height: 100%; min-width: 0; }
.nd-top {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 4px;
  flex-shrink: 0;
}
.chip-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--divider);
  border-radius: var(--r-full);
  background: var(--bg-card);
  color: var(--fg-secondary);
  font-size: var(--fs-xs);
  font-weight: 500;
  padding: 5px 11px;
  cursor: pointer;
  transition: all var(--t-fast);
  font-family: inherit;
}
.chip-btn:hover { border-color: var(--border-strong); color: var(--fg-text); }
.chip-btn.on { color: var(--theme-orange); border-color: var(--theme-orange); background: var(--theme-orange-soft); }
.close-btn { margin-left: auto; }

.pop-anchor { position: relative; }
.color-pop { left: 0; top: 32px; }
.color-row { display: flex; gap: 8px; padding: 4px 8px 8px; }

.color-dot {
  width: 24px; height: 24px;
  border-radius: var(--r-full);
  border: 2px solid transparent;
  padding: 0;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform var(--t-fast);
  background: transparent;
}
.color-dot:hover { transform: scale(1.12); }
.color-dot.big { width: 26px; height: 26px; }
.cd-inner { width: 16px; height: 16px; border-radius: var(--r-full); display: block; }
.color-dot.big .cd-inner { width: 18px; height: 18px; }

.color-dot[data-color="yellow"] .cd-inner { background: #e8b93c; }
.color-dot[data-color="green"] .cd-inner { background: #3cb371; }
.color-dot[data-color="blue"] .cd-inner { background: #4a7bf7; }
.color-dot[data-color="pink"] .cd-inner { background: #e464a8; }
.color-dot[data-color="purple"] .cd-inner { background: #a06ee2; }
.color-dot[data-color="orange"] .cd-inner { background: #e6913a; }

.nd-scroll { flex: 1; overflow-y: auto; padding: 10px 18px; min-height: 0; display: flex; flex-direction: column; }
.nd-title {
  border: none; outline: none;
  background: transparent;
  font-size: 19px; font-weight: 650;
  color: var(--fg-text);
  font-family: inherit;
  padding: 4px 2px 8px;
  border-bottom: 2px solid var(--divider);
  transition: border var(--t-fast);
  min-width: 0;
}
.nd-title:focus { border-color: var(--accent); }
.nd-toolbar { display: flex; gap: 2px; padding: 2px 0 6px; }
.nd-fmt {
  min-width: 26px; height: 24px;
  border: 1px solid transparent; border-radius: 6px;
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.nd-fmt:hover { background: var(--bg-hover); color: var(--fg-text); border-color: var(--divider); }
.nd-content {
  flex: 1;
  margin-top: 10px;
  border: none; outline: none;
  background: transparent;
  font-size: var(--fs-base);
  line-height: 1.7;
  color: var(--fg-text);
  font-family: inherit;
  min-height: 200px;
  overflow-y: auto;
  word-break: break-word;
}
.nd-content:empty::before { content: attr(data-placeholder); color: var(--fg-tertiary); }
.nd-content :deep(img) { max-width: 100%; border-radius: 8px; margin: 4px 0; }
.nd-content :deep(ul), .nd-content :deep(ol) { padding-left: 1.3em; }
.nd-title::placeholder, .nd-content::placeholder { color: var(--fg-tertiary); }
.nd-meta { margin-top: 10px; font-size: var(--fs-xs); color: var(--fg-tertiary); }

.nd-foot { border-top: 1px solid var(--divider); padding: 10px 14px; flex-shrink: 0; }
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
