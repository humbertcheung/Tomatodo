/**
 * Widget data server — a tiny localhost-only HTTP server that serves the
 * live widget snapshot and applies actions from the widget's intents.
 *
 * Why HTTP: the widget extension is SANDBOXED (the widget gallery requires
 * it), so it can only reach the app over the network — a sandboxed process
 * with `com.apple.security.network.client` may connect to 127.0.0.1, and the
 * unsandboxed Electron app can bind it freely. File-based channels (app
 * groups, containers) are TCC-protected in both directions on macOS 26/27.
 *
 * Bound to 127.0.0.1 only; serves two GET endpoints:
 *   /snapshot                     → the live snapshot JSON
 *   /action?type=toggleTask&id=X  → applies the action, returns the result
 */
import http from 'node:http'
import { app } from 'electron'
import { getTask, updateTask } from './db.js'
import { buildSnapshot } from './widget.js'

/** candidate ports — the server binds the first free one, the widget tries
    them all until it finds the running app */
export const WIDGET_PORTS = [47610, 47611, 47612, 47613, 47614, 47615]

let activePort = null

function handle(req, res) {
  // NOTE: resolve against a fixed origin — the Host header already carries
  // the port, appending it again would make the base URL invalid.
  const url = new URL(req.url, 'http://127.0.0.1')
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (url.pathname === '/snapshot') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(buildSnapshot()))
      return
    }

    if (url.pathname === '/action') {
      const type = url.searchParams.get('type')
      const id = url.searchParams.get('id')
      if (type === 'toggleTask' && id) {
        const t = getTask(id)
        if (t) {
          const done = t.status === 'completed'
          updateTask(id, {
            status: done ? 'notCompleted' : 'completed',
            completed_at: done ? null : new Date().toISOString()
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, status: done ? 'notCompleted' : 'completed' }))
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'task not found' }))
        }
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'unknown action' }))
      return
    }

    res.writeHead(404)
    res.end()
  } catch (err) {
    console.error('[widget-server] request failed:', err?.stack || err)
    try {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }))
    } catch { /* response already sent */ }
  }
}

/** bind the first free candidate port; resolves to the port or null */
export function startWidgetServer() {
  return new Promise((resolve) => {
    const tryBind = (index) => {
      if (index >= WIDGET_PORTS.length) {
        console.error('[widget-server] no free port')
        resolve(null)
        return
      }
      const port = WIDGET_PORTS[index]
      const server = http.createServer(handle)
      server.on('error', () => tryBind(index + 1))
      server.listen(port, '127.0.0.1', () => {
        activePort = port
        console.log(`[widget-server] listening on 127.0.0.1:${port}`)
        resolve(port)
      })
    }
    tryBind(0)
  })
}

export function getWidgetServerPort() {
  return activePort
}
