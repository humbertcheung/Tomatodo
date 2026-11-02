import { createApp } from 'vue'
import App from './App.vue'
import './style/tokens.css'
import './style/app.css'
import { initStore, state, switchMode, openView } from './store'

const app = createApp(App)
app.config.errorHandler = (err, _inst, info) => {
  ;(window.__errs = window.__errs || []).push(`${info}: ${err?.stack || err}`)
  console.error('[vue]', err)
}
app.mount('#app')

initStore().then(() => {
  document.documentElement.dataset.theme = state.theme
})

// Track window focus: Chromium keeps running CSS animations in a window that
// is visible but NOT focused, which burns a lot of CPU for an animation nobody
// is watching. The `win-focused` class lets the stylesheets pause them.
function syncFocusClass() {
  document.documentElement.classList.toggle('win-focused', document.hasFocus())
}
window.addEventListener('focus', syncFocusClass)
window.addEventListener('blur', syncFocusClass)
syncFocusClass()

// debug/testing hook (harmless in production)
window.__todoDebug = {
  state,
  switchMode,
  openView,
  async startFocus() {
    const m = await import('./store')
    await m.pomoStart()
  },
  setFocus(v) { state.focusMode = v },
  async toggleFirst() {
    const m = await import('./store')
    const t = m.state.tasks.find((x) => x.status === 'notCompleted')
    if (t) await m.toggleTaskComplete(t)
    return m.state.tasks.filter((x) => x.status === 'completed').length
  },
  counts() {
    return {
      view: state.view,
      total: state.tasks.length,
      completed: state.tasks.filter((x) => x.status === 'completed').length
    }
  }
}
