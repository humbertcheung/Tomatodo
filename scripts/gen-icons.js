// Generates original tomato artwork: app icon (512) + tray template icons.
// Pure-JS PNG encoding (straight RGBA) — no nativeImage ambiguity.
// Run:  npx electron scripts/gen-icons.js
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const res = path.join(__dirname, '..', 'resources')

// ---------- minimal PNG encoder (color type 6, straight alpha) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
      : raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------- minimal PNG decoder (color type 6 / 2, bit depth 8) ----------
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, ct = 0, bd = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`unsupported PNG (bd=${bd} ct=${ct})`)
  const bpp = ct === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride); p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
  }
  // expand to straight RGBA
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    rgba[j] = out[i * bpp]
    rgba[j + 1] = out[i * bpp + 1]
    rgba[j + 2] = out[i * bpp + 2]
    rgba[j + 3] = bpp === 4 ? out[i * bpp + 3] : 255
  }
  return { w, h, rgba }
}

// ---------- high-quality downscale (alpha-weighted area average) ----------
// premultiplies before averaging so transparent edges never bleed dark halos
function downscale(img, tw, th) {
  const out = Buffer.alloc(tw * th * 4)
  const sx = img.w / tw
  const sy = img.h / th
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy))
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1 && yy < img.h; yy++) {
        for (let xx = x0; xx < x1 && xx < img.w; xx++) {
          const i = (yy * img.w + xx) * 4
          const al = img.rgba[i + 3] / 255
          r += img.rgba[i] * al; g += img.rgba[i + 1] * al; b += img.rgba[i + 2] * al
          a += al; n++
        }
      }
      const j = (y * tw + x) * 4
      if (n === 0 || a <= 0) { out[j] = out[j + 1] = out[j + 2] = out[j + 3] = 0; continue }
      out[j] = Math.round(r / a); out[j + 1] = Math.round(g / a); out[j + 2] = Math.round(b / a)
      out[j + 3] = Math.round((a / n) * 255)
    }
  }
  return { w: tw, h: th, rgba: out }
}

