/**
 * RTF pipeline — original implementation.
 *
 * Every note is stored as an RTF document (Curiota-style), so rich text and
 * embedded images survive round-trips and interoperate with Word / Pages.
 *   htmlToRtf(html)  → RTF document text
 *   rtfToHtml(rtf)   → HTML for the editor / preview
 *   rtfToText(rtf)   → plain text for list previews
 */

/* ---------------- HTML → RTF ---------------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function rtfEscape(text) {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (ch === '\\') out += '\\\\'
    else if (ch === '{') out += '\\{'
    else if (ch === '}') out += '\\}'
    else if (ch === '\n') out += '\\line '
    else if (code < 128) out += ch
    else if (code <= 0xFFFF) {
      let v = code > 32767 ? code - 65536 : code
      out += `\\u${v}?`
    } else {
      const v = code - 0x10000
      const hi = 0xD800 + (v >> 10)
      const lo = 0xDC00 + (v & 0x3FF)
      out += `\\u${hi > 32767 ? hi - 65536 : hi}?\\u${lo > 32767 ? lo - 65536 : lo}?`
    }
  }
  return out
}

function dataUrlToRtfPict(dataUrl) {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) return ''
  const mime = m[1].toLowerCase()
  const kind = mime === 'image/jpeg' ? 'jpegblip' : mime === 'image/gif' ? 'gifblip' : 'pngblip'
  const b64 = m[2].replace(/\s+/g, '')
  const hex = b64ToHex(b64)
  // keep the picture's proportions: \picwgoal/\pichgoal are in twips
  const size = imagePixelSize(mime, m[2])
  const { pw, ph } = pictureGoals(size)
  return `{\\pict\\${kind}\\picwgoal${pw}\\pichgoal${ph}\n${hex}\n}`
}

/** natural pixel size of an image, so the RTF can preserve its aspect ratio */
function imagePixelSize(mime, b64) {
  try {
    const bin = atob(b64.replace(/\s+/g, ''))
    if (mime === 'image/png' && bin.length > 24) {
      const w = (bin.charCodeAt(16) << 24) | (bin.charCodeAt(17) << 16) | (bin.charCodeAt(18) << 8) | bin.charCodeAt(19)
      const h = (bin.charCodeAt(20) << 24) | (bin.charCodeAt(21) << 16) | (bin.charCodeAt(22) << 8) | bin.charCodeAt(23)
      if (w > 0 && h > 0) return { w: w >>> 0, h: h >>> 0 }
    }
    if (mime === 'image/gif' && bin.length > 10) {
      const w = bin.charCodeAt(6) | (bin.charCodeAt(7) << 8)
      const h = bin.charCodeAt(8) | (bin.charCodeAt(9) << 8)
      if (w > 0 && h > 0) return { w, h }
    }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i < bin.length - 9) {
        if (bin.charCodeAt(i) !== 0xff) { i++; continue }
        const marker = bin.charCodeAt(i + 1)
        // SOF0..SOF15 (excluding DHT/DAC/RST) carry the frame size
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6)
          const w = (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8)
          if (w > 0 && h > 0) return { w, h }
        }
        const len = (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3)
        i += 2 + len
      }
    }
  } catch { /* unknown size */ }
  return null
}

/**
 * Convert a pixel size into RTF goal sizes (twips) that keep the aspect
 * ratio and fit inside a sensible box.
 */
function pictureGoals(size) {
  const MAX_W = 5760 // 4 inches
  const MAX_H = 4320 // 3 inches
  if (!size) return { pw: MAX_W, ph: Math.round(MAX_W / 2) }
  const tw = size.w * 15 // 96 dpi px → twips
  const th = size.h * 15
  const k = Math.min(1, MAX_W / tw, MAX_H / th)
  return { pw: Math.max(1, Math.round(tw * k)), ph: Math.max(1, Math.round(th * k)) }
}

function b64ToHex(b64) {
  const bin = atob(b64)
  let out = ''
  for (let i = 0; i < bin.length; i++) out += bin.charCodeAt(i).toString(16).padStart(2, '0')
  return out
}

function dataUrlBytes(dataUrl) {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) return null
  const bin = atob(m[2].replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { mime: m[1].toLowerCase(), bytes }
}

/**
 * Convert editor HTML into an RTF document.
 * @param {string} html
 * @param {(dataUrl:string)=>string} [imageToPict] optional override for picture emission
 */
