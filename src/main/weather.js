/**
 * Weather service — Open-Meteo (no API key). Location via IP geolocation
 * with a Beijing fallback; 30-minute in-memory cache; last payload persisted
 * for offline display.
 */
import { net, Notification } from 'electron'
import { getSetting, setSetting } from './db.js'

let cache = { at: 0, data: null }
const TTL = 30 * 60 * 1000

function fetchJSON(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const req = net.request(url)
      let done = false
      const timer = setTimeout(() => {
        if (!done) { done = true; req.abort(); reject(new Error('timeout')) }
      }, timeoutMs)
      req.on('response', (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => {
          if (done) return
          done = true
          clearTimeout(timer)
          try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
        })
      })
      req.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e) } })
      req.end()
    } catch (e) { reject(e) }
  })
}

/** IP-geolocation providers, tried in order (no key required) */
const IP_PROVIDERS = [
  {
    url: 'https://ipwho.is/',
    pick: (j) => (j?.success !== false && typeof j?.latitude === 'number'
      ? { lat: j.latitude, lon: j.longitude, city: j.city || j.region || '' } : null)
  },
  {
    url: 'https://api.ip.sb/geoip',
    pick: (j) => (typeof j?.latitude === 'number'
      ? { lat: j.latitude, lon: j.longitude, city: j.city || j.region || '' } : null)
  },
  {
    url: 'https://ipapi.co/json/',
    pick: (j) => (typeof j?.latitude === 'number'
      ? { lat: j.latitude, lon: j.longitude, city: j.city || j.region || '' } : null)
  },
  {
    url: 'https://ifconfig.co/json',
    pick: (j) => (typeof j?.latitude === 'number'
      ? { lat: j.latitude, lon: j.longitude, city: j.city || j.country_name || '' } : null)
  }
]

/** representative city for the system time zone (last-resort fallback) */
const TZ_CITY = {
  'Asia/Shanghai': '上海', 'Asia/Chongqing': '重庆', 'Asia/Harbin': '哈尔滨',
  'Asia/Urumqi': '乌鲁木齐', 'Asia/Kashgar': '喀什', 'Asia/Hong_Kong': '香港',
  'Asia/Macau': '澳门', 'Asia/Taipei': '台北', 'Asia/Tokyo': '东京',
  'Asia/Seoul': '首尔', 'Europe/London': '伦敦', 'America/New_York': '纽约',
  'America/Los_Angeles': '洛杉矶', 'Europe/Paris': '巴黎', 'Europe/Berlin': '柏林'
}

function systemCity() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    return TZ_CITY[tz] || (tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : '')
  } catch { return '' }
}

/** geocode a city name through Open-Meteo */
async function geocodeCity(city) {
  if (!city) return null
  const g = await fetchJSON(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
  )
  const hit = g?.results?.[0]
  if (hit && typeof hit.latitude === 'number') {
    return { lat: hit.latitude, lon: hit.longitude, city: hit.name || city }
  }
  return null
}

/** ask every provider in turn; the first usable answer wins */
async function ipLocation() {
  for (const p of IP_PROVIDERS) {
    try {
      const j = await fetchJSON(p.url, 3500)
      const loc = p.pick(j)
      if (loc) return loc
    } catch { /* try the next provider */ }
  }
  return null
}

async function resolveLocation() {
  const mode = getSetting('weatherMode', 'auto')

  // manual city mode → geocode via Open-Meteo
  if (mode === 'manual') {
    const city = (getSetting('weatherCity', '北京') || '北京').trim()
    const cached = getSetting('weatherGeo', null)
    if (cached && cached.city === city && cached.lat) return cached
    const hit = await geocodeCity(city).catch(() => null)
    if (hit) {
      setSetting('weatherGeo', hit)
      return hit
    }
    // the city could not be resolved — be honest about it instead of
    // silently showing another city's weather
    return { lat: 39.9042, lon: 116.4074, city, unresolved: true }
  }

  // auto mode → IP geolocation, then the system time zone, then Beijing
  const ip = await ipLocation()
  if (ip) {
    setSetting('weatherLocation', ip)
    return ip
  }
  const tzCity = systemCity()
  if (tzCity) {
    const hit = await geocodeCity(tzCity).catch(() => null)
    if (hit) return hit
  }
  const fallbackCity = (getSetting('weatherCity', '北京') || '北京').trim()
  const fb = await geocodeCity(fallbackCity).catch(() => null)
  if (fb) return fb
  return { lat: 39.9042, lon: 116.4074, city: fallbackCity }
}

