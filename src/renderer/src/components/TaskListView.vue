<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { state, createTask, toggleTaskComplete, updateTask, setAllSort, clearCompleted, askConfirm, toast } from '../store'
import { t } from '../i18n'
import TaskRow from './TaskRow.vue'
import Illustrations from './Illustrations.vue'
import WeatherPanel from './WeatherPanel.vue'
import { Sun, ArrowUpDown, Rows3, MoreHorizontal, Trash2, CheckCircle2, CircleDashed } from 'lucide-vue-next'

const newInput = ref('')
const inputFocused = ref(false)
const sortOpen = ref(false)
const groupOpen = ref(false)
const moreOpen = ref(false)

const isMyDay = computed(() => state.view.kind === 'smart' && state.view.id === 'myday')
const viewId = computed(() => (state.view.kind === 'smart' ? state.view.id : ''))
// views whose completed rows can be folded into a collapsible section
const canToggleCompleted = computed(() => ['myday', 'important', 'planned', 'all'].includes(viewId.value))
const viewTitle = computed(() => t(`smart.${state.view.id}`))

const activeTasks = computed(() => state.tasks.filter((x) => x.status === 'notCompleted'))
const completedTasks = computed(() => state.tasks.filter((x) => x.status === 'completed'))
const completedOpen = ref(false)

// 已完成 / 未完成 views render their own single list + dedicated empty states
const isCompletedView = computed(() => viewId.value === 'completed')
const isOpenView = computed(() => viewId.value === 'open')
const primaryRows = computed(() => {
  if (isCompletedView.value) return completedTasks.value
  if (isOpenView.value) return activeTasks.value
  return activeTasks.value
})
const listEmpty = computed(() => primaryRows.value.length === 0)
// header count matches the sidebar: open + completed where the view includes them
const viewTotal = computed(() => {
  if (isCompletedView.value) return completedTasks.value.length
  if (isOpenView.value) return activeTasks.value.length
  return activeTasks.value.length + completedTasks.value.length
})
// the ⋯ menu only makes sense where at least one item applies
const showMore = computed(() => canToggleCompleted.value || completedTasks.value.length > 0)

const groupMode = ref(localStorage.getItem('groupMode') || 'none')
const sortState = ref(state.settings.allSort || { sort_type: 'position', sort_dir: 'asc' })

watch(() => state.view, () => { completedOpen.value = true }, { immediate: true })

function applySort(kind, dir) {
  sortState.value = { sort_type: kind, sort_dir: dir }
  setAllSort(kind, dir)
  sortOpen.value = false
}

const groupedSections = computed(() => {
  const rows = primaryRows.value
  if (groupMode.value === 'due' && !isCompletedView.value) {
    const today = localYMD()
    const tomorrow = localYMD(1)
    const buckets = [
      { key: 'overdue', label: t('task.overdue'), tasks: [] },
      { key: 'today', label: t('myday.focusToday'), tasks: [] },
      { key: 'tomorrow', label: t('task.tomorrow'), tasks: [] },
      { key: 'later', label: 'Later · 以后', tasks: [] },
      { key: 'none', label: t('task.none'), tasks: [] }
    ]
    for (const task of rows) {
      if (!task.due_date) buckets[4].tasks.push(task)
      else if (task.due_date < today) buckets[0].tasks.push(task)
      else if (task.due_date === today) buckets[1].tasks.push(task)
      else if (task.due_date === tomorrow) buckets[2].tasks.push(task)
      else buckets[3].tasks.push(task)
    }
    return buckets.filter((b) => b.tasks.length)
  }
  return [{ key: 'all', label: '', tasks: rows }]
})

function localYMD(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (state.lang === 'zh') {
    if (h < 5) return '夜深了'
    if (h < 11) return '早上好'
    if (h < 13) return '中午好'
    if (h < 18) return '下午好'
    return '晚上好'
  }
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 13) return 'Midday'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
})

// hero switches to a vertical stack below this width
const heroStacked = ref(false)
function onHeroResize() { heroStacked.value = window.innerWidth < 1000 }
onMounted(() => { window.addEventListener('resize', onHeroResize); onHeroResize() })
onBeforeUnmount(() => window.removeEventListener('resize', onHeroResize))
const dateLabel = computed(() => {
  const lang = state.lang === 'zh' ? 'zh-CN' : 'en-US'
  return new Date().toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' })
})

async function submitNew(e) {
  if (e && (e.isComposing || e.keyCode === 229)) return // IME composition Enter
  const subject = newInput.value.trim()
  if (!subject) return
  newInput.value = ''
  const payload = { subject }
  if (isMyDay.value) payload.my_day_date = localYMD()
  await createTask(payload)
}

