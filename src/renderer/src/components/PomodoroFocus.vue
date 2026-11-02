<script setup>
import { computed } from 'vue'
import { state, pomoStart, pomoPause, pomoReset, exitFocus } from '../store'
import { ref, onMounted } from 'vue'
import { t } from '../i18n'
import { Play, Pause, RotateCcw, Pin, PinOff, X } from 'lucide-vue-next'

const tomatoImg = ref(null)
onMounted(async () => { tomatoImg.value = await window.api.assetUrl('tomato-cutout.png') })
const pomo = computed(() => state.pomodoro)

const clock = computed(() => {
  const s = Math.max(0, Math.round(pomo.value.remainingMs / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

// phase progress (elapsed fraction of the current pomodoro/break)
const phasePct = computed(() => {
  if (!pomo.value.totalMs) return 0
  const p = 1 - pomo.value.remainingMs / pomo.value.totalMs
  return Math.max(0, Math.min(100, Math.round(p * 100)))
})

function toggleRun() {
  if (pomo.value.running) pomoPause()
  else pomoStart()
}
</script>

<template>
  <div class="compact" :class="{ break: pomo.mode === 'break' }">
    <!-- traffic-light strip: draggable, pin lives at its right end -->
    <div class="light-strip">
      <button class="pin-top" :class="{ on: state.pinned }" :aria-label="state.pinned ? t('pin.on') : t('pin.off')" @click="$emit('pin')">
        <component :is="state.pinned ? Pin : PinOff" :size="14" />
      </button>
    </div>

    <div class="card-glow"></div>

    <!-- content row: vertically centered below the traffic-light strip -->
    <div class="content-row">
      <!-- left: tomato with countdown inside -->
      <button class="tomato-btn" :aria-label="pomo.running ? t('pomo.pause') : t('pomo.start')" @click="toggleRun">
        <img class="tomato-img" :src="tomatoImg" alt="" />
        <span class="tomato-clock">{{ clock }}</span>
      </button>

      <!-- right: stats + controls -->
      <div class="right-col">
        <div class="mode-line">
          <span class="mode-chip" :class="{ run: pomo.running }">
            {{ pomo.mode === 'work' ? t('focus.work') : t('focus.break') }}
          </span>
          <span class="sessions">{{ t('focus.sessions', { n: pomo.sessionsToday }) }}</span>
        </div>

        <!-- phase progress: informative bar replaces the bare dots -->
        <div class="phase-row">
          <div class="phase-track">
            <div class="phase-fill" :style="{ width: phasePct + '%' }"></div>
          </div>
          <span class="phase-pct">{{ phasePct }}%</span>
        </div>

        <div class="ctrl-row">
          <button class="ctrl" :aria-label="pomo.running ? t('pomo.pause') : t('pomo.start')" @click="toggleRun">
            <component :is="pomo.running ? Pause : Play" :size="15" />
          </button>
          <button class="ctrl" :aria-label="t('pomo.reset')" @click="pomoReset()">
            <RotateCcw :size="15" />
          </button>
          <button class="ctrl exit" :aria-label="t('focus.exit')" @click="exitFocus">
            <X :size="15" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default { emits: ['pin'] }
</script>

<style scoped>
.compact {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  background: linear-gradient(140deg, #fff 0%, #fff5f3 58%, #ffe4e0 100%);
  overflow: hidden;
  user-select: none;
}
.compact.break {
  background: linear-gradient(140deg, #fff 0%, #f0faf3 58%, #dcf3e4 100%);
}

/* traffic-light strip: keeps system lights clear, draggable, pin on the right */
.light-strip {
  height: 32px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding: 0 6px 0 70px; /* left space for the system lights */
}
.pin-top {
  margin-left: auto;
  -webkit-app-region: no-drag;
  width: 26px; height: 26px;
  border-radius: var(--r-full);
  border: 1px solid rgba(0, 0, 0, 0.07);
  background: #fff;
  color: #b9a39f;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--t-fast);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.pin-top:hover { color: #e5484d; transform: translateY(-1px); }
.pin-top.on { color: var(--accent); border-color: var(--accent); }

.card-glow {
  position: absolute;
  width: 220px; height: 220px;
  right: -70px; top: -50px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(229, 72, 77, 0.14), transparent 65%);
  pointer-events: none;
}
.compact.break .card-glow { background: radial-gradient(circle, rgba(63, 174, 90, 0.14), transparent 65%); }

/* content: extra left padding shifts it right; centered in remaining height */
.content-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px 4px 28px; /* left > right → visual balance after the light strip */
  min-height: 0;
}

.tomato-img {
  width: 100%; height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.18));
}
.tomato-btn {
  position: relative;
  width: 76px; height: 76px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  animation: bob 2.6s ease-in-out infinite;
  filter: drop-shadow(0 5px 10px rgba(229, 72, 77, 0.28));
}
.compact.break .tomato-btn { filter: drop-shadow(0 5px 10px rgba(63, 174, 90, 0.26)); }
@keyframes bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.03); }
}
.tomato-clock {
  position: absolute;
  left: 50%; top: 57%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 4px rgba(0,0,0,0.25);
}

.right-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
  z-index: 1;
}
.mode-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
.mode-chip {
  font-size: 11px;
  font-weight: 700;
  color: #c73a35;
  background: rgba(229, 72, 77, 0.12);
  border-radius: var(--r-full);
  padding: 2px 9px;
  flex-shrink: 0;
}
.mode-chip.run { animation: chipGlow 2s ease-in-out infinite; }
@keyframes chipGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(229,72,77,0.25); }
  50% { box-shadow: 0 0 0 5px rgba(229,72,77,0); }
}
.compact.break .mode-chip { color: #2e8a47; background: rgba(63, 174, 90, 0.13); }
.sessions {
  font-size: 11px;
  color: #8a6a66;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.compact.break .sessions { color: #5f7f6a; }

/* phase progress bar */
.phase-row { display: flex; align-items: center; gap: 8px; }
.phase-track {
  flex: 1;
  height: 5px;
  border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.phase-fill {
  height: 100%;
  border-radius: var(--r-full);
  background: #e5484d;
  transition: width 0.9s linear;
}
.compact.break .phase-fill { background: var(--success); }
.phase-pct {
  font-size: 10px;
  font-weight: 600;
  color: #8a6a66;
  font-variant-numeric: tabular-nums;
  width: 30px;
  text-align: right;
  flex-shrink: 0;
}

.ctrl-row { display: flex; gap: 6px; }
.ctrl {
  width: 27px; height: 27px;
  border-radius: var(--r-full);
  border: 1px solid rgba(0,0,0,0.06);
  background: #fff;
  color: #8a6a66;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--t-fast);
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.ctrl:hover { transform: translateY(-1px); color: #e5484d; box-shadow: 0 3px 10px rgba(229,72,77,0.2); }
.compact.break .ctrl:hover { color: #2e8a47; box-shadow: 0 3px 10px rgba(63,174,90,0.2); }
.ctrl.exit:hover { color: var(--danger); }
</style>
