/**
 * Bundle the built widget extension into the Electron app.
 *
 * The widget is copied into `resources/widget/` and the packaging step
 * places it under `Contents/PlugIns/` — that is where macOS looks for
 * app extensions that ship inside an app bundle.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const built = path.join(root, 'widget', 'build', 'Build', 'Products', 'Release', 'TomatodoWidget.appex')
const target = path.join(root, 'resources', 'widget')

if (!fs.existsSync(built)) {
  console.error(`widget not built: ${built}`)
  console.error('run: npm run widget:build')
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.cpSync(built, target, { recursive: true })

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size
  }
  return total
}
console.log(`widget bundled → resources/widget (${Math.round(dirSize(target) / 1024)} KB of files)`)