function focusInput() {
  document.querySelector('.add-input')?.focus()
}
function onMenu(ev) { if (ev.type === 'focus-new-task') focusInput() }
onMounted(() => {
  window.addEventListener('focus-new-task', onMenu)
  window.addEventListener('toggle-completed-section', () => { completedOpen.value = !completedOpen.value })
})
onBeforeUnmount(() => window.removeEventListener('focus-new-task', onMenu))

const sortOptions = [
  { key: 'importance', label: t('view.importance') },
  { key: 'due', label: t('view.due') },
  { key: 'alphabetical', label: t('view.alphabetical') },
  { key: 'creation', label: t('view.creation') },
  { key: 'position', label: t('view.manual') }
]

async function onClearCompleted() {
  const ok = await askConfirm({ title: t('view.clearCompleted'), message: t('view.clearCompletedConfirm', { n: completedTasks.value.length }) })
  if (!ok) return
  await clearCompleted()
  toast(t('view.clearCompleted'))
  moreOpen.value = false
}

function closePop(e) {
  if (!e.target.closest('.pop-anchor')) { sortOpen.value = false; groupOpen.value = false; moreOpen.value = false }
}
onMounted(() => document.addEventListener('click', closePop))
onBeforeUnmount(() => document.removeEventListener('click', closePop))
</script>