// ---------- tiny rasterizer (straight-alpha floats) ----------
// blend(x, y, r, g, b, a) — a is 0..1 (1 = fully opaque)
const makeCanvas = (w, h) => {
  const buf = new Float32Array(w * h * 4)
  return {
    w, h, buf,
    blend(x, y, r, g, b, a) {
      if (x < 0 || y < 0 || x >= w || y >= h) return
      const da = Math.max(0, Math.min(1, a))
      if (da <= 0) return
      const i = (y * w + x) * 4
      const sa = buf[i + 3] / 255
      const outA = da + sa * (1 - da)
      if (outA <= 0) return
      buf[i] = (r * da + buf[i] * sa * (1 - da)) / outA
      buf[i + 1] = (g * da + buf[i + 1] * sa * (1 - da)) / outA
      buf[i + 2] = (b * da + buf[i + 2] * sa * (1 - da)) / outA
      buf[i + 3] = outA * 255
    }
  }
}
function toPNG(c) {
  const out = Buffer.alloc(c.w * c.h * 4)
  for (let i = 0; i < c.buf.length; i += 4) {
    out[i] = Math.round(c.buf[i])
    out[i + 1] = Math.round(c.buf[i + 1])
    out[i + 2] = Math.round(c.buf[i + 2])
    out[i + 3] = Math.round(c.buf[i + 3])
  }
  return encodePNG(c.w, c.h, out)
}
const fillCircle = (c, cx, cy, rad, col, alpha = 1) => {
  for (let y = Math.floor(cy - rad) - 1; y <= cy + rad + 1; y++) {
    for (let x = Math.floor(cx - rad) - 1; x <= cx + rad + 1; x++) {
      const d = Math.hypot(x - cx, y - cy)
      const cov = Math.max(0, Math.min(1, rad - d + 0.5))
      if (cov > 0) c.blend(x, y, col[0], col[1], col[2], alpha * cov)
    }
  }
}
const fillEllipse = (c, cx, cy, rx, ry, rot, col, alpha = 1) => {
  const cos = Math.cos(-rot), sin = Math.sin(-rot)
  const R = Math.max(rx, ry)
  for (let y = Math.floor(cy - R) - 2; y <= cy + R + 2; y++) {
    for (let x = Math.floor(cx - R) - 2; x <= cx + R + 2; x++) {
      const dx = x - cx, dy = y - cy
      const ux = dx * cos - dy * sin, uy = dx * sin + dy * cos
      const v = (ux * ux) / (rx * rx) + (uy * uy) / (ry * ry)
      const cov = Math.max(0, Math.min(1, 1 - v + 0.06))
      if (cov > 0) c.blend(x, y, col[0], col[1], col[2], alpha * cov)
    }
  }
}
// fat 5-lobed star leaf (starfish shape, matches the reference calyx)
const fillLeaf = (c, cx, cy, R, rot, col, alpha = 1) => {
  const lobes = 5
  for (let y = Math.floor(cy - R) - 1; y <= cy + R + 1; y++) {
    for (let x = Math.floor(cx - R) - 1; x <= cx + R + 1; x++) {
      const dx = x - cx, dy = y - cy
      const rr = Math.hypot(dx, dy)
      if (rr > R) continue
      const a5 = (Math.atan2(dy, dx) - rot) * lobes
      const k = 0.5 + 0.5 * Math.cos(a5)             // 1 at lobe tip → 0 at sinus
      const f = Math.pow(k, 0.75)                    // fatten the lobes
      const edge = R * (0.55 + 0.45 * f)
      const cov = Math.max(0, Math.min(1, edge - rr + 0.5))
      if (cov > 0) c.blend(x, y, col[0], col[1], col[2], alpha * cov)
    }
  }
}
// rounded rectangle (SDF coverage)
const fillRoundRect = (c, x0, y0, w, h, rad, col, alpha = 1) => {
  for (let y = Math.floor(y0) - 1; y <= y0 + h + 1; y++) {
    for (let x = Math.floor(x0) - 1; x <= x0 + w + 1; x++) {
      const qx = Math.max(Math.abs(x - (x0 + w / 2)) - (w / 2 - rad), 0)
      const qy = Math.max(Math.abs(y - (y0 + h / 2)) - (h / 2 - rad), 0)
      const d = Math.hypot(qx, qy) - rad
      const cov = Math.max(0, Math.min(1, -d + 0.5))
      if (cov > 0) c.blend(x, y, col[0], col[1], col[2], alpha * cov)
    }
  }
}
const fillVerticalGrad = (c, x0, y0, w, h, rad, top, bottom, alpha = 1) => {
  for (let y = Math.floor(y0) - 1; y <= y0 + h + 1; y++) {
    const t = Math.max(0, Math.min(1, (y - y0) / h))
    const col = [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t
    ]
    for (let x = Math.floor(x0) - 1; x <= x0 + w + 1; x++) {
      const qx = Math.max(Math.abs(x - (x0 + w / 2)) - (w / 2 - rad), 0)
      const qy = Math.max(Math.abs(y - (y0 + h / 2)) - (h / 2 - rad), 0)
      const d = Math.hypot(qx, qy) - rad
      const cov = Math.max(0, Math.min(1, -d + 0.5))
      if (cov > 0) c.blend(x, y, col[0], col[1], col[2], alpha * cov)
    }
  }
}

