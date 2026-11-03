<script setup>
/**
 * Weather panel for the My Day hero — original implementation.
 * Open-Meteo data via main process; ECharts line/bar charts (real resize),
 * percent precipitation, animated condition icon, severe-weather alerts.
 */
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { state } from '../store'
import { t } from '../i18n'
import { TriangleAlert } from 'lucide-vue-next'

const data = ref(null)
const view = ref('today') // 'today' | 'week'
const chartEl = ref(null)
let chart = null
let ro = null
let offWeather = null

async function loadWeather() {
  try {
    data.value = await window.api.weather.get()
  } catch {
    data.value = null
    return
  }
  await nextTick()
  mountChart()
  chart?.resize()
}

onMounted(async () => {
  await loadWeather()
  ro = new ResizeObserver(() => chart?.resize())
  if (chartEl.value) ro.observe(chartEl.value)
  // the city / mode / API may have changed in the settings — refetch
  offWeather = window.api.onWeatherChanged?.(() => { loadWeather() })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  offWeather?.()
  chart?.dispose()
  chart = null
})

function iconOf(code) {
  const map = { 0: 'sun', 1: 'sun', 2: 'cloud-sun', 3: 'cloud', 45: 'fog', 48: 'fog', 51: 'rain', 53: 'rain', 55: 'rain', 61: 'rain', 63: 'rain', 65: 'rain', 71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow', 80: 'rain', 81: 'rain', 82: 'rain', 85: 'snow', 86: 'snow', 95: 'storm', 96: 'storm', 99: 'storm' }
  return map[code] || 'cloud'
}
const anim = computed(() => (data.value?.ok ? iconOf(data.value.current.code) : 'cloud'))

function mountChart() {
  if (!chartEl.value || chart) return
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas', devicePixelRatio: window.devicePixelRatio || 2 })
  renderChart()
}
function renderChart() {
  if (!chart) return
  const s = series.value
  if (!s) { chart.clear(); return }
  const x = s.points.map((p) => p.label)
  const axis = {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.35)' } },
    axisTick: { show: false },
    axisLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 9 },
    axisPointer: { show: false }
  }
  const seriesList = []
  if (!s.single) {
    seriesList.push({
      name: '最高温', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
      data: s.points.map((p) => p.max),
      lineStyle: { color: '#ffd166', width: 2 }, itemStyle: { color: '#ffd166' }, clip: false,
      label: { show: true, position: 'top', color: '#fff', fontSize: 9, fontWeight: 600, formatter: (p) => `${Math.round(p.value)}℃` },
      labelLayout: { hideOverlap: true }
    })
    seriesList.push({
      name: '最低温', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
      data: s.points.map((p) => p.min),
      lineStyle: { color: '#8ec9ff', width: 2 }, itemStyle: { color: '#8ec9ff' }, clip: false,
      label: { show: true, position: 'bottom', color: 'rgba(255,255,255,0.9)', fontSize: 9, formatter: (p) => `${Math.round(p.value)}℃` },
      labelLayout: { hideOverlap: true }
    })
  } else {
    seriesList.push({
      name: '气温', type: 'line', smooth: true,
      symbol: 'circle', symbolSize: 5,
      data: s.points.map((p) => p.max),
      lineStyle: { color: '#ffd166', width: 2 },
      clip: false,
      itemStyle: { color: '#ffd166' },
      areaStyle: { color: 'rgba(255,209,102,0.10)' },
      label: { show: true, position: 'top', color: '#fff', fontSize: 9, fontWeight: 600, formatter: (p) => `${Math.round(p.value)}℃` }
    })
  }
  seriesList.push({
    name: '降雨概率', type: 'bar', yAxisIndex: 1, barWidth: s.single ? '55%' : '38%',
    data: s.points.map((p) => p.pop || 0),
    itemStyle: { color: 'rgba(142,201,255,0.75)', borderRadius: [2, 2, 0, 0] }
  })
  chart.setOption({
    grid: { left: 2, right: 2, top: s.single ? 22 : 24, bottom: 16, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23,23,48,0.92)',
      borderColor: 'rgba(255,255,255,0.2)',
      textStyle: { color: '#fff', fontSize: 11 },
      valueFormatter: (v) => v
    },
    xAxis: { type: 'category', data: x, boundaryGap: !s.single, ...axis },
    yAxis: [
      { type: 'value', show: false, min: (v) => Math.floor(v.min - 2), max: (v) => Math.ceil(v.max + 2) },
      { type: 'value', show: false, min: 0, max: 100 }
    ],
    series: seriesList
  }, true)
}