<template>
  <section class="list-view" :class="{ myday: isMyDay }">
    <!-- normal header -->
    <header v-if="!isMyDay" class="list-head">
      <span v-if="isCompletedView" class="head-ico completed"><CheckCircle2 :size="17" /></span>
      <span v-else-if="isOpenView" class="head-ico open"><CircleDashed :size="17" /></span>
      <h1 class="list-title">{{ viewTitle }}</h1>
      <span v-if="viewTotal" class="head-count">{{ viewTotal }} {{ t('misc.tasks') }}</span>
      <div class="head-actions">
        <div class="pop-anchor">
          <button class="head-btn" :aria-label="t('view.sort')" @click.stop="sortOpen = !sortOpen; groupOpen = moreOpen = false">
            <ArrowUpDown :size="15" />
          </button>
          <div v-if="sortOpen" class="popover pop-menu">
            <div class="pop-label">{{ t('view.sortBy') }}</div>
            <button
              v-for="o in sortOptions" :key="o.key"
              class="pop-item" :class="{ selected: sortState.sort_type === o.key }"
              @click="applySort(o.key, sortState.sort_dir)"
            >
              {{ o.label }} <span class="pop-check">✓</span>
            </button>
            <div class="pop-sep"></div>
            <button class="pop-item" :class="{ selected: sortState.sort_dir === 'asc' }" @click="applySort(sortState.sort_type, 'asc')">
              ↑ {{ t('view.ascending') }} <span class="pop-check">✓</span>
            </button>
            <button class="pop-item" :class="{ selected: sortState.sort_dir === 'desc' }" @click="applySort(sortState.sort_type, 'desc')">
              ↓ {{ t('view.descending') }} <span class="pop-check">✓</span>
            </button>
          </div>
        </div>
        <div class="pop-anchor">
          <button class="head-btn" :aria-label="t('view.group')" @click.stop="groupOpen = !groupOpen; sortOpen = moreOpen = false">
            <Rows3 :size="15" />
          </button>
          <div v-if="groupOpen" class="popover pop-menu">
            <div class="pop-label">{{ t('view.groupBy') }}</div>
            <button class="pop-item" :class="{ selected: groupMode === 'none' }" @click="groupMode = 'none'; groupOpen = false">{{ t('view.noGroup') }} <span class="pop-check">✓</span></button>
            <button class="pop-item" :class="{ selected: groupMode === 'due' }" @click="groupMode = 'due'; groupOpen = false">{{ t('view.byDue') }} <span class="pop-check">✓</span></button>
          </div>
        </div>
        <div v-if="showMore" class="pop-anchor">
          <button class="head-btn" aria-label="more" @click.stop="moreOpen = !moreOpen; sortOpen = groupOpen = false">
            <MoreHorizontal :size="15" />
          </button>
          <div v-if="moreOpen" class="popover pop-menu">
            <!-- only shown where a completed section is meaningful -->
            <button v-if="completedTasks.length" class="pop-item danger" @click="onClearCompleted(); moreOpen = false">
              <Trash2 :size="15" /> {{ t('view.clearCompleted') }}（{{ completedTasks.length }}）
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- add bar (hidden in completed view) -->
    <div v-if="!isMyDay && !isCompletedView" class="add-bar" :class="{ focused: inputFocused }">
      <button class="add-plus" :aria-label="t('add.placeholder')" @click="submitNew()">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <input
        v-model="newInput"
        class="add-input"
        :placeholder="isMyDay ? t('add.placeholderMyDay') : t('add.placeholder')"
        @keydown.enter="submitNew"
        @compositionend="() => {}"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
      />
      <span v-if="inputFocused && newInput" class="add-hint">{{ t('add.hint') }}</span>
    </div>

    <!-- task list -->
    <div class="tasks-scroll" @click.self="state.selectedTaskId = null">
          <!-- hero: My Day (left) + weather (right) — one merged card -->
    <header v-if="isMyDay" class="hero" :class="{ stacked: heroStacked }">
      <div class="hero-split">
        <div class="hero-inner">
          <h1 class="hero-title">{{ t('smart.myday') }}</h1>
          <div class="hero-date">{{ dateLabel }}</div>
          <div class="hero-greeting">{{ greeting }} · {{ t('myday.focusToday') }}</div>
        </div>
        <WeatherPanel />
      </div>
    </header>

      <div class="tasks-container">
        <template v-for="section in groupedSections" :key="section.key || section.label">
          <div v-if="section.label" class="group-header">
            {{ section.label }} <span class="group-count">{{ section.tasks.length }}</span>
          </div>
          <TaskRow
            v-for="task in section.tasks"
            :key="task.id"
            :task="task"
            :selected="state.selectedTaskId === task.id"
            @select="state.selectedTaskId = task.id"
            @toggle="toggleTaskComplete(task)"
            @star="updateTask(task.id, { importance: task.importance === 'important' ? 'normal' : 'important' })"
          />
        </template>
      </div>

      <!-- dedicated empty states per view -->
      <div v-if="listEmpty" class="empty-state">
        <template v-if="isMyDay">
          <Illustrations kind="myday" :size="190" />
          <div class="empty-title">{{ t('myday.empty1') }}</div>
          <div class="empty-sub">{{ t('myday.empty2') }}</div>
        </template>
        <template v-else-if="isCompletedView">
          <Illustrations kind="tasks" :size="180" />
          <div class="empty-title">{{ t('view.completedEmpty') }}</div>
        </template>
        <template v-else-if="isOpenView">
          <Illustrations kind="myday" :size="180" />
          <div class="empty-title">{{ t('view.openEmpty') }}</div>
        </template>
        <template v-else>
          <Illustrations kind="tasks" :size="180" />
          <div class="empty-title">{{ t('myday.addFirst') }}</div>
        </template>
      </div>

      <!-- collapsible completed section (only where supported) -->
      <div v-if="canToggleCompleted && completedTasks.length" class="completed-block">
        <button class="completed-toggle" @click="completedOpen = !completedOpen">
          <span class="chev" :class="{ open: completedOpen }">›</span>
          {{ t('view.completedCount', { n: completedTasks.length }) }}
        </button>
        <div v-if="completedOpen" class="completed-list">
          <TaskRow
            v-for="task in completedTasks"
            :key="task.id"
            :task="task"
            :selected="state.selectedTaskId === task.id"
            @select="state.selectedTaskId = task.id"
            @toggle="toggleTaskComplete(task)"
          />
        </div>
      </div>
      <div class="scroll-pad"></div>
    </div>

    <!-- docked quick-add input (My Day): pinned at the window bottom -->
    <div v-if="isMyDay" class="add-bar add-docked" :class="{ focused: inputFocused }">
      <button class="add-plus" :aria-label="t('add.placeholder')" @click="submitNew()">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <input
        v-model="newInput"
        class="add-input"
        :placeholder="t('add.placeholderMyDay')"
        @keydown.enter="submitNew"
        @compositionend="() => {}"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
      />
      <span v-if="inputFocused && newInput" class="add-hint">{{ t('add.hint') }}</span>
    </div>
  </section>
</template>

<style scoped>
.list-view { flex: 1; display: flex; flex-direction: column; min-height: 0; height: 100%; }

/* My Day: hero + list scroll together; the quick-add input docks at the
   window bottom (bottom: 10px) and never scrolls with the content */
.list-view.myday { overflow: hidden; }
.myday .tasks-scroll {
  flex: 1 1 0;
  min-height: 0;
  scrollbar-gutter: stable;
}
.myday .add-docked {
  flex: 0 0 auto;
  margin: 0 32px 10px 22px;
}
.myday .hero { margin: 4px 0 8px; }
/* stacked: no extra bottom margin — the card padding already spaces it */
.myday .hero.stacked { margin-bottom: 4px; }
.myday .scroll-pad { height: 12px; }