app.whenReady().then(() => {

  // ---- app icons: 512 rounded (in-app) + 1024 full-bleed (icns, no backdrop) ----
  const drawScene = (S, mode) => {
    const c = makeCanvas(S, S)
    const K = S / 512
    if (mode === 'full') {
      // tile covers the whole canvas; the system applies its own squircle mask
      const top = [255, 250, 248], bot = [255, 226, 220]
      for (let y = 0; y < S; y++) {
        const t = y / S
        const col = [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, top[2] + (bot[2] - top[2]) * t]
        for (let x = 0; x < S; x++) c.blend(x, y, col[0], col[1], col[2], 1)
      }
    } else if (mode === 'rounded') {
      const x0 = 24 * K, y0 = 24 * K, tw = 464 * K, rad = 112 * K
      const top = [255, 250, 248], bot = [255, 226, 220]
      for (let y = Math.floor(y0) - 1; y <= y0 + tw + 1; y++) {
        const t = Math.max(0, Math.min(1, (y - y0) / tw))
        const col = [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, top[2] + (bot[2] - top[2]) * t]
        for (let x = Math.floor(x0) - 1; x <= x0 + tw + 1; x++) {
          const qx = Math.max(Math.abs(x - (x0 + tw / 2)) - (tw / 2 - rad), 0)
          const qy = Math.max(Math.abs(y - (y0 + tw / 2)) - (tw / 2 - rad), 0)
          const d = Math.hypot(qx, qy) - rad
          const cov = Math.max(0, Math.min(1, -d + 0.5))
          if (cov > 0) c.blend(x, y, col[0], col[1], col[2], cov)
        }
      }
    }
    const CX = 256 * K, CY = 290 * K
    const tilt = -105 * Math.PI / 180
    const dir = (dist) => [CX + dist * K * Math.cos(tilt), CY + dist * K * Math.sin(tilt)]
    if (mode !== 'cutout') fillEllipse(c, 268 * K, 424 * K, 142 * K, 24 * K, 0, [190, 60, 60], 0.25)
    fillCircle(c, CX, CY + 2 * K, 172 * K, [168, 32, 40])
    fillCircle(c, CX, CY, 164 * K, [219, 44, 52])
    const [dx1, dy1] = dir(92)
    fillCircle(c, dx1, dy1, 84 * K, [230, 66, 72], 0.55)
    const [dx2, dy2] = dir(104)
    fillCircle(c, dx2, dy2, 52 * K, [240, 96, 96], 0.45)
    fillEllipse(c, CX - 62 * K, CY - 56 * K, 32 * K, 19 * K, tilt, [255, 236, 232], 0.85)
    fillEllipse(c, 276 * K, 404 * K, 104 * K, 22 * K, 0, [168, 26, 34], 0.5)
    const [sx, sy] = dir(100)
    fillLeaf(c, sx, sy, 96 * K, tilt, [76, 174, 106])
    const [kx, ky] = dir(162)
    fillCircle(c, kx, ky, 13 * K, [58, 146, 88])

    const px = (x, y) => c.buf[(Math.round(y) * S + Math.round(x)) * 4 + 3]
    const centerA = px(CX, CY), cornerA = mode === 'rounded' ? px(6 * K, 6 * K) : 0
    if (!(centerA > 250)) throw new Error('alpha self-check failed: center=' + centerA)
    if (mode === 'rounded' && cornerA > 5) throw new Error('corner should be transparent')
    return c
  }

  fs.writeFileSync(path.join(res, 'icon.png'), toPNG(drawScene(512, 'rounded')))
  fs.writeFileSync(path.join(res, 'icon-fullbleed.png'), toPNG(drawScene(1024, 'full')))

  // transparent tomato cutout — single source for in-app renders (focus card, illustrations)
  {
    const c = drawScene(512, 'cutout')
    let ax0 = 512, ay0 = 512, ax1 = 0, ay1 = 0
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      if (c.buf[(y * 512 + x) * 4 + 3] > 4) {
        if (x < ax0) ax0 = x
        if (x > ax1) ax1 = x
        if (y < ay0) ay0 = y
        if (y > ay1) ay1 = y
      }
    }
    const pad = 6
    ax0 = Math.max(0, ax0 - pad); ay0 = Math.max(0, ay0 - pad)
    ax1 = Math.min(511, ax1 + pad); ay1 = Math.min(511, ay1 + pad)
    const cw = ax1 - ax0 + 1, ch = ay1 - ay0 + 1
    const cut = Buffer.alloc(cw * ch * 4)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sj = ((ay0 + y) * 512 + (ax0 + x)) * 4
      const j = (y * cw + x) * 4
      cut[j] = Math.round(c.buf[sj]); cut[j + 1] = Math.round(c.buf[sj + 1])
      cut[j + 2] = Math.round(c.buf[sj + 2]); cut[j + 3] = Math.round(c.buf[sj + 3])
    }
    fs.writeFileSync(path.join(res, 'tomato-cutout.png'), encodePNG(cw, ch, cut))
    console.log(`tomato-cutout.png ${cw}x${ch}`)
  }
  console.log('icon.png + icon-fullbleed.png written')

  // ---- menu bar icons: the COLORED tomato cutout, no background ----
  // macOS draws every menu bar item in an 18×18 pt slot, so the artwork is
  // fitted into a 16×16 box inside that canvas (1 pt breathing room) and the
  // @2x asset is a true 2× representation — never a 36 pt image, which would
  // render the icon twice as large as every other menu bar item.
  {
    const cutout = decodePNG(fs.readFileSync(path.join(res, 'tomato-cutout.png')))
    // 18 pt slot, 16 pt artwork
    const build = (S, { mono = false } = {}) => {
      const SLOT = 18
      const ART = 16
      const k = ART / SLOT                       // artwork scale vs. slot
      // fit the artwork into an ART-sized box, preserving aspect ratio
      const scale = Math.min(ART / cutout.w, ART / cutout.h)
      const aw = Math.max(1, Math.round(cutout.w * scale))
      const ah = Math.max(1, Math.round(cutout.h * scale))
      const small = downscale(cutout, aw, ah)
      const canvas = makeCanvas(S, S)
      const scaleFactor = S / SLOT
      const ox = Math.round((S - aw * scaleFactor) / 2)
      const oy = Math.round((S - ah * scaleFactor) / 2)
      for (let y = 0; y < ah; y++) {
        for (let x = 0; x < aw; x++) {
          const i = (y * aw + x) * 4
          const a = small.rgba[i + 3] / 255
          if (a <= 0) continue
          const r = mono ? 0 : small.rgba[i]
          const g = mono ? 0 : small.rgba[i + 1]
          const b = mono ? 0 : small.rgba[i + 2]
          // supersample the placement so the downscale stays crisp
          for (let dy = 0; dy < scaleFactor; dy++) {
            for (let dx = 0; dx < scaleFactor; dx++) {
              canvas.blend(ox + x * scaleFactor + dx, oy + y * scaleFactor + dy, r, g, b, a)
            }
          }
        }
      }
      return toPNG(canvas)
    }
    fs.writeFileSync(path.join(res, 'trayTemplateColor.png'), build(18))
    fs.writeFileSync(path.join(res, 'trayTemplateColor@2x.png'), build(36))
    fs.writeFileSync(path.join(res, 'trayTemplate.png'), build(18, { mono: true }))
    fs.writeFileSync(path.join(res, 'trayTemplate@2x.png'), build(36, { mono: true }))
    console.log('menu bar icons written (colored tomato cutout, 18pt slot)')
  }

  // embed the menu bar icons as data URIs so the tray never depends on file
  // paths (works in dev, in the packaged app, and on every platform)
  const b64 = (file) => fs.readFileSync(path.join(res, file)).toString('base64')
  const module = `// GENERATED by scripts/gen-icons.js — do not edit.
// Menu bar icons: the colored tomato cutout (no background) in the standard
// 18 pt macOS menu bar slot, plus a monochrome variant for the adaptive look.
const png = (b64) => 'data:image/png;base64,' + b64
export const TRAY_ICONS = {
  color: {
    '1x': png('${b64('trayTemplateColor.png')}'),
    '2x': png('${b64('trayTemplateColor@2x.png')}')
  },
  template: {
    '1x': png('${b64('trayTemplate.png')}'),
    '2x': png('${b64('trayTemplate@2x.png')}')
  }
}
`
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'main', 'tray-icons.js'), module, 'utf8')
  console.log('src/main/tray-icons.js written')

  app.quit()
})