const series = computed(() => {
  if (!data.value?.ok) return null
  if (view.value === 'today') {
    // 3-hour step: dots, labels, bars and x labels all share the same rhythm
    const pts = (data.value.todayHours || [])
      .filter((h, i) => i % 3 === 0)
      .filter((h) => h.temp !== null)
    return { points: pts.map((h) => ({ label: h.label.slice(0, 2), max: h.temp, min: h.temp, pop: h.pop })), single: true }
  }
  return {
    points: (data.value.days || []).map((d, i) => ({
      label: i === 0 ? '今天' : d.label,
      max: d.max, min: d.min, pop: d.pop
    })),
    single: false
  }
})

watch([view, data], async () => {
  await nextTick()
  if (!chart && chartEl.value) mountChart()
  renderChart()
})

// also refresh when data changes elsewhere (settings)
let offChanged = null
onMounted(() => { offChanged = window.api.onDataChanged(async () => { data.value = await window.api.weather.get() }) })
onBeforeUnmount(() => { offChanged?.() })

const fmtT = (v) => (v === null || v === undefined ? '–' : `${Math.round(v)}°`)
</script>

<template>
  <div class="wx wx-loading" v-if="!data"><span class="wx-loading-text">天气加载中…</span></div>
  <div class="wx" v-else-if="data">
    <!-- animated condition icon (top-right) -->
    <div class="wx-anim" :data-anim="anim" aria-hidden="true">
      <!-- sun -->
      <svg v-if="anim === 'sun'" viewBox="0 0 40 40" width="34" height="34">
        <g class="sun-rays">
          <g stroke="#ffd166" stroke-width="2.4" stroke-linecap="round">
            <path d="M20 4v5M20 31v5M4 20h5M31 20h5M8.7 8.7l3.5 3.5M27.8 27.8l3.5 3.5M31.3 8.7l-3.5 3.5M12.2 27.8l-3.5 3.5"/>
          </g>
        </g>
        <circle cx="20" cy="20" r="8" fill="#ffd166"/>
      </svg>
      <!-- cloud / cloud-sun -->
      <svg v-else-if="anim === 'cloud' || anim === 'cloud-sun'" viewBox="0 0 40 40" width="34" height="34">
        <circle v-if="anim === 'cloud-sun'" class="csun" cx="26" cy="12" r="6" fill="#ffd166"/>
        <g class="cloud-drift">
          <path d="M10 26a6 6 0 0 1 .8-11.9A8 8 0 0 1 26 16.5 5.5 5.5 0 0 1 25.5 26z" fill="#e8ecff"/>
        </g>
      </svg>
      <!-- rain -->
      <svg v-else-if="anim === 'rain'" viewBox="0 0 40 40" width="34" height="34">
        <path d="M10 22a6 6 0 0 1 .8-11.9A8 8 0 0 1 26 12.5 5.5 5.5 0 0 1 25.5 22z" fill="#e8ecff"/>
        <g class="rain-drops" fill="#8ec9ff">
          <path d="M13 26l-1.6 4h2.4z"/>
          <path d="M20 26l-1.6 4h2.4z"/>
          <path d="M27 26l-1.6 4h2.4z"/>
        </g>
      </svg>
      <!-- snow -->
      <svg v-else-if="anim === 'snow'" viewBox="0 0 40 40" width="34" height="34">
        <path d="M10 22a6 6 0 0 1 .8-11.9A8 8 0 0 1 26 12.5 5.5 5.5 0 0 1 25.5 22z" fill="#e8ecff"/>
        <g class="snow-flakes" fill="#cfe8ff">
          <circle cx="13" cy="27" r="1.6"/><circle cx="20" cy="29" r="1.6"/><circle cx="27" cy="27" r="1.6"/>
        </g>
      </svg>
      <!-- storm -->
      <svg v-else-if="anim === 'storm'" viewBox="0 0 40 40" width="34" height="34">
        <path d="M10 20a6 6 0 0 1 .8-11.9A8 8 0 0 1 26 10.5 5.5 5.5 0 0 1 25.5 20z" fill="#c9c9e8"/>
        <path class="bolt" d="M20 22l-4 7h3l-1.6 6 5.6-8h-3.2z" fill="#ffd166"/>
      </svg>
      <!-- fog -->
      <svg v-else viewBox="0 0 40 40" width="34" height="34">
        <g class="fog-lines" stroke="#c9c9e8" stroke-width="2.4" stroke-linecap="round">
          <path d="M8 16h24M6 22h26M10 28h20"/>
        </g>
      </svg>
    </div>

    <!-- alerts -->
    <div v-if="data.ok && data.alerts.length" class="wx-alerts">
      <span v-for="a in data.alerts" :key="a" class="wx-alert" :title="a">
        <TriangleAlert :size="10" /> {{ a }}
      </span>
    </div>

    <!-- offline/error -->
    <div v-if="!data.ok" class="wx-empty">{{ t('wxset.unavailable') || '天气服务暂不可用' }}</div>
    <template v-else>
      <!-- current conditions -->
      <div class="wx-now">
        <span class="wx-temp">{{ fmtT(data.current.temp) }}</span>
        <span class="wx-desc">{{ data.current.desc }}</span>
        <span class="wx-meta" :class="{ warn: data.unresolved }">{{ data.unresolved ? (data.city + " · 城市未找到") : data.city }} • 温度{{ Math.round(data.days?.[0]?.min ?? 0) }}℃~{{ Math.round(data.days?.[0]?.max ?? 0) }}℃ • 体感 {{ fmtT(data.current.feels) }} • 湿度 {{ data.current.humidity }}%</span>
      </div>

      <!-- toggle -->
      <div class="wx-tabs">
        <button class="wx-tab" :class="{ on: view === 'today' }" @click="view = 'today'">今天</button>
        <button class="wx-tab" :class="{ on: view === 'week' }" @click="view = 'week'">7 日</button>
      </div>

      <!-- ECharts: temperature lines + precipitation % -->
      <div ref="chartEl" class="wx-chart"></div>
    </template>
  </div>