export function htmlToRtf(html, imageToPict = dataUrlToRtfPict) {
  const parts = []
  const src = String(html || '')
  const state = { b: false, i: false, u: false, s: false }
  const openStack = []

  const pushText = (raw) => {
    const text = decodeEntities(raw)
    if (text) parts.push(rtfEscape(text))
  }

  const tagRe = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*?)\/?\s*>/g
  let last = 0
  let m
  while ((m = tagRe.exec(src)) !== null) {
    if (m.index > last) pushText(src.slice(last, m.index))
    last = tagRe.lastIndex

    const closing = !!m[1]
    const tag = m[2].toLowerCase()
    const attrs = m[3] || ''

    if (tag === 'br') { parts.push('\\line '); continue }
    if (tag === 'img') {
      const sm = /src\s*=\s*"([^"]+)"/i.exec(attrs)
      const src2 = sm ? sm[1] : ''
      if (src2.startsWith('data:image/')) {
        const pict = imageToPict(src2)
        if (pict) { parts.push(pict); continue }
      }
      continue
    }
    if (tag === 'p' || tag === 'div') {
      if (!closing) {
        if (parts.length) parts.push('\\par\n')
        openStack.push({ tag, state: { ...state } })
      }
      continue
    }
    if (tag === 'li') {
      if (!closing) {
        parts.push('\\pard\\plain\\f0\\fs22 {\\listtext\\u8226?\\tab}')
        openStack.push({ tag, state: { ...state } })
      } else {
        parts.push('\\par\n')
      }
      continue
    }

    // inline formatting
    const style = (attrs || '').toLowerCase()
    const isBold = tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/.test(style)
    const isItalic = tag === 'i' || tag === 'em' || /font-style:\s*italic/.test(style)
    const isUnderline = tag === 'u' || /text-decoration:[^;]*underline/.test(style)
    const isStrike = tag === 's' || tag === 'strike' || /text-decoration:[^;]*line-through/.test(style)

    if (closing) {
      // close the matching inline tag
      for (let k = openStack.length - 1; k >= 0; k--) {
        const st = openStack[k]
        if (st.tag === tag) {
          const changed = []
          if (st.state.b !== state.b) changed.push(state.b ? '\\b0' : '\\b')
          if (st.state.i !== state.i) changed.push(state.i ? '\\i0' : '\\i')
          if (st.state.u !== state.u) changed.push(state.u ? '\\ulnone' : '\\ul')
          if (st.state.s !== state.s) changed.push(state.s ? '\\strike0' : '\\strike')
          if (changed.length) parts.push(`{${changed.join('')}}`)
          state.b = st.state.b; state.i = st.state.i
          state.u = st.state.u; state.s = st.state.s
          openStack.splice(k, 1)
          break
        }
      }
      continue
    }

    const pre = []
    if (isBold && !state.b) { pre.push('\\b'); state.b = true }
    if (isItalic && !state.i) { pre.push('\\i'); state.i = true }
    if (isUnderline && !state.u) { pre.push('\\ul'); state.u = true }
    if (isStrike && !state.s) { pre.push('\\strike'); state.s = true }
    if (pre.length) parts.push(`{${pre.join('')}}`)
    if (['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'a', 'code'].includes(tag)) {
      openStack.push({ tag, state: { ...state } })
    }
  }
  if (last < src.length) pushText(src.slice(last))

  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Helvetica;}{\\f1 SimSun;}}\n\\viewkind4\\uc1\n\\pard\\plain\\f0\\fs22\n${parts.join('')}\n}`
}

/* ---------------- RTF → HTML ---------------- */

function hexToDataUrl(hex, fallbackMime = 'image/png') {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (!clean.length) return null
  const bytes = new Uint8Array(clean.length >> 1)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16)
  // sniff mime from magic bytes
  let mime = fallbackMime
  if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = 'image/jpeg'
  else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif'
  else if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png'
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

/**
 * Parse an RTF document (subset we emit + common Word output) into HTML.
 */
export function rtfToHtml(rtf) {
  if (!rtf) return ''
  const src = String(rtf)
  let out = ''
  const stack = []
  let state = { b: false, i: false, u: false, s: false, list: false }
  let i = 0
  let pendingSkip = false

  const SKIP_DESTS = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'themedata', 'latentstyles', 'datastore', 'listtable', 'listoverridetable', 'rsidtable', 'mmathPr', 'xmlnstbl', 'pgdsctbl']

  // code page for \'hh escapes (Word CN uses cp936/GBK, modern apps cp65001)
  let codepage = 'windows-1252'
  let hexBuf = []
  const flushHex = () => {
    if (!hexBuf.length) return ''
    const bytes = new Uint8Array(hexBuf)
    hexBuf = []
    let text = ''
    try {
      text = new TextDecoder(codepage, { fatal: false }).decode(bytes)
    } catch {
      text = new TextDecoder('windows-1252', { fatal: false }).decode(bytes)
    }
    return text
  }

  const skipping = () => stack.some((g) => g.skip)
  // text-level ignore: {\*\dest ...} — the destination's words are dropped,
  // but a nested \pict (Word's {\*\shppict{\pict...}}) still yields an image
  const ignoring = () => stack.some((g) => g.skip || g.ignoreText)
  /** push raw markup (tags we generate ourselves) */
  const push = (s) => { if (!ignoring()) out += s }
  const pushRaw = (s) => { if (!skipping()) out += s }
  /** escape a text run so literal < > & in the note cannot break the HTML */
  const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Inline formatting (bold/italic/underline/strike) is tracked in `state`
  // and mirrored into the output as tags: `emitted` records which tags are
  // currently open, so a change in state emits the closing/opening tags.
  let emitted = { b: false, i: false, u: false, s: false }
  const syncTags = () => {
    const tags = []
    if (emitted.u && !state.u) tags.push('</u>')
    if (emitted.s && !state.s) tags.push('</s>')
    if (emitted.i && !state.i) tags.push('</i>')
    if (emitted.b && !state.b) tags.push('</b>')
    if (!emitted.b && state.b) tags.push('<b>')
    if (!emitted.i && state.i) tags.push('<i>')
    if (!emitted.u && state.u) tags.push('<u>')
    if (!emitted.s && state.s) tags.push('<s>')
    if (tags.length) {
      push(tags.join(''))
      emitted = { b: state.b, i: state.i, u: state.u, s: state.s }
    }
  }
  /** push literal text (HTML-escaped), keeping the formatting tags in sync */
  const pushText = (s) => {
    if (!s) return
    syncTags()
    push(escapeHtml(s))
  }
  /** push literal text WITHOUT escaping (for our own markup) */
  const pushMarkup = (s) => {
    if (!s) return
    syncTags()
    push(s)
  }
  /** flush any pending hex-escaped bytes as text */
  const flush = () => { const t = flushHex(); if (t) pushText(t) }

  while (i < src.length) {
    const ch = src[i]

    if (ch === '\\') {
      // \* → ignorable destination: mark the enclosing group
      if (src[i + 1] === '*') {
        flush()
        i += 2
        if (stack.length) stack[stack.length - 1].ignoreText = true
        else pendingSkip = true
        continue
      }
      // control word or symbol
      const m = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(src.slice(i))
      if (m) {
        const word = m[1]
        const param = m[2] !== undefined ? parseInt(m[2], 10) : null
        i += m[0].length
        // a newline directly after a control word is the delimiter and is
        // swallowed — it is NOT a line break
        if (src[i] === '\r' || src[i] === '\n') {
          if (src[i] === '\r' && src[i + 1] === '\n') i += 2
          else i += 1
        }
        flush()
        if (word === '*') { pendingSkip = true; continue }
        if (SKIP_DESTS.includes(word)) {
          // skip the remainder of the CURRENT group
          if (stack.length) stack[stack.length - 1].skip = true
          else pendingSkip = true
          continue
        }
        switch (word) {
          case 'ansicpg': {
            const cp = param ?? 1252
            codepage = cp === 936 || cp === 950 ? 'gbk' : cp === 65001 ? 'utf-8' : 'windows-1252'
            break
          }
          case 'par': pushMarkup('</p><p>'); break
          case 'line': pushMarkup('<br>'); break
          case 'tab': pushMarkup('&nbsp;&nbsp;&nbsp;'); break
          case 'u': {
            const v = param ?? 63
            const code = v < 0 ? v + 65536 : v
            pushText(String.fromCodePoint(code))
            // skip the fallback char after \uN?
            if (src[i] === '?') i++
            break
          }
          case 'b': state = { ...state, b: param !== 0 }; break
          case 'i': state = { ...state, i: param !== 0 }; break
          case 'ul': state = { ...state, u: param !== 0 }; break
          case 'ulnone': state = { ...state, u: false }; break
          case 'strike': state = { ...state, s: param !== 0 }; break
          case 'bullet': pushMarkup('<br>• '); break
          case 'pict': {
            // {\pict\pngblip\picwgoal… <hex payload> }
            // Collect ONLY the image payload: control words and whitespace are
            // skipped, the closing brace is left for the main loop so the
            // group stack stays balanced.
            let depth = 1
            let hex = ''
            let j = i
            while (j < src.length) {
              const c = src[j]
              if (c === '{') { depth++; j++; continue }
              if (c === '}') {
                depth--
                if (depth === 0) break
                j++
                continue
              }
              if (c === '\\') {
                const cw = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(src.slice(j))
                if (cw) { j += cw[0].length; continue }
                const hx = /^\\'([0-9a-fA-F]{2})/.exec(src.slice(j))
                if (hx) { hex += hx[1]; j += 4; continue }
                j++
                continue
              }
              if (/[0-9a-fA-F]/.test(c)) { hex += c; j++; continue }
              j++ // whitespace / separators
            }
            const url = hexToDataUrl(hex)
            if (url) pushRaw(`<img src="${url}" />`)
            i = j
            continue
          }
          case 'bin': {
            // \binN → skip N bytes
            const n = param ?? 0
            i += n
            break
          }
          default: break
        }
        continue
      }
      // escaped char
      const esc = src[i + 1]
      // hex escape \'hh — collect consecutive bytes, decode with the codepage
      if (esc === "'") {
        const hex = src.substr(i + 2, 2)
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          hexBuf.push(parseInt(hex, 16))
          i += 4
          continue
        }
      }
      if (esc === '\\') { pushText('\\'); i += 2; continue }
      if (esc === '{') { pushText('{'); i += 2; continue }
      if (esc === '}') { pushText('}'); i += 2; continue }
      if (esc === '~') { pushText('&nbsp;'); i += 2; continue }
      if (esc === '-') { i += 2; continue }
      if (esc === '_') { pushText('&shy;'); i += 2; continue }
      // a backslash before a line break is AppKit/TextEdit's way of writing a
      // literal newline INSIDE a paragraph (Curiota uses it for every soft
      // line break) — it must become a <br>, not be dropped
      if (esc === '\n' || esc === '\r') {
        flush()
        pushMarkup('<br>')
        if (esc === '\r' && src[i + 2] === '\n') i += 3
        else i += 2
        continue
      }
      push(esc || ''); i += 2
      continue
    }

    if (ch === '{') {
      flush()
      stack.push({ state, emitted, skip: pendingSkip, ignoreText: false })
      pendingSkip = false
      i++
      continue
    }
    if (ch === '}') {
      flush()
      const g = stack.pop()
      if (g) {
        // restore the inherited formatting and close any tag the group opened
        state = g.state
        emitted = g.emitted
        syncTags()
      }
      i++
      continue
    }
    if (hexBuf.length) {
      // literal text between hex runs: flush bytes first
      flush()
    }
    // a bare CR/LF in the text stream is source formatting and is ignored
    // (only a backslash before it makes it a real line break)
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 2
      else i += 1
      continue
    }
    pushText(ch)
    i++
  }
  flush()

  // Normalise the paragraph structure.
  // `\par` emits `</p><p>`, so the stream usually starts with a stray closer
  // and can end with an unclosed paragraph — rebuild a well-formed document.
  // NB: consecutive <br> are KEPT — they are the blank lines of the original.
  let html = out
    .replace(/<\/?p>\s*<\/?p>/g, (m) => (m.includes('</p>') ? '</p><p>' : '<p>'))
    .replace(/<p>\s*<\/p>/g, '')          // drop empty paragraphs
    .replace(/^(?:\s*<\/p>)+/, '')        // drop the leading closer
  if (!html.trim()) return ''
  if (!/^<p>/.test(html)) html = `<p>${html}`
  if (!/<\/p>$/.test(html)) html += '</p>'
  return html
}

/* ---------------- RTF → plain text ---------------- */

export function rtfToText(rtf) {
  const html = rtfToHtml(rtf)
  return html
    .replace(/<img[^>]*>/gi, '[图片]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/* ---------------- RTF → plain text (fast, no HTML) ---------------- */

export function rtfPlainText(rtf) {
  let s = String(rtf || '')
  s = s.replace(/\\pict[\s\S]*?\}\s*\}/g, ' [图片] ')
  s = s.replace(/\\par\b/g, '\n')
  s = s.replace(/\\line\b/g, '\n')
  s = s.replace(/\\tab\b/g, '\t')
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => {
    const v = parseInt(n, 10)
    return String.fromCharCode(v < 0 ? v + 65536 : v)
  })
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, '')
  s = s.replace(/[{}]/g, '')
  return s.replace(/\n{2,}/g, '\n').trim()
}

/* ---------------- document title ---------------- */

/**
 * Read the title out of an RTF document's `\info` group.
 * Hex escapes are decoded with the document's code page (Word/Curiota CN use
 * cp936/GBK), so Chinese titles come back intact instead of mojibake.
 */
export function extractRtfTitle(rtf) {
  const src = String(rtf || '')
  const m = /\{\\title([^{}]*)\}/i.exec(src)
  if (!m) return ''
  const cp = /\\ansicpg(\d+)/i.exec(src)
  const n = cp ? parseInt(cp[1], 10) : 1252
  const codepage = n === 936 || n === 950 ? 'gbk' : n === 65001 ? 'utf-8' : 'windows-1252'
  const body = m[1]
  let out = ''
  let bytes = []
  const flush = () => {
    if (!bytes.length) return
    try { out += new TextDecoder(codepage).decode(Uint8Array.from(bytes)) }
    catch { out += new TextDecoder('windows-1252').decode(Uint8Array.from(bytes)) }
    bytes = []
  }
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') {
      // hex escape \'hh
      if (body[i + 1] === "'") {
        const h = body.substr(i + 2, 2)
        if (/^[0-9a-fA-F]{2}$/.test(h)) { bytes.push(parseInt(h, 16)); i += 3; continue }
      }
      // unicode escape \uN?
      const um = /^\\u(-?\d+)\??/.exec(body.slice(i))
      if (um) {
        let v = parseInt(um[1], 10)
        if (v < 0) v += 65536
        flush()
        out += String.fromCodePoint(v)
        i += um[0].length - 1
        continue
      }
      // any other control word carries no title text
      const cw = /^\\[a-zA-Z]+-?\d* ?/.exec(body.slice(i))
      if (cw) { i += cw[0].length - 1; continue }
      i++
      continue
    }
    flush()
    out += body[i]
  }
  flush()
  return out.replace(/[{}]/g, '').trim()
}

/* ---------------- repair: RTF source pasted as plain text ---------------- */
/**
 * Detect content that is a raw RTF byte stream whose escapes lost their
 * backslash — `'d2'bb'a1'a2` instead of `\'d2\'bb\'a1\'a2`. Such a blob is
 * really a GBK byte stream and is completely recoverable.
 *
 * The test must be STRICT: a lone apostrophe followed by two hex-ish letters
 * is ordinary text (`'default`, `'once`, `'celery`…), so the signature is a
 * long UNBROKEN run of escapes — which only a real byte stream produces.
 */
