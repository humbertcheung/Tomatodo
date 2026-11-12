/**
 * Format painter — copy the character formatting under the caret and paint it
 * onto another selection. Shared by the three rich-text editors:
 * TaskDetail (task note), NoteDetail (note side panel), NotePopup (sticky).
 *
 * Shortcuts (wired by each editor):
 *   ⌥⌘C — copy the style at the caret / selection
 *   ⌥⌘V — paint the copied style onto the selection
 *
 * Match on `e.code`, never `e.key`: Option is a dead key on macOS, so with
 * ⌥⌘C pressed `e.key` arrives as "ç" and a `key === 'c'` check never fires.
 *
 * The copied style lives in a module singleton, so a style copied in one
 * editor can be painted in another (same window).
 */

/** the vocabulary of the app's editors — everything the toolbars can produce */
const TOGGLES = ['bold', 'italic', 'underline', 'strikeThrough']

let copied = null

/** transparent / background-less colour values that must not be painted */
function isNoColor(c) {
  if (!c) return true
  const s = String(c).replace(/\s/g, '')
  return s === 'rgba(0,0,0,0)' || s === 'transparent' || s === 'none'
}

/** the deepest element that carries the caret */
function caretElement(editor) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  let node = sel.anchorNode
  if (!node || !editor.contains(node)) return null
  while (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement
  if (!node || !editor.contains(node)) return null
  return node
}

/**
 * Capture the formatting at the caret / selection inside `editor`.
 * Returns the captured style object, or null when there is nothing to read.
 */
export function copyStyle(editor) {
  if (!editor) return null
  const el = caretElement(editor)
  if (!el) return null
  const cs = window.getComputedStyle(el)
  const editorCs = window.getComputedStyle(editor)
  const deco = cs.textDecorationLine || ''
  copied = {
    bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
    italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
    underline: deco.includes('underline'),
    strike: deco.includes('line-through')
  }
  // only carry colours that actually differ from the editor's own — otherwise
  // painting would bake an explicit "default colour" span onto the target
  copied.color = cs.color !== editorCs.color && !isNoColor(cs.color) ? cs.color : null
  copied.bg = !isNoColor(cs.backgroundColor) && cs.backgroundColor !== editorCs.backgroundColor
    ? cs.backgroundColor
    : null
  return { ...copied }
}

/** expand a collapsed selection to the word under the caret */
function expandToWord(sel) {
  const node = sel.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const text = node.textContent || ''
  const off = sel.anchorOffset
  const isWord = (ch) => ch && !/\s/.test(ch)
  let a = off
  while (a > 0 && isWord(text[a - 1])) a--
  let b = off
  while (b < text.length && isWord(text[b])) b++
  if (a === b) return false
  const r = document.createRange()
  r.setStart(node, a)
  r.setEnd(node, b)
  sel.removeAllRanges()
  sel.addRange(r)
  return true
}

/**
 * Paint the copied style onto the current selection inside `editor`.
 * The target always ENDS UP exactly in the copied state: the selection is
 * stripped with `removeFormat` first, so a mixed bold/plain selection cannot
 * end up half-toggled. Collapsed selections expand to the word under the
 * caret, so ⌥⌘V with a bare caret is never a silent no-op.
 */
export function pasteStyle(editor) {
  if (!editor) return 'none'
  if (!copied) return 'none'
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 'none'
  if (!editor.contains(sel.anchorNode)) return 'none'
  const range = sel.getRangeAt(0)
  if (range.collapsed && !expandToWord(sel)) return 'none'

  editor.focus()
  // 1) strip every character format inside the selection…
  document.execCommand('removeFormat', false, null)
  // 2) …then re-apply exactly the copied toggles
  for (const cmd of TOGGLES) {
    if (copied[cmd]) document.execCommand(cmd, false, null)
  }
  // 3) colours (styleWithCSS keeps the DOM clean spans instead of <font>)
  document.execCommand('styleWithCSS', false, true)
  if (copied.color) document.execCommand('foreColor', false, copied.color)
  if (copied.bg) document.execCommand('hiliteColor', false, copied.bg)
  document.execCommand('styleWithCSS', false, false)

  // execCommand does not fire `input` — nudge the editor so its debounced
  // save (bound via @input) picks the change up
  editor.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
}

/** has a style been copied at all? (components use it to pick the toast) */
export function hasCopiedStyle() {
  return !!copied
}
