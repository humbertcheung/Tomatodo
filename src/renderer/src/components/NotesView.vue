<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { state, createNote, updateNote, askConfirm, deleteNote } from '../store'
import { t } from '../i18n'
import { Pin, PinOff, Plus, StickyNote, Search, Trash2 } from 'lucide-vue-next'
import Illustrations from './Illustrations.vue'

const filter = ref('')
let filterTimer = null

function onFilter() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(async () => {
    state.noteFilter = filter.value.trim()
    await refreshNotesRemote()
  }, 180)
}
async function refreshNotesRemote() {
  state.notes = await window.api.notes.list({ q: state.noteFilter || null })
}

const pinnedNotes = computed(() => state.notes.filter((n) => n.pinned))
const unpinnedNotes = computed(() => state.notes.filter((n) => !n.pinned))

function fmtDate(iso) {
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date(iso).toLocaleDateString(lang, { month: 'short', day: 'numeric' })
}
function snippet(n) {
  if (n.preview) return n.preview.length > 80 ? n.preview.slice(0, 80) + '…' : n.preview
  const c = (n.content || '')
    .replace(/<img[^>]*>/gi, '[图片] ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return c.length > 80 ? c.slice(0, 80) + '…' : c
}
let clickTimer = null
function openNote(n) {
  // single click opens the right panel; double click is handled separately
  if (clickTimer) return
  clickTimer = setTimeout(() => { clickTimer = null; state.selectedNoteId = n.id }, 220)
}
function openNotePopup(n) {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  state.notePopupId = n.id
}
async function onNew() { await createNote() }
async function togglePin(n) { await updateNote(n.id, { pinned: n.pinned ? 0 : 1 }) }
async function onDelete(n) {
  const ok = await askConfirm({ title: t('note.delete'), message: `“${n.title || n.content.slice(0, 20)}”` })
  if (ok) await deleteNote(n)
}

// sidebar "locate note" → scroll the card into view
function onLocate(e) {
  const el = document.querySelector(`.note-card[data-id="${e.detail}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
onMounted(() => window.addEventListener('locate-note', onLocate))
onBeforeUnmount(() => window.removeEventListener('locate-note', onLocate))
</script>

<template>
  <section class="notes-view">
    <header class="notes-head">
      <div class="notes-title-wrap">
        <span class="notes-ico"><StickyNote :size="18" /></span>
        <h1 class="notes-title">{{ t('note.title') }}</h1>
        <span class="head-count">{{ t('note.count', { n: state.notes.length }) }}</span>
      </div>
      <div class="notes-tools">
        <div class="notes-search">
          <Search :size="14" class="ns-ico" />
          <input v-model="filter" class="ns-input" :placeholder="t('note.search')" @input="onFilter" />
        </div>
        <button class="new-note" @click="onNew"><Plus :size="15" /> {{ t('note.new') }}</button>
      </div>
    </header>

    <div class="notes-scroll">
      <template v-if="state.notes.length">
        <template v-if="!state.noteFilter && pinnedNotes.length">
          <div class="sect-label"><Pin :size="12" /> {{ t('note.pinned') }}</div>
          <div class="notes-grid">
            <div
              v-for="n in pinnedNotes" :key="n.id"
              class="note-card" :data-color="n.color" :data-id="n.id"
              :class="{ selected: state.selectedNoteId === n.id }"
              @click="openNote(n)"
              @dblclick.stop="openNotePopup(n)"
            >
              <div class="nc-top">
                <span class="nc-pin on"><Pin :size="12" /></span>
                <div class="nc-actions">
                  <button class="icon-btn" :aria-label="t('note.unpin')" @click.stop="togglePin(n)"><PinOff :size="13" /></button>
                  <button class="icon-btn" :aria-label="t('note.delete')" @click.stop="onDelete(n)"><Trash2 :size="13" /></button>
                </div>
              </div>
              <div class="nc-title">{{ n.title || t('note.placeholder') }}</div>
              <div v-if="n.content" class="nc-snippet">{{ snippet(n) }}</div>
              <div class="nc-date">{{ fmtDate(n.updated_at) }}</div>
            </div>
          </div>
        </template>

        <template v-if="unpinnedNotes.length || state.noteFilter">
          <div v-if="!state.noteFilter || pinnedNotes.length === 0" class="sect-label">{{ t('note.title') }}</div>
          <div class="notes-grid">
            <div
              v-for="n in (state.noteFilter ? state.notes : unpinnedNotes)" :key="n.id"
              class="note-card" :data-color="n.color" :data-id="n.id"
              :class="{ selected: state.selectedNoteId === n.id }"
              @click="openNote(n)"
              @dblclick.stop="openNotePopup(n)"
            >
              <div class="nc-top">
                <span class="nc-pin" :class="{ on: n.pinned }"><Pin :size="12" /></span>
                <div class="nc-actions">
                  <button class="icon-btn" :aria-label="n.pinned ? t('note.unpin') : t('note.pin')" @click.stop="togglePin(n)">
                    <component :is="n.pinned ? PinOff : Pin" :size="13" />
                  </button>
                  <button class="icon-btn" :aria-label="t('note.delete')" @click.stop="onDelete(n)"><Trash2 :size="13" /></button>
                </div>
              </div>
              <div class="nc-title">{{ n.title || t('note.placeholder') }}</div>
              <div v-if="n.content" class="nc-snippet">{{ snippet(n) }}</div>
              <div class="nc-date">{{ fmtDate(n.updated_at) }}</div>
            </div>
          </div>
        </template>

        <div v-if="!state.notes.length" class="empty-state">
          <Illustrations kind="search" :size="170" />
          <div class="empty-title">{{ t('note.noResults') }}</div>
        </div>
      </template>

      <div v-else class="empty-state">
        <Illustrations kind="notes" :size="190" />
        <div class="empty-title">{{ t('note.empty') }}</div>
        <button class="new-note" style="margin-top: 14px" @click="onNew"><Plus :size="15" /> {{ t('note.new') }}</button>
      </div>
      <div class="scroll-pad"></div>
    </div>
  </section>
</template>

<style scoped>
.notes-view { flex: 1; display: flex; flex-direction: column; min-height: 0; height: 100%; }
.notes-head {
  display: flex; align-items: center; gap: var(--s-3);
  padding: 8px 26px 2px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.notes-title-wrap { display: flex; align-items: center; gap: 10px; }
.notes-ico {
  width: 34px; height: 34px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, #eec253, #d9a419);
  color: #5c4708;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-card);
}
.notes-title { font-size: var(--fs-xl); font-weight: 700; letter-spacing: -0.2px; }
.head-count { font-size: var(--fs-sm); color: var(--fg-tertiary); margin-top: 6px; }
.notes-tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.notes-search {
  display: flex; align-items: center; gap: 7px;
  background: var(--bg-field);
  border: 1px solid transparent;
  border-radius: var(--r-full);
  padding: 0 14px;
  height: 34px;
  box-shadow: var(--shadow-card);
  transition: border var(--t-fast), box-shadow var(--t-fast);
  min-width: 0;
}
.notes-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.ns-ico { color: var(--fg-tertiary); flex-shrink: 0; }
.ns-input {
  border: none; outline: none; background: transparent;
  font-size: var(--fs-sm); color: var(--fg-text);
  width: 170px; height: 100%; font-family: inherit;
}
.new-note {
  display: inline-flex; align-items: center; gap: 6px;
  border: none; border-radius: var(--r-full);
  background: var(--accent);
  color: var(--fg-on-accent);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 0 16px;
  height: 34px;
  cursor: pointer;
  transition: filter var(--t-fast), transform var(--t-fast);
  font-family: inherit;
  flex-shrink: 0;
}
.new-note:hover { filter: brightness(1.08); }
.new-note:active { transform: scale(0.97); }

.notes-scroll { flex: 1; overflow-y: auto; padding: 10px 26px 0; min-height: 0; }
.sect-label {
  display: flex; align-items: center; gap: 5px;
  font-size: var(--fs-xs); font-weight: 600;
  color: var(--fg-tertiary);
  text-transform: uppercase; letter-spacing: 0.4px;
  padding: 6px 2px;
}
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.note-card {
  position: relative;
  border-radius: 12px;
  padding: 18px 14px 10px;
  min-height: 128px;
  display: flex; flex-direction: column;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform var(--t-fast), box-shadow var(--t-fast), border var(--t-fast);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.note-card::before {
  /* color strip at least as tall as the card radius */
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 12px;
  background: linear-gradient(90deg, currentColor 0%, color-mix(in srgb, currentColor 55%, #ffffff) 100%);
  opacity: 0.72;
}
.note-card:hover { transform: translateY(-2px) rotate(-0.3deg); box-shadow: var(--shadow-pop); }
.note-card.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-card); }

.note-card[data-color="yellow"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-yellow-soft) 72%, #ffffff) 0%, var(--theme-yellow-soft) 62%, color-mix(in srgb, var(--theme-yellow-soft) 88%, var(--theme-yellow)) 100%);
  color: var(--theme-yellow);
  border-color: color-mix(in srgb, var(--theme-yellow) 18%, transparent);
}
.note-card[data-color="green"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-green-soft) 72%, #ffffff) 0%, var(--theme-green-soft) 62%, color-mix(in srgb, var(--theme-green-soft) 88%, var(--theme-green)) 100%);
  color: var(--theme-green);
  border-color: color-mix(in srgb, var(--theme-green) 18%, transparent);
}
.note-card[data-color="blue"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-blue-soft) 72%, #ffffff) 0%, var(--theme-blue-soft) 62%, color-mix(in srgb, var(--theme-blue-soft) 88%, var(--theme-blue)) 100%);
  color: var(--theme-blue);
  border-color: color-mix(in srgb, var(--theme-blue) 18%, transparent);
}
.note-card[data-color="pink"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-pink-soft) 72%, #ffffff) 0%, var(--theme-pink-soft) 62%, color-mix(in srgb, var(--theme-pink-soft) 88%, var(--theme-pink)) 100%);
  color: var(--theme-pink);
  border-color: color-mix(in srgb, var(--theme-pink) 18%, transparent);
}
.note-card[data-color="purple"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-purple-soft) 72%, #ffffff) 0%, var(--theme-purple-soft) 62%, color-mix(in srgb, var(--theme-purple-soft) 88%, var(--theme-purple)) 100%);
  color: var(--theme-purple);
  border-color: color-mix(in srgb, var(--theme-purple) 18%, transparent);
}
.note-card[data-color="orange"] {
  background: linear-gradient(168deg, color-mix(in srgb, var(--theme-orange-soft) 72%, #ffffff) 0%, var(--theme-orange-soft) 62%, color-mix(in srgb, var(--theme-orange-soft) 88%, var(--theme-orange)) 100%);
  color: var(--theme-orange);
  border-color: color-mix(in srgb, var(--theme-orange) 18%, transparent);
}

.nc-top { position: relative; display: flex; align-items: center; margin: -2px -6px 4px 0; min-height: 24px; }
.nc-pin { color: currentColor; opacity: 0.35; display: inline-flex; transform: rotate(35deg); }
.nc-pin.on { opacity: 1; transform: none; }
/* the actions are pulled out of the flow and cross-fade — reserving space or
   toggling display made the card's content shift (and its height jump) on
   hover, which read as jitter */
.nc-actions {
  position: absolute;
  right: -6px; top: 50%;
  transform: translateY(-50%);
  display: flex; gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--t-fast);
  z-index: 2;
}
.note-card:hover .nc-actions { opacity: 1; pointer-events: auto; }
.nc-actions .icon-btn { color: currentColor; background: transparent; width: 24px; height: 24px; }
.nc-actions .icon-btn:hover { background: rgba(0,0,0,0.08); }
.rotate { transform: rotate(45deg); }

.nc-title {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--fg-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nc-snippet {
  margin-top: 5px;
  font-size: var(--fs-xs);
  color: var(--fg-secondary);
  line-height: 1.5;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
.nc-date { margin-top: 8px; font-size: var(--fs-xs); color: var(--fg-tertiary); }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 70px 20px;
  color: var(--fg-tertiary);
  text-align: center;
}
.empty-art {
  width: 72px; height: 72px;
  border-radius: var(--r-full);
  background: var(--theme-yellow-soft);
  color: var(--theme-yellow);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.empty-title { font-size: var(--fs-md); font-weight: 600; color: var(--fg-secondary); }
.scroll-pad { height: 50px; }
</style>
