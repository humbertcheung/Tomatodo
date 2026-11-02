<script setup>
import { ref, onMounted, nextTick, computed } from 'vue'
import { state, openTask } from '../store'
import { t } from '../i18n'
import { Search, X, CalendarDays, StickyNote } from 'lucide-vue-next'

const emit = defineEmits(['close'])
const q = ref('')
const taskResults = ref([])
const noteResults = ref([])
const recent = ref(JSON.parse(localStorage.getItem('recentSearches') || '[]'))
const inputEl = ref(null)
let timer = null

onMounted(() => nextTick(() => inputEl.value?.focus()))

function doSearch() {
  clearTimeout(timer)
  const query = q.value.trim()
  if (!query) { taskResults.value = []; noteResults.value = []; return }
  timer = setTimeout(async () => {
    const [tasks, notes] = await Promise.all([
      window.api.tasks.search(query),
      window.api.notes.list({ q: query })
    ])
    taskResults.value = tasks
    noteResults.value = notes
    if (tasks.length || notes.length) {
      recent.value = [query, ...recent.value.filter((r) => r !== query)].slice(0, 6)
      localStorage.setItem('recentSearches', JSON.stringify(recent.value))
    }
  }, 200)
}

function openTaskResult(task) {
  emit('close')
  openTask(task.id)
}
function openNoteResult(note) {
  emit('close')
  state.mode = 'note'
  state.selectedNoteId = note.id
}
function pickRecent(r) { q.value = r; doSearch() }
function clearRecent() {
  recent.value = []
  localStorage.setItem('recentSearches', '[]')
}

function fmtDue(ymd) {
  if (!ymd) return ''
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(ymd + 'T00:00:00').toLocaleDateString(lang, { month: 'short', day: 'numeric' })
}
const showEmpty = computed(() => q.value.trim() && !taskResults.value.length && !noteResults.value.length)
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop search-backdrop" @click.self="emit('close')">
      <div class="search-panel">
        <div class="search-input-row">
          <Search :size="18" class="search-icon" />
          <input
            ref="inputEl"
            v-model="q"
            class="search-input"
            :placeholder="t('search.placeholder')"
            @input="doSearch"
            @keydown.esc="emit('close')"
          />
          <button class="icon-btn" @click="emit('close')"><X :size="16" /></button>
        </div>

        <div class="search-body">
          <template v-if="!q.trim()">
            <div class="search-initial">{{ t('search.initial') }}</div>
            <template v-if="recent.length">
              <div class="search-sect">{{ t('search.recent') }} <button class="clear-btn" @click="clearRecent">{{ t('search.clear') }}</button></div>
              <button v-for="r in recent" :key="r" class="search-result" @click="pickRecent(r)">
                <Search :size="14" /> {{ r }}
              </button>
            </template>
          </template>
          <template v-else>
            <div v-if="showEmpty" class="search-initial">{{ t('search.noResults') }}</div>

            <template v-if="taskResults.length">
              <div class="search-sect">{{ t('search.tasks') }}</div>
              <button v-for="r in taskResults" :key="r.id" class="search-result" @click="openTaskResult(r)">
                <span class="sr-check" :class="{ done: r.status === 'completed' }"></span>
                <span class="sr-title">{{ r.subject }}</span>
                <span v-if="r.due_date" class="sr-due"><CalendarDays :size="12" /> {{ fmtDue(r.due_date) }}</span>
              </button>
            </template>

            <template v-if="noteResults.length">
              <div class="search-sect">{{ t('search.notes') }}</div>
              <button v-for="r in noteResults" :key="r.id" class="search-result" @click="openNoteResult(r)">
                <span class="sr-note-ico" :data-color="r.color"><StickyNote :size="13" /></span>
                <span class="sr-title">{{ r.title || r.content.slice(0, 40) }}</span>
                <span class="sr-list">{{ t('note.title') }}</span>
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.search-backdrop { align-items: flex-start; padding-top: 12vh; }
.search-panel {
  width: min(620px, calc(100vw - 80px));
  background: var(--bg-popover);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  animation: search-in 180ms cubic-bezier(.2,0,0,1);
}
@keyframes search-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.search-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider);
}
.search-icon { color: var(--fg-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1; border: none; outline: none;
  background: transparent;
  font-size: var(--fs-md);
  color: var(--fg-text);
  font-family: inherit;
}
.search-body { max-height: 400px; overflow-y: auto; padding: 8px; }
.search-initial { padding: 26px 16px; color: var(--fg-tertiary); font-size: var(--fs-base); text-align: center; }
.search-sect {
  display: flex; align-items: center;
  font-size: var(--fs-xs); font-weight: 600; color: var(--fg-tertiary);
  text-transform: uppercase; letter-spacing: 0.4px;
  padding: 10px 10px 6px;
}
.clear-btn {
  margin-left: auto; border: none; background: transparent;
  color: var(--accent); font-size: var(--fs-xs); cursor: pointer;
  font-family: inherit;
}
.search-result {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-text);
  font-size: var(--fs-base);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.search-result:hover { background: var(--bg-hover); }
.sr-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-list { font-size: var(--fs-xs); color: var(--fg-tertiary); flex-shrink: 0; }
.sr-due { font-size: var(--fs-xs); color: var(--fg-tertiary); display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
.sr-check {
  width: 14px; height: 14px;
  border: 1.5px solid var(--fg-tertiary);
  border-radius: var(--r-full);
  flex-shrink: 0;
}
.sr-check.done { background: var(--success); border-color: var(--success); }
.sr-note-ico {
  width: 20px; height: 20px;
  border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sr-note-ico[data-color="yellow"] { background: var(--theme-yellow-soft); color: var(--theme-yellow); }
.sr-note-ico[data-color="green"] { background: var(--theme-green-soft); color: var(--theme-green); }
.sr-note-ico[data-color="blue"] { background: var(--theme-blue-soft); color: var(--theme-blue); }
.sr-note-ico[data-color="pink"] { background: var(--theme-pink-soft); color: var(--theme-pink); }
.sr-note-ico[data-color="purple"] { background: var(--theme-purple-soft); color: var(--theme-purple); }
.sr-note-ico[data-color="orange"] { background: var(--theme-orange-soft); color: var(--theme-orange); }
</style>
