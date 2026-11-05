const { contextBridge, ipcRenderer } = require('electron')

const on = (channel) => (cb) => {
  const listener = (_e, ...args) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  // data
  lists: {
    list: () => ipcRenderer.invoke('lists:list'),
    counts: () => ipcRenderer.invoke('lists:counts'),
    create: (p) => ipcRenderer.invoke('lists:create', p),
    update: (id, f) => ipcRenderer.invoke('lists:update', id, f),
    remove: (id) => ipcRenderer.invoke('lists:remove', id)
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    create: (p) => ipcRenderer.invoke('groups:create', p),
    update: (id, f) => ipcRenderer.invoke('groups:update', id, f),
    remove: (id) => ipcRenderer.invoke('groups:remove', id)
  },
  tasks: {
    get: (id) => ipcRenderer.invoke('tasks:get', id),
    listByList: (id, opts) => ipcRenderer.invoke('tasks:listByList', id, opts),
    smart: (kind, opts) => ipcRenderer.invoke('tasks:smart', kind, opts),
    search: (q) => ipcRenderer.invoke('tasks:search', q),
    create: (p) => ipcRenderer.invoke('tasks:create', p),
    update: (id, f) => ipcRenderer.invoke('tasks:update', id, f),
    remove: (id) => ipcRenderer.invoke('tasks:remove', id),
    restore: (snapshot) => ipcRenderer.invoke('tasks:restore', snapshot),
    removeCompleted: (listId) => ipcRenderer.invoke('tasks:removeCompleted', listId),
    move: (id, listId) => ipcRenderer.invoke('tasks:move', id, listId),
    copy: (id, listId) => ipcRenderer.invoke('tasks:copy', id, listId),
    reposition: (id, beforeId, afterId) => ipcRenderer.invoke('tasks:reposition', id, beforeId, afterId),
    completeTask: (id) => ipcRenderer.invoke('tasks:complete', id)
  },
  steps: {
    listByTask: (taskId) => ipcRenderer.invoke('steps:listByTask', taskId),
    create: (p) => ipcRenderer.invoke('steps:create', p),
    update: (id, f) => ipcRenderer.invoke('steps:update', id, f),
    remove: (id) => ipcRenderer.invoke('steps:remove', id)
  },
  attachments: {
    listByTask: (taskId) => ipcRenderer.invoke('attachments:listByTask', taskId),
    create: (p) => ipcRenderer.invoke('attachments:create', p),
    remove: (id) => ipcRenderer.invoke('attachments:remove', id)
  },
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    get: (k) => ipcRenderer.invoke('settings:get', k),
    set: (k, v) => ipcRenderer.invoke('settings:set', k, v)
  },
  notes: {
    list: (opts) => ipcRenderer.invoke('notes:list', opts),
    writeFile: (id, html) => ipcRenderer.invoke('notes:writeFile', id, html),
    readFile: (id) => ipcRenderer.invoke('notes:readFile', id),
    deleteFile: (id) => ipcRenderer.invoke('notes:deleteFile', id),
    copy: (id) => ipcRenderer.invoke('app:copyNote', id),
    get: (id) => ipcRenderer.invoke('notes:get', id),
    create: (p) => ipcRenderer.invoke('notes:create', p),
    update: (id, f) => ipcRenderer.invoke('notes:update', id, f),
    remove: (id) => ipcRenderer.invoke('notes:remove', id),
    search: (q) => ipcRenderer.invoke('notes:search', q)
  },
  pomodoro: {
    get: () => ipcRenderer.invoke('pomodoro:get'),
    start: (mode, minutes) => ipcRenderer.invoke('pomodoro:start', mode, minutes),
    pause: () => ipcRenderer.invoke('pomodoro:pause'),
    reset: (mode) => ipcRenderer.invoke('pomodoro:reset', mode)
  },
  weather: {
    get: () => ipcRenderer.invoke('weather:get'),
    refresh: () => ipcRenderer.invoke('weather:refresh')
  },
  overview: () => ipcRenderer.invoke('app:overview'),
  iconUrl: () => ipcRenderer.invoke('app:iconUrl'),
  assetUrl: (name) => ipcRenderer.invoke('app:assetUrl', name),
  updateBadge: () => ipcRenderer.invoke('app:updateBadge'),
  exportData: () => ipcRenderer.invoke('app:export'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('app:openPath', p),
  pickFile: () => ipcRenderer.invoke('dialog:pickFile'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  dialog: {
    pickFile: () => ipcRenderer.invoke('dialog:pickFile'),
    pickImage: () => ipcRenderer.invoke('dialog:pickImage')
  },
  setLoginItem: (enabled) => ipcRenderer.invoke('app:setLoginItem', enabled),
  getLoginItem: () => ipcRenderer.invoke('app:getLoginItem'),
  relaunchTray: () => ipcRenderer.invoke('app:relaunchTray'),
  clipboard: {
    readImage: (p) => ipcRenderer.invoke('clipboard:readImage', p)
  },
  window: {
    close: () => ipcRenderer.invoke('win:close'),
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('win:toggleAlwaysOnTop'),
    setCompact: (on) => ipcRenderer.invoke('win:setCompact', on),
    ensureBounds: (rect) => ipcRenderer.invoke('win:ensureBounds', rect)
  },
  // events
  onDataChanged: on('db:changed'),
  onCommand: on('app:command'),
  onOpenTask: on('app:openTask'),
  onOpenNote: on('app:openNote'),
  onThemeChanged: on('theme:changed'),
  onPomodoroTick: on('pomodoro:tick'),
  onQuickShow: on('quick:show'),
  onWeatherChanged: on('weather:changed'),
  onQuickSectionOrder: on('quick:sectionOrder'),
  onFocusMode: on('app:focusMode'),
  // quick panel surface
  quickData: () => ipcRenderer.invoke('quick:data'),
  quickAdd: (p) => ipcRenderer.invoke('tray:quickAdd', p),
  quickToggleDone: (id, done) => ipcRenderer.invoke('quick:toggleDone', id, done),
  quickAlwaysOnTop: (on) => ipcRenderer.invoke('quick:alwaysOnTop', on),
  quickIsAlwaysOnTop: () => ipcRenderer.invoke('quick:isAlwaysOnTop'),
  quickOpenNote: (id) => ipcRenderer.invoke('quick:openNote', id),
  quickOpenMain: () => ipcRenderer.invoke('quick:openMain'),
  quickOpenFocus: () => ipcRenderer.invoke('quick:openFocus'),
  quickClose: () => ipcRenderer.invoke('quick:close'),
  // backup
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  backupSettings: (p) => ipcRenderer.invoke('backup:settings', p),
  backupRun: () => ipcRenderer.invoke('backup:run'),
  backupOpen: () => ipcRenderer.invoke('backup:open'),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  notesOpenDir: () => ipcRenderer.invoke('notes:openDir')
})
