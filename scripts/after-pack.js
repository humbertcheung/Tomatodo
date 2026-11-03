/**
 * electron-builder `afterPack` hook — copies the WidgetKit extension into
 * the app bundle's `Contents/PlugIns` and signs it.
 *
 * The extension has to be signed BEFORE the app bundle: electron-builder
 * deliberately skips `/Contents/PlugIns` when signing the outer bundle, so an
 * unsigned nested extension makes the whole codesign step fail.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/** the signing identity electron-builder will use for the app itself */
function resolveIdentity(context) {
  const mac = context.packager?.platformSpecificBuildOptions || {}
  if (mac.identity && mac.identity !== false) {
    // identity may be a name or a hash
    return typeof mac.identity === 'string' ? mac.identity : mac.identity.name
  }
  // fall back to the first Developer ID identity on the machine
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
    const m = /\d+\) ([A-F0-9]{40}) "Developer ID Application/.exec(out)
    if (m) return m[1]
  } catch { /* no identity available */ }
  return null
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const root = path.resolve(__dirname, '..')
  const src = path.join(root, 'resources', 'widget')
  if (!fs.existsSync(src)) {
    console.warn('[widget] resources/widget is missing — run npm run widget:build')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const pluginsDir = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'PlugIns')
  const dest = path.join(pluginsDir, 'TomatodoWidget.appex')

  fs.mkdirSync(pluginsDir, { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[widget] installed → ${dest}`)

  // sign the extension so the outer bundle can be signed afterwards
  const identity = resolveIdentity(context)
  const entitlements = path.join(dest, 'Contents', 'Info.plist')
  if (!identity) {
    console.warn('[widget] no signing identity found — signing ad-hoc')
    try {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', dest], { stdio: 'ignore' })
    } catch (e) {
      console.error('[widget] ad-hoc signing failed:', e.message)
    }
    return
  }
  try {
    const ent = path.join(root, 'build', 'entitlements.widget.mac.plist')
    const entFile = fs.existsSync(ent) ? [ '--entitlements', ent ] : []
    execFileSync('codesign', [
      '--force', '--sign', identity, '--timestamp', '--options', 'runtime', ...entFile, dest
    ], { stdio: 'ignore' })
    console.log(`[widget] signed with ${identity}`)
  } catch (e) {
    console.error('[widget] signing failed:', e.message)
    // make sure the outer bundle can still be signed
    try {
      execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', dest], { stdio: 'ignore' })
      console.log('[widget] fell back to an ad-hoc signature')
    } catch { /* ignore */ }
  }
}