</template>

<style scoped>
/* merged into the hero card: transparent, no own chrome */
.wx {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 18px 10px 0;
  color: #fff;
  min-height: 0;
}
/* Weather animations only run while the window is focused — an unfocused
   window still animates in Chromium, which would burn ~30% CPU for nothing. */
html:not(.win-focused) .wx-anim *,
html:not(.win-focused) .wx-anim,
html:not(.win-focused) .wx-loading-text {
  animation: none !important;
}
.wx-anim {
  position: absolute;
  right: 10px; top: 6px;
  pointer-events: none;
}
.sun-rays { transform-origin: 20px 20px; animation: spin 14s steps(24) infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cloud-drift { animation: drift 4.5s steps(10) infinite alternate; }
@keyframes drift { from { transform: translateX(-1.5px); } to { transform: translateX(2px); } }
.csun { animation: pulse 3s ease-in-out infinite; transform-origin: 26px 12px; }
.rain-drops path { animation: rainfall 1.1s steps(8) infinite; }
.rain-drops path:nth-child(2) { animation-delay: 0.35s; }
.rain-drops path:nth-child(3) { animation-delay: 0.7s; }
@keyframes rainfall { from { transform: translateY(-3px); opacity: 0; } 30% { opacity: 1; } to { transform: translateY(8px); opacity: 0; } }
.snow-flakes circle { animation: snowfall 2.4s steps(12) infinite; }
.snow-flakes circle:nth-child(2) { animation-delay: 0.8s; }
.snow-flakes circle:nth-child(3) { animation-delay: 1.6s; }
@keyframes snowfall { from { transform: translateY(-4px); opacity: 0; } 30% { opacity: 1; } to { transform: translateY(7px); opacity: 0; } }
.bolt { animation: flash 2.2s ease-in-out infinite; }
@keyframes flash { 0%, 88%, 100% { opacity: 1; } 92% { opacity: 0.15; } 96% { opacity: 1; } }
.fog-lines path { animation: fogdrift 3.6s steps(10) infinite alternate; }
.fog-lines path:nth-child(2) { animation-delay: 0.5s; }
.fog-lines path:nth-child(3) { animation-delay: 1s; }
@keyframes fogdrift { from { transform: translateX(-2px); } to { transform: translateX(2px); } }

.wx-loading-text { font-size: 11px; opacity: 0.85; animation: wx-pulse 1.4s steps(6, end) infinite; }
@keyframes wx-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.95; } }
.wx-alerts { display: flex; flex-wrap: wrap; gap: 4px; padding-right: 46px; }
.wx-alert {
  display: inline-flex; align-items: center; gap: 3px;
  background: rgba(255, 214, 102, 0.92);
  color: #5c4708;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--r-full);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wx-empty { font-size: 11px; opacity: 0.85; padding: 8px 0; }
.wx-now { display: flex; align-items: center; gap: 7px; min-width: 0; padding-right: 46px; }
.wx-temp { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
.wx-desc { font-size: 12px; font-weight: 600; white-space: nowrap; }
.wx-meta.warn { color: #ffd166; }
.wx-meta {
  margin-left: auto;
  font-size: 10px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}
.wx-tabs { display: flex; gap: 4px; }
.wx-tab {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 12px;
  border-radius: var(--r-full);
  cursor: pointer;
  transition: background var(--t-fast);
  font-family: inherit;
}
.wx-tab.on { background: #fff; color: #7a5cf0; }
.wx-chart {
  min-width: 0;
  width: 100%;
  height: 118px;
}

/* stacked hero: the parent (.hero.stacked) tunes this via :deep() */
</style>
