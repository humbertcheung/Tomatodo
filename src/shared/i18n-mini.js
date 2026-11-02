// Minimal main-process strings (tray menu). Mirrors renderer i18n keys.
const STR = {
  zh: {
    'tray.openApp': '打开主窗口',
    'tray.quickAdd': '快速添加…',
    'tray.mydayCount': '我的一天：{n}',
    'tray.dueCount': '今日到期：{n}',
    'tray.quit': '退出'
  },
  en: {
    'tray.openApp': 'Open Main Window',
    'tray.quickAdd': 'Quick Add…',
    'tray.mydayCount': 'My Day: {n}',
    'tray.dueCount': 'Due today: {n}',
    'tray.quit': 'Quit'
  }
}

let lang = 'zh'
export function setMiniLang(l) { lang = l === 'en' ? 'en' : 'zh' }
export function t(key, params = {}) {
  let s = (STR[lang] && STR[lang][key]) || STR.zh[key] || key
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