const WMO = {
  0: { zh: '晴', en: 'Clear', icon: 'sun' },
  1: { zh: '大致晴朗', en: 'Mostly clear', icon: 'sun' },
  2: { zh: '多云', en: 'Partly cloudy', icon: 'cloud-sun' },
  3: { zh: '阴', en: 'Overcast', icon: 'cloud' },
  45: { zh: '雾', en: 'Fog', icon: 'fog' },
  48: { zh: '冻雾', en: 'Rime fog', icon: 'fog' },
  51: { zh: '小毛雨', en: 'Light drizzle', icon: 'rain' },
  53: { zh: '毛雨', en: 'Drizzle', icon: 'rain' },
  55: { zh: '浓毛雨', en: 'Dense drizzle', icon: 'rain' },
  61: { zh: '小雨', en: 'Light rain', icon: 'rain' },
  63: { zh: '中雨', en: 'Rain', icon: 'rain' },
  65: { zh: '大雨', en: 'Heavy rain', icon: 'rain' },
  71: { zh: '小雪', en: 'Light snow', icon: 'snow' },
  73: { zh: '中雪', en: 'Snow', icon: 'snow' },
  75: { zh: '大雪', en: 'Heavy snow', icon: 'snow' },
  77: { zh: '雪粒', en: 'Snow grains', icon: 'snow' },
  80: { zh: '阵雨', en: 'Showers', icon: 'rain' },
  81: { zh: '强阵雨', en: 'Heavy showers', icon: 'rain' },
  82: { zh: '暴雨', en: 'Violent showers', icon: 'rain' },
  85: { zh: '阵雪', en: 'Snow showers', icon: 'snow' },
  86: { zh: '强阵雪', en: 'Heavy snow showers', icon: 'snow' },
  95: { zh: '雷暴', en: 'Thunderstorm', icon: 'storm' },
  96: { zh: '雷暴伴冰雹', en: 'Thunderstorm + hail', icon: 'storm' },
  99: { zh: '强雷暴伴冰雹', en: 'Severe thunderstorm', icon: 'storm' }
}
export function describeCode(code, lang = 'zh') {
  const w = WMO[code] || { zh: '未知', en: 'Unknown', icon: 'cloud' }
  return lang === 'en' ? w.en : w.zh
}
export function iconOf(code) {
  return (WMO[code] || { icon: 'cloud' }).icon
}

/** derive severe-weather alerts from the forecast payload */
export function deriveAlerts(current, daily) {
  const alerts = []
  const lang = 'zh'
  if (current) {
    if (current.wind_speed_10m >= 50) alerts.push(`大风预警 · 风速 ${Math.round(current.wind_speed_10m)} km/h`)
    if (current.temperature_2m >= 37) alerts.push(`高温预警 · ${Math.round(current.temperature_2m)}°C`)
    if (current.temperature_2m <= -5) alerts.push(`低温预警 · ${Math.round(current.temperature_2m)}°C`)
  }
  if (daily && Array.isArray(daily.time)) {
    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      const code = daily.weathercode[i]
      const day = daily.time[i]
      if (code >= 95) alerts.push(`雷暴预警 · ${day}`)
      else if (code === 65 || code === 82) alerts.push(`强降雨预警 · ${day}`)
      else if (code === 75 || code === 86) alerts.push(`强降雪预警 · ${day}`)
      if (daily.wind_speed_10m_max?.[i] >= 50) alerts.push(`大风预警 · ${day}`)
      const tmax = daily.temperature_2m_max?.[i]
      const tmin = daily.temperature_2m_min?.[i]
      if (tmax !== undefined && tmax >= 37) alerts.push(`高温预警 · ${day} (${Math.round(tmax)}°C)`)
      if (tmin !== undefined && tmin <= -5) alerts.push(`低温预警 · ${day} (${Math.round(tmin)}°C)`)
    }
  }
  return [...new Set(alerts)].slice(0, 4)
}

/**
 * Drop every cached weather artefact — called when the city / mode / API
 * settings change, otherwise the panel keeps showing the old location for
 * up to 30 minutes.
 */
export function invalidateWeatherCache() {
  cache = { at: 0, data: null }
  try { setSetting('weatherCache', null) } catch { /* ignore */ }
  try { setSetting('weatherGeo', null) } catch { /* ignore */ }
}

