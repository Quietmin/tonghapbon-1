import { readFileSync } from 'fs'
import { analyzeWorkbook } from '../src/lib/excelParser.js'

const files = [
  '../../기초자료/3. 설계내역서(2026년도 양산지사 정기점검보수공사)-(기계, 전기분야).xlsx',
  '../../기초자료/[붙임2] 공사 설계내역서(제어분야).xlsx',
]

for (const rel of files) {
  const url = new URL(rel, import.meta.url)
  const buf = readFileSync(url)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const name = decodeURIComponent(url.pathname.split('/').pop())
  const res = await analyzeWorkbook(ab, name)
  console.log('='.repeat(70))
  console.log('FILE:', name)
  console.log('시트수:', res.sheetCount, '| 전체행:', res.totalRows, '| 추출:', res.extractedCount, '| 제외:', res.excludedCount)
  console.log('분야별:', JSON.stringify(res.byField))
  console.log('설비별:', JSON.stringify(res.byEquipment))
  console.log('확인필요:', res.needVerify.length)
  console.log('--- 샘플 작업 10건 ---')
  for (const t of res.tasks.slice(0, 10)) {
    console.log(`  [${t.field}/${t.equipment}] ${t.name} | ${t.spec} | ${t.qty}${t.unit} | 시트=${t.sheetName}`)
  }
}
