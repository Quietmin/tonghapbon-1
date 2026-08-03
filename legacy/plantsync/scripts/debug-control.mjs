import { readFileSync } from 'fs'
import * as XLSX from 'xlsx'

const url = new URL('../../기초자료/[붙임2] 공사 설계내역서(제어분야).xlsx', import.meta.url)
const buf = readFileSync(url)
const wb = XLSX.read(buf, { type: 'buffer' })
for (const sn of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' })
  console.log('\n### SHEET:', sn, '| rows:', rows.length)
  rows.slice(0, 8).forEach((r, i) => {
    console.log(i + 1, JSON.stringify(r.slice(0, 9).map((c) => (c == null ? '' : String(c).slice(0, 14)))))
  })
}
