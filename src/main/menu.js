/**
 * Application menu — original implementation replicating the observed action
 * surface (see docs/RE-SPEC.md §5): task/list/group creation, rename, delete,
 * completion/importance toggles, due today/tomorrow, hide completed, search,
 * suggestions, preferences, export, about.
 */
import { app, Menu, shell } from 'electron'

export function buildAppMenu({ getMainWindow, sendCommand }) {
  const isMac = process.platform === 'darwin'
  const send = (cmd) => () => sendCommand(cmd)

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: 'About Tomatodo', click: send('about') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: send('preferences') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Tomatodo' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Tomatodo' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Task', accelerator: 'CmdOrCtrl+N', click: send('focus-new-task') },
        { label: 'New List', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-list') },
        { label: 'New Group', accelerator: 'CmdOrCtrl+Alt+Shift+N', click: send('new-group') },
        { type: 'separator' },
        { label: 'Export Data…', accelerator: 'CmdOrCtrl+E', click: send('export') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: send('search') },
        { type: 'separator' },
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          submenu: [
            { role: 'toggleSpellChecker' },
            { type: 'separator' },
            { role: 'toggleAutomaticTextReplacement' },
            { role: 'toggleAutomaticSpellingCorrection' }
          ]
        }
      ]
    },
    {
      label: 'Task',
      submenu: [
        { label: 'Complete / Uncomplete', accelerator: 'CmdOrCtrl+K', click: send('toggle-complete') },
        { label: 'Mark as Important', accelerator: 'CmdOrCtrl+P', click: send('toggle-important') },
        { type: 'separator' },
        { label: 'Add to My Day', accelerator: 'CmdOrCtrl+D', click: send('toggle-myday') },
        { type: 'separator' },
        { label: 'Due Today', accelerator: 'CmdOrCtrl+Shift+1', click: send('due-today') },
        { label: 'Due Tomorrow', accelerator: 'CmdOrCtrl+Shift+2', click: send('due-tomorrow') },
        { label: 'Remove Due Date', click: send('remove-due-date') },
        { type: 'separator' },
        { label: 'Rename Task', accelerator: 'CmdOrCtrl+R', click: send('rename-task') },
        { label: 'Delete Task', accelerator: 'CmdOrCtrl+Backspace', click: send('delete-task') }
      ]
    },
    {
      label: 'List',
      submenu: [
        { label: 'Rename List', accelerator: 'CmdOrCtrl+Alt+R', click: send('rename-list') },
        { label: 'Delete List', click: send('delete-list') },
        { type: 'separator' },
        { label: 'Hide / Show Completed', accelerator: 'CmdOrCtrl+Shift+H', click: send('hide-completed') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'My Day', accelerator: 'CmdOrCtrl+1', click: send('open-smart:myday') },
        { label: 'Important', accelerator: 'CmdOrCtrl+2', click: send('open-smart:important') },
        { label: 'Planned', accelerator: 'CmdOrCtrl+3', click: send('open-smart:planned') },
        { label: 'All Tasks', accelerator: 'CmdOrCtrl+4', click: send('open-smart:all') },
        { label: 'Completed', accelerator: 'CmdOrCtrl+5', click: send('open-smart:completed') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Toggle Always on Top', accelerator: 'CmdOrCtrl+Alt+T', click: send('toggle-stay-in-front') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://github.com/')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
