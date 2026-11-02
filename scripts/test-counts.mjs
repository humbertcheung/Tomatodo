import * as db from '../src/main/db.js'
import fs from 'node:fs'
import os from 'node:os'
const dir = fs.mkdtempSync(os.tmpdir() + '/tODO-')
db.openDatabase(dir)
const TASKS = [{"id": "tnRlI7vg21eQx", "list_id": "ta8g0gIwM-7pm", "subject": "fdaf", "note_html": "dasdfasd ff asdfasd fasdf g wtw g&nbsp; g sdg sdg&nbsp;", "status": "notCompleted", "importance": "normal", "due_date": "2026-11-03", "due_has_time": 0, "reminder_date": "2026-11-02T16:35:00.000Z", "recurrence_json": null, "my_day_date": "2026-11-01", "position": 0.0078125, "completed_at": null, "created_at": "2026-11-01T03:44:26.497Z", "updated_at": "2026-11-01T03:44:26.497Z"}, {"id": "tkX-SjjhJqz6y", "list_id": "ta8g0gIwM-7pm", "subject": "\u5df2\u5b8c\u6210\u4efb\u52a1", "note_html": "dasdfasd ff asdfasd fasdf g wtw g&nbsp; g sdg sdg&nbsp;", "status": "completed", "importance": "normal", "due_date": "2026-11-02", "due_has_time": 0, "reminder_date": "2026-11-01T16:35:00.000Z", "recurrence_json": "{\"type\":\"daily\",\"interval\":1,\"weekdays\":null}", "my_day_date": "2026-11-01", "position": 0.015625, "completed_at": "2026-11-01T03:44:26.481Z", "created_at": "2026-10-31T16:35:14.461Z", "updated_at": "2026-11-01T03:46:37.183Z"}, {"id": "tAuopG3CDXrgv", "list_id": "ta8g0gIwM-7pm", "subject": "fdaf", "note_html": "", "status": "notCompleted", "importance": "normal", "due_date": null, "due_has_time": 0, "reminder_date": null, "recurrence_json": null, "my_day_date": "2026-11-01", "position": 0.03125, "completed_at": null, "created_at": "2026-10-31T16:35:13.693Z", "updated_at": "2026-10-31T16:35:13.693Z"}, {"id": "teT1WEFhPSb__", "list_id": "ta8g0gIwM-7pm", "subject": "fasdf", "note_html": "", "status": "notCompleted", "importance": "normal", "due_date": null, "due_has_time": 0, "reminder_date": null, "recurrence_json": null, "my_day_date": "2026-11-01", "position": 0.0625, "completed_at": null, "created_at": "2026-10-31T16:35:12.686Z", "updated_at": "2026-10-31T16:35:12.686Z"}, {"id": "tv4d2ROK1l13t", "list_id": "ta8g0gIwM-7pm", "subject": "efef", "note_html": "", "status": "notCompleted", "importance": "normal", "due_date": null, "due_has_time": 0, "reminder_date": null, "recurrence_json": null, "my_day_date": "2026-11-01", "position": 0.125, "completed_at": null, "created_at": "2026-10-31T16:35:11.734Z", "updated_at": "2026-10-31T16:35:11.734Z"}, {"id": "tnDhDfhjx8jly", "list_id": "ta8g0gIwM-7pm", "subject": "\u6d4b\u8bd53\u7194\u6cb8\u70b9\u4e2a\u98ce\u683c\u624b\u52a8\u4e2a\u68ee\u5c9b\u5e06\u9ad8\u68ee\u5c9b\u5e06\u9ad8\u624b\u52a8\u98ce\u683c\u5237\u5230\u8fc7\u624b\u52a8\u98ce\u683c\u5237\u5230\u8fc7\u68ee\u5c9b\u5e06\u9ad8\u662f", "note_html": "\u8fd9\u662f\u5df2\u5e26\u56de\u5403\u5565\u7684\u53d1\u65af\u8482\u82ac\u554a\u6c99\u53d1\u4e0a\u53d1\u65af\u8482\u82ac\u963f\u65af\u8482\u82ac\u963f\u65af\u987f\u53d1\u65af\u8482\u82ac\u963f\u65af\u8482\u82ac\u963f\u65af\u8482\u82acasf", "status": "notCompleted", "importance": "important", "due_date": "2026-11-01", "due_has_time": 0, "reminder_date": "2026-10-31T13:59:00.000Z", "recurrence_json": "{\"type\":\"daily\",\"interval\":1,\"weekdays\":null}", "my_day_date": "2026-10-31", "position": 0.25, "completed_at": null, "created_at": "2026-10-31T13:58:14.301Z", "updated_at": "2026-10-31T14:02:05.601Z"}, {"id": "tOTIVqm-VQYYl", "list_id": "ta8g0gIwM-7pm", "subject": "\u6d4b\u8bd52", "note_html": "", "status": "notCompleted", "importance": "normal", "due_date": null, "due_has_time": 0, "reminder_date": null, "recurrence_json": null, "my_day_date": "2026-10-31", "position": 0.5, "completed_at": null, "created_at": "2026-10-31T13:58:12.119Z", "updated_at": "2026-10-31T13:58:12.119Z"}, {"id": "tKBpHzJmRnT0U", "list_id": "ta8g0gIwM-7pm", "subject": "\u6d4b\u8bd51", "note_html": "", "status": "notCompleted", "importance": "normal", "due_date": null, "due_has_time": 0, "reminder_date": null, "recurrence_json": null, "my_day_date": "2026-10-31", "position": 1, "completed_at": null, "created_at": "2026-10-31T13:58:09.523Z", "updated_at": "2026-10-31T13:58:09.523Z"}]
const list = db.createList({ name: 'Tasks' })
// the fixture pins my_day_date to a fixed day — re-pin it to today so the
// my-day count stays deterministic no matter when the suite runs
const today = new Date().toLocaleDateString('sv-SE')
TASKS.forEach((t) => { t.list_id = list.id })
TASKS.forEach((t) => { if (t.my_day_date === '2026-11-01') t.my_day_date = today })
for (const t of TASKS) db.restoreTask(t)
const EXPECT = {all:8,open:7,completed:1,planned:3,myday:5,important:1}
const out = {}
for (const k of ['all', 'open', 'completed', 'planned', 'myday', 'important']) {
  out[k] = db.querySmartList(k, { include_completed: 1 }).length
}
console.log('COUNTS ' + JSON.stringify(out))
console.log('EXPECT  ' + '{"all":8,"open":7,"completed":1,"planned":3,"myday":5,"important":1}')

// assert: the exported counts must reconcile with the source data
const ok = Object.keys(EXPECT).every((k) => out[k] === EXPECT[k])
for (const k of Object.keys(EXPECT)) {
  if (out[k] !== EXPECT[k]) console.error(`MISMATCH ${k}: got ${out[k]}, expected ${EXPECT[k]}`)
}
if (!ok) { console.error('COUNTS DO NOT RECONCILE'); process.exit(1) }
console.log('OK counts reconcile')
