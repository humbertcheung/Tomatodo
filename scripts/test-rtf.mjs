/**
 * Offline assertions for the RTF pipeline (src/shared/rtf.js).
 *   node scripts/test-rtf.mjs
 */
import {
  htmlToRtf, rtfToHtml, rtfToText, htmlToText,
  looksLikeMangledRtf, repairMangledRtf
} from '../src/shared/rtf.js'

let failed = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}

console.log('RTF pipeline')

// --- HTML → RTF → text round trip -----------------------------------------
const html = '<p>第一行 <b>加粗</b></p><p>第二行 <i>斜体</i> <u>下划线</u></p>'
const rtf = htmlToRtf(html)
check('round trip keeps the text', rtfToText(rtf).includes('第一行'))
check('round trip keeps bold text', rtfToText(rtf).includes('加粗'))
check('astral chars survive', rtfToText(htmlToRtf('<p>🍅 番茄</p>')).includes('🍅'))

// --- \'hh escapes are decoded with the document code page ------------------
const gbk = `{\\rtf1\\ansi\\ansicpg936\\deff0\\pard\\plain \\'d2\\'bb\\'a1\\'a2}`
const gbkText = rtfToText(gbk)
check("GBK \\'hh escapes decode", gbkText.includes('一、'), JSON.stringify(gbkText))
check('no raw hex escapes leak', !/'d2'/.test(gbkText))

// --- \* destinations are ignored (but their \pict is not) ------------------
const dest = `{\\rtf1\\ansi{\\*\\textColor;\\'d2\\'bb}\\pard hello}`
check('\\* destination text is dropped', !rtfToText(dest).includes('*;'))
check('text after a \\* group survives', rtfToText(dest).includes('hello'))

const png = '89504e470d0a1a0a0000000d494844520000000100000001080600000001f15c4890000000a49444154789c636000000200010005fe02fea70000000049454e44ae426082'
const withPic = `{\\rtf1\\ansi{\\*\\shppict{\\pict\\pngblip\\picwgoal5760\n${png}\n}}\\pard hello\\par }`
const picHtml = rtfToHtml(withPic)
check('picture is extracted', /<img src="data:image\/png;base64,/.test(picHtml))
check('picture payload is not polluted', !/pngblip/.test(picHtml))
check('text after a picture survives', picHtml.includes('hello'))
const m = /<img src="data:image\/png;base64,([^"]+)"/.exec(picHtml)
check('picture bytes start with the PNG signature',
  !!m && Buffer.from(m[1], 'base64').subarray(0, 4).toString('hex') === '89504e47')

// --- line breaks ----------------------------------------------------------
// AppKit/Curiota write a soft line break as a backslash before the newline;
// a bare newline in the stream is only source formatting and must be ignored.
const breaks = `{\\rtf1\\ansi\\ansicpg936\\pard\\plain\\f0\\fs24\n\\cf2 line one\\\nline two\\\n\\pard\\partightenfactor0\n\\cf2 line three\\par }`
const breaksHtml = rtfToHtml(breaks)
check('escaped newlines become <br>', (breaksHtml.match(/<br>/g) || []).length === 2, breaksHtml)
check('bare newlines are not text', !breaksHtml.includes('\n'), JSON.stringify(breaksHtml))
check('text around the breaks survives', breaksHtml.includes('line one') && breaksHtml.includes('line three'))
const breaksRound = rtfToText(htmlToRtf(breaksHtml))
check('line breaks survive an RTF round trip', breaksRound.split('\n').length === 3, JSON.stringify(breaksRound))

// --- literal < > & in the text must be escaped ---------------------------
const markup = rtfToHtml('{\\rtf1\\ansi a < b & c > d}')
check('angle brackets are escaped', markup.includes('&lt;') && markup.includes('&gt;'), markup)
check('ampersand is escaped', markup.includes('&amp;'), markup)
check('escaped text survives a round trip',
  rtfToText(htmlToRtf(markup)).includes('a < b & c > d'), rtfToText(htmlToRtf(markup)))

// --- repair of content that was pasted as raw RTF source -------------------
const mangled = "<p>&nbsp; &nbsp;*;;textColor;\n\n\n'd2'bb'a1'a2'd7'f3'b2'e0'b5'bc'ba'bd</p>"
check('mangled RTF is detected', looksLikeMangledRtf(mangled))
check('clean text is not flagged', !looksLikeMangledRtf('<p>hello world</p>'))
// a lone apostrophe followed by hex-ish letters is ordinary prose/code
check("prose with apostrophes is not flagged",
  !looksLikeMangledRtf("<p>import { Table } from 'ant-design-vue' 'default' 'once'</p>"))
check("code text is not repaired",
  repairMangledRtf("<p>import { Table } from 'ant-design-vue'</p>") === null)
const repaired = repairMangledRtf(mangled)
check('mangled RTF is repaired', !!repaired)
check('repaired text is readable', htmlToText(repaired).includes('一、左侧导航'),
  JSON.stringify(htmlToText(repaired)))
check('repair leaves clean content alone', repairMangledRtf('<p>hello</p>') === null)

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
