/**
 * Rich paste with images — original implementation.
 *
 * Order of preference:
 *   1. text/html that carries images (Chromium normalizes Word/Pages/Chrome
 *      copies to HTML; file:// image refs are inlined as data URLs)
 *   2. text/rtf with pictures (Word/Pages/Curiota documents) → our RTF parser
 *   3. plain HTML without images
 *   4. plain image item (screenshots)
 */
export async function pasteRichContent(target, clipboardData) {
  if (!target || !clipboardData) return false

  const html = clipboardData.getData('text/html') || ''
  const rtf = clipboardData.getData('text/rtf') || ''

  // raw RTF source can reach us with its `\'hh` escapes already broken
  // (a wall of `'d2'bb'a1'a2`); that is recoverable, so repair it first
  let htmlFixed = html
  if (html) {
    const { repairMangledRtf } = await import('@shared/rtf')
    htmlFixed = repairMangledRtf(html) || html
  }

  // 1) HTML with images → inline the referenced files
  if (htmlFixed && /<img/i.test(htmlFixed)) {
    const inlined = await inlineFileImages(htmlFixed)
    target.focus()
    document.execCommand('insertHTML', false, inlined)
    return true
  }

  // 2) RTF document (when the HTML flavor carries no images)
  if (rtf && /\\pict/i.test(rtf)) {
    const { rtfToHtml } = await import('@shared/rtf')
    target.focus()
    document.execCommand('insertHTML', false, rtfToHtml(rtf))
    return true
  }

  // 3) plain HTML without images
  if (htmlFixed) {
    target.focus()
    document.execCommand('insertHTML', false, htmlFixed)
    return true
  }

  // 4) screenshot / copied image
  const imgItem = [...(clipboardData.items || [])].find((i) => i.type.startsWith('image/'))
  if (imgItem) {
    const file = imgItem.getAsFile()
    if (file) {
      const dataUrl = await new Promise((resolve) => {
        const rd = new FileReader()
        rd.onload = () => resolve(rd.result)
        rd.readAsDataURL(file)
      })
      target.focus()
      document.execCommand('insertHTML', false, `<img src="${dataUrl}" style="max-width:100%;border-radius:8px;" />`)
      return true
    }
  }
  return false
}

async function inlineFileImages(html) {
  const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1])
  let out = html
  for (const src of srcs) {
    if (!src.startsWith('file://')) continue
    const p = decodeURIComponent(src.replace(/^file:\/\//, ''))
    try {
      const dataUrl = await window.api.clipboard.readImage(p)
      if (dataUrl) out = out.split(src).join(dataUrl)
    } catch { /* keep original reference */ }
  }
  return out
}

// plain-text helpers live in the shared RTF module (single source of truth)
export { htmlToText, rtfToHtml, rtfToText, htmlToRtf } from '@shared/rtf'