/**
 * The alerts that still have to be announced: everything in the payload that
 * has not been shown yet today (the dedupe list resets at midnight).
 */
export function freshAlerts(alerts, fired, today) {
  const already = fired && fired.date === today && Array.isArray(fired.items) ? fired.items : []
  return (Array.isArray(alerts) ? alerts : []).filter((a) => !already.includes(a))
}

/**
 * Fire a system notification for every severe-weather alert that has not
 * been shown today (the dedupe list resets at midnight).
 */
export function notifySevereWeather(data) {
  try {
    if (!getSetting('weatherAlertNotify', true)) return
    if (!data?.ok || !Array.isArray(data.alerts) || !data.alerts.length) return
    if (!Notification.isSupported()) return
    const today = new Date().toISOString().slice(0, 10)
    const fired = getSetting('weatherAlertsFired', {}) || {}
    const fresh = freshAlerts(data.alerts, fired, today)
    if (!fresh.length) return
    for (const a of fresh.slice(0, 3)) {
      const n = new Notification({
        title: 'Tomatodo · 恶劣天气提醒',
        body: `${data.city}: ${a}`
      })
      n.on('click', () => { /* the main window is already the surface for this */ })
      n.show()
    }
    setSetting('weatherAlertsFired', { date: today, items: [...(fired.date === today ? (fired.items || []) : []), ...fresh] })
  } catch { /* best effort */ }
}

export async function getWeather() {
  const lang = 'zh'
  if (cache.data && Date.now() - cache.at < TTL) return cache.data
  try {
    const loc = await resolveLocation()
    // configurable API source (default: Open-Meteo; optional API key appended)
    const base = (getSetting('weatherApiBase', '') || 'https://api.open-meteo.com/v1/forecast').trim()
    const key = (getSetting('weatherApiKey', '') || '').trim()
    const url =
      `${base}?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weathercode,wind_speed_10m` +
      `&hourly=temperature_2m,precipitation_probability,weathercode` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7` +
      (key ? `&apikey=${encodeURIComponent(key)}` : '')
    const raw = await fetchJSON(url)
    const now = new Date()
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const hourIdx = (raw.hourly?.time || []).findIndex((t) => t.startsWith(dateKey))

    // today: next 24 hourly points from now
    const nowHour = now.getHours()
    const startIdx = hourIdx >= 0 ? hourIdx + nowHour : 0
    const hours = []
    for (let i = startIdx; i < Math.min(startIdx + 24, (raw.hourly?.time || []).length); i++) {
      hours.push({
        label: String((i % 24)).padStart(2, '0') + ':00',
        temp: raw.hourly.temperature_2m?.[i] ?? null,
        pop: raw.hourly.precipitation_probability?.[i] ?? 0
      })
    }

    const days = (raw.daily?.time || []).map((d, i) => ({
      label: d.slice(5).replace('-', '/'),
      code: raw.daily.weathercode?.[i] ?? 0,
      max: raw.daily.temperature_2m_max?.[i] ?? null,
      min: raw.daily.temperature_2m_min?.[i] ?? null,
      pop: raw.daily.precipitation_probability_max?.[i] ?? 0,
      wind: raw.daily.wind_speed_10m_max?.[i] ?? 0
    }))

    const data = {
      ok: true,
      fetchedAt: Date.now(),
      city: loc.city,
      unresolved: !!loc.unresolved,
      current: {
        temp: raw.current?.temperature_2m,
        feels: raw.current?.apparent_temperature,
        humidity: raw.current?.relative_humidity_2m,
        wind: raw.current?.wind_speed_10m,
        code: raw.current?.weathercode ?? 0,
        desc: describeCode(raw.current?.weathercode ?? 0, lang)
      },
      todayHours: hours,
      days,
      alerts: deriveAlerts(raw.current, raw.daily)
    }
    cache = { at: Date.now(), data };
    notifySevereWeather(data)
    setSetting('weatherCache', data)
    return data
  } catch (e) {
    // offline: serve the last cached payload if fresh enough (≤ 6h)
    const saved = getSetting('weatherCache', null)
    if (saved && Date.now() - saved.fetchedAt < 6 * 60 * 60 * 1000) return { ...saved, stale: true }
    return { ok: false, error: e?.message || String(e) }
  }
}