const MANGLED_RUN = /('[0-9a-fA-F]{2}){6,}/

export function looksLikeMangledRtf(text) {
  const s = String(text || '')
  if (!s) return false
  return MANGLED_RUN.test(s)
}

/**
 * Rebuild the lost `\'hh` escapes and re-parse the document, so content that
 * was pasted as raw RTF source comes back as readable text.
 * @param {string} input HTML or plain text holding the mangled stream
 * @returns {string|null} repaired HTML, or null when there is nothing to repair
 */
export function repairMangledRtf(input) {
  if (!looksLikeMangledRtf(input)) return null
  let body = htmlToText(String(input))
  // the '{\*destination' marker degraded to '*;name;' — drop the remainder
  body = body.replace(/^\s*\*+[;a-zA-Z]*\s*/, '')
  // restore the escaped bytes
  body = body.replace(/'(?=[0-9a-fA-F]{2})/g, "\\'")
  const rtf = `{\\rtf1\\ansi\\ansicpg936\\deff0\\viewkind4\\uc1\\pard\\plain ${body}\n}`
  const html = rtfToHtml(rtf)
  return html && html.replace(/<[^>]+>/g, '').trim() ? html : null
}

/* ---------------- HTML → plain text (previews) ---------------- */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<img[^>]*>/gi, '[图片] ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
