/**
 * Minimal ZIP reader — the counterpart of zip.js (which only writes).
 *
 * Reads the central directory and inflates the stored/deflated entries.
 * Enough to open a backup archive produced by the app itself.
 */
import zlib from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

/**
 * @param {Buffer} buf
 * @returns {{name:string, data:Buffer, method:number}[]}
 */
export function readZip(buf) {
  // find the end-of-central-directory record (it may carry a comment)
  let eocd = -1
  const min = Math.max(0, buf.length - 66000)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（找不到中央目录）')

  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)

  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== CD_SIG) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    off += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue            // directory entry
    // the local header repeats the name/extra lengths
    if (buf.readUInt32LE(localOff) !== LFH_SIG) continue
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)

    let data
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = zlib.inflateRawSync(raw)
    else throw new Error(`不支持的压缩方式：${method}（${name}）`)
    entries.push({ name, data, method })
  }
  return entries
}
