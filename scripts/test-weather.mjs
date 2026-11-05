/**
 * Weather alert tests — the severe/extreme weather reminder.
 *
 *   npx electron scripts/test-weather.mjs
 */
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { deriveAlerts, freshAlerts } from '../src/main/weather.js'

const UDD = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatodo-weather-'))

let failed = 0
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`)
  else { console.log(`  FAIL ${name} ${extra}`); failed++ }
}

app.whenReady().then(async () => {
  app.setPath('userData', UDD)

  const db = await import('../src/main/db.js')
  db.openDatabase(UDD)

  console.log('deriveAlerts')
  {
    const a = deriveAlerts({ wind_speed_10m: 60, temperature_2m: 20 }, null)
    check('high wind raises an alert', a.some((x) => x.includes('大风预警')), JSON.stringify(a))
    check('mild conditions raise nothing', deriveAlerts({ wind_speed_10m: 5, temperature_2m: 22 }, null).length === 0)

    const hot = deriveAlerts({ wind_speed_10m: 5, temperature_2m: 39 }, null)
    check('extreme heat raises an alert', hot.some((x) => x.includes('高温预警')), JSON.stringify(hot))

    const cold = deriveAlerts({ wind_speed_10m: 5, temperature_2m: -9 }, null)
    check('extreme cold raises an alert', cold.some((x) => x.includes('低温预警')), JSON.stringify(cold))

    const daily = deriveAlerts(null, {
      time: ['2026-11-05', '2026-11-06'],
      weathercode: [96, 65],
      wind_speed_10m_max: [10, 70],
      temperature_2m_max: [20, 38],
      temperature_2m_min: [5, 3]
    })
    check('thunderstorm is reported', daily.some((x) => x.includes('雷暴预警')), JSON.stringify(daily))
    check('heavy rain is reported', daily.some((x) => x.includes('强降雨预警')), JSON.stringify(daily))
    check('daily wind is reported', daily.some((x) => x.includes('大风预警')), JSON.stringify(daily))
    check('duplicate alerts are collapsed', new Set(daily).size === daily.length)
    check('at most four alerts are returned', daily.length <= 4, String(daily.length))
  }

  console.log('freshAlerts (the daily dedupe)')
  {
    const alerts = ['高温预警 · 39°C', '大风预警 · 60 km/h']
    check('everything is fresh on a new day', freshAlerts(alerts, {}, '2026-11-05').length === 2)
    check('already fired alerts are skipped',
      freshAlerts(alerts, { date: '2026-11-05', items: ['高温预警 · 39°C'] }, '2026-11-05').length === 1)
    check('the list resets on a new day',
      freshAlerts(alerts, { date: '2026-11-04', items: alerts }, '2026-11-05').length === 2)
    check('a broken record does not crash',
      freshAlerts(alerts, { date: '2026-11-05', items: null }, '2026-11-05').length === 2)
    check('no alerts means nothing to announce', freshAlerts([], {}, '2026-11-05').length === 0)
  }

  console.log('the notification itself')
  {
    const { notifySevereWeather } = await import('../src/main/weather.js')
    const today = new Date().toISOString().slice(0, 10)
    const payload = { ok: true, city: '芜湖', alerts: ['高温预警 · 39°C', '大风预警 · 60 km/h'] }

    db.setSetting('weatherAlertNotify', true)
    db.setSetting('weatherAlertsFired', null)
    notifySevereWeather(payload)
    const fired = db.getSetting('weatherAlertsFired', {})
    check('the alerts are recorded as fired',
      fired.date === today && fired.items.length === 2, JSON.stringify(fired))

    notifySevereWeather(payload)
    const again = db.getSetting('weatherAlertsFired', {})
    check('the same alerts are not announced twice', again.items.length === 2, JSON.stringify(again))

    // the switch in the settings turns the reminders off
    db.setSetting('weatherAlertNotify', false)
    db.setSetting('weatherAlertsFired', null)
    notifySevereWeather(payload)
    check('the switch suppresses the reminder',
      !db.getSetting('weatherAlertsFired', null), JSON.stringify(db.getSetting('weatherAlertsFired', null)))
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
  app.exit(failed ? 1 : 0)
})