.hero {
  margin: 4px 32px 8px 22px;
  border-radius: var(--r-xl);
  background: var(--today-grad);
  color: #fff;
  box-shadow: var(--shadow-today);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}
.hero::after {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(340px 160px at 88% -10%, rgba(255,255,255,0.28), transparent 60%),
    radial-gradient(260px 130px at 8% 120%, rgba(255,255,255,0.14), transparent 60%);
  pointer-events: none;
}
.hero-split {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 20px 20px 16px 32px;
  position: relative;
  z-index: 1;
}
.hero-inner { position: relative; z-index: 1; flex: 0 0 25%; min-width: 180px; }
.hero-title { font-size: var(--fs-hero); font-weight: 700; letter-spacing: -0.3px; }
.hero-date { margin-top: 2px; font-size: var(--fs-sm); opacity: 0.92; }
.hero-greeting { margin-top: 8px; font-size: var(--fs-base); font-weight: 500; opacity: 0.95; }

/* narrow window: hero stacks vertically.
   Top and bottom padding stay identical, and the weather block hugs its
   content (no stretched empty area at the bottom). */
.hero.stacked .hero-split {
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px 18px 32px;
}
.hero.stacked .hero-inner { width: 100%; flex: none; }
/* stacked: the weather block hugs its content → even top/bottom card padding */
.hero.stacked :deep(.wx) {
  flex: 0 0 auto;
  padding-top: 8px;
  padding-bottom: 0;
}

.list-head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 8px 32px 2px 22px;
  flex-shrink: 0;
}
.head-ico {
  width: 32px; height: 32px;
  border-radius: var(--r-md);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  box-shadow: var(--shadow-card);
}
.head-ico.completed { background: linear-gradient(135deg, #3cb371, #2e9e5b); }
.head-ico.open { background: linear-gradient(135deg, #f09a3e, #e07c2c); }
.list-title { font-size: var(--fs-xl); font-weight: 700; letter-spacing: -0.2px; }
.head-count { font-size: var(--fs-sm); color: var(--fg-tertiary); margin-top: 6px; }
.head-actions { margin-left: auto; display: flex; gap: 4px; }
.head-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border: none; border-radius: var(--r-sm);
  background: transparent;
  color: var(--fg-secondary);
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.head-btn:hover { background: var(--bg-hover); color: var(--fg-text); }
.pop-anchor { position: relative; }
.pop-menu { right: 0; top: 34px; min-width: 190px; }

.add-bar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin: 8px 32px 8px 22px;
  padding: 4px 8px 4px 5px;
  border-radius: var(--r-lg);
  border: 1px solid transparent;
  background: var(--bg-field);
  box-shadow: var(--shadow-card);
  transition: border var(--t-fast), box-shadow var(--t-fast);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.add-bar.focused { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.add-plus {
  width: 32px; height: 32px;
  border: none;
  border-radius: var(--r-md);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent);
  background: var(--accent-soft);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform var(--t-fast), background var(--t-fast);
}
.add-plus:hover { transform: scale(1.06); }
.add-input {
  flex: 1;
  border: none; outline: none;
  background: transparent;
  font-size: var(--fs-base);
  color: var(--fg-text);
  padding: 9px 0;
  font-family: inherit;
  min-width: 0;
}
.add-input::placeholder { color: var(--fg-tertiary); }
.add-hint { font-size: var(--fs-xs); color: var(--fg-tertiary); white-space: nowrap; }

.tasks-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 2px 22px 0;
  min-height: 0;
  scrollbar-gutter: stable;
}
.tasks-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}
.group-header {
  display: flex; align-items: center; gap: 8px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-secondary);
  padding: 12px 4px 0;
}
.group-count { color: var(--fg-tertiary); font-weight: 500; }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 46px 20px;
  color: var(--fg-tertiary);
  text-align: center;
}
.empty-title { font-size: var(--fs-md); font-weight: 600; color: var(--fg-secondary); margin-top: 6px; }
.empty-sub { margin-top: 4px; font-size: var(--fs-sm); max-width: 280px; }

.completed-block { margin-top: 14px; }
.completed-toggle {
  display: flex; align-items: center; gap: 6px;
  border: none; background: transparent;
  color: var(--fg-tertiary);
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 8px 6px;
  cursor: pointer;
  border-radius: var(--r-sm);
  font-family: inherit;
}
.completed-toggle:hover { color: var(--fg-secondary); }
.chev { display: inline-block; transition: transform var(--t-fast); font-size: 14px; }
.chev.open { transform: rotate(90deg); }
.completed-list { display: flex; flex-direction: column; gap: 8px; }
.scroll-pad { height: 60px; }
</style>
