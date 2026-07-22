// 엑셀 설계내역서 자동분석 엔진
// PRD 6.3 ~ 6.7 구현: 컬럼 자동인식, 제외행 판별, 작업항목 추출, 분야/설비 자동 분류
import * as XLSX from 'xlsx'

// 공백 제거 + 소문자화 (한글 헤더는 "품 명", "항      목" 처럼 자간 공백이 흔함)
const norm = (v) => (v == null ? '' : String(v).trim())
const squash = (v) => norm(v).toLowerCase().replace(/\s+/g, '')

// ---------------------------------------------------------------------------
// 1. 컬럼 자동 인식 사전 (PRD 6.3) — 모두 공백제거 기준으로 비교
// ---------------------------------------------------------------------------
// name 컬럼은 별도 우선순위 처리(아래 NAME_STRONG/NAME_WEAK). '항목'은 번호(색인) 컬럼
// 헤더로 자주 쓰여 실제 명칭('명칭','품명')보다 후순위로 둔다.
const COLUMN_PATTERNS = {
  spec: ['규격', 'spec', 'specification', 'range', '사양', '형식'],
  qty: ['수량', 'qty', 'quantity', "q'ty", '물량', '개소'],
  unit: ['단위', 'unit'],
  remark: ['비고', 'remark', 'note', '적요'],
  tag: ['tagno', 'tagno.', 'tagnumber', 'tag', '태그', '태그번호'],
  // 작업 시작일/종료일 (별도 두 컬럼) — 있으면 이걸 최우선으로 계획일정 사용
  planStart: ['작업시작일', '시작일', '착수일', '개시일', 'startdate'],
  planEnd: ['작업종료일', '종료일', '완료일', '완료예정일', '종료예정', 'enddate', 'finishdate'],
  // 작업 예정일 (단일 컬럼) — "2026-07-10~2026-07-15" 같은 기간
  plandate: ['작업예정일', '예정일', '작업일정', '계획일정', '공정예정', '착수예정', '일정', 'plannedstart', 'plandate', 'schedule'],
}
// 명칭 컬럼 후보 — STRONG(실제 작업명)을 WEAK(색인성 헤더)보다 우선 선택
const NAME_STRONG = ['명칭', '품명', '작업명', '작업내용', '공종', '기기명', '설비명', '대상설비', '대상기기', 'description', 'name']
const NAME_WEAK = ['항목', 'item', '공사명', '내용']
const AMOUNT_KEYWORDS = ['금액', '단가', '재료비', '노무비', '경비', '합계', 'amount', 'price', '구성비', '산식', '적용율']

// ---------------------------------------------------------------------------
// 2. 제외 대상 (PRD 6.4) — 시트 단위 / 행 단위
// ---------------------------------------------------------------------------
// 원가·집계·요약 성격의 시트는 통째로 제외 (작업항목이 아님)
const SKIP_SHEET_KEYWORDS = [
  '표지', '갑지', '원가계산', '공사비집계', '비목별', '일위대가', '제비율', '적용노임', '노임단가',
  '기타경비', '총괄', '대비표', '경비적용', '내역총괄', '단가산출', '단가비교', '중기사용',
]
const EXCLUDE_NAME_KEYWORDS = [
  '소계', '합계', '총계', '누계', '직접비', '간접비', '재료비', '노무비', '경비', '순공사비', '총공사비',
  '공사비', '제비율', '일반관리비', '이윤', '부가가치세', '부가세', '원가계산', '제경비', '설계내역서',
  '내역서', '산출내역', '집계표', '원가계산서', '산업안전보건관리비', '산재보험료', '고용보험료',
  '건강보험료', '연금보험료', '기타경비', '안전관리비', '환경보전비', '퇴직공제부금',
]
const HEADER_CELL_KEYWORDS = ['명칭', '품명', '규격', '수량', '단위', '금액', '단가', '비고', '항목', '단위', 'unit', 'qty', 'spec', 'tagno', '대상설비', 'range']

// ---------------------------------------------------------------------------
// 3. 분야 자동 분류 (PRD 6.6)
// ---------------------------------------------------------------------------
const FIELD_KEYWORDS = {
  제어: ['dcs', 'plc', 'transmitter', '트랜스미터', 'tagno', '계측', '전송기', '제어밸브', 'positioner', '포지셔너', '제어반', '지시계', '기록계', 'fgss', '제어', '계장', 'pit-', 'tit-', 'lt-', 'ft-'],
  전기: ['발전기', 'generator', '변압기', 'transformer', '차단기', 'breaker', 'mcc', '전동기', 'motor', '절연', '계전기', 'relay', '수배전', '배터리', 'battery', '충전기', '축전지', '전기'],
  기계: ['gt', 'gasturbine', '가스터빈', 'st', 'steamturbine', '증기터빈', 'hrsg', '배열회수', 'dh', '지역난방', '열공급', '펌프', 'pump', '밸브', 'valve', '배관', 'pipe', '터빈', 'turbine', '보일러', 'boiler', 'tube', '열교환', '비계', '기계'],
}
// 설비→분야 매핑 (설비가 잡히면 분야는 이걸 우선)
const EQUIP_TO_FIELD = {
  GT: '기계', ST: '기계', HRSG: '기계', DH: '기계', '펌프/밸브': '기계', 배관: '기계', 비계: '기계',
  발전기: '전기', 전기설비: '전기', 제어설비: '제어',
}

// ---------------------------------------------------------------------------
// 4. 설비 자동 분류 (PRD 6.7)
// ---------------------------------------------------------------------------
const EQUIPMENT_RULES = [
  { equipment: 'GT', keywords: ['gt', 'gasturbine', '가스터빈'] },
  { equipment: 'ST', keywords: ['st', 'steamturbine', '증기터빈'] },
  { equipment: 'HRSG', keywords: ['hrsg', '배열회수'] },
  { equipment: 'DH', keywords: ['dh', '지역난방', '열공급'] },
  { equipment: '발전기', keywords: ['generator', '발전기'] },
  { equipment: '전기설비', keywords: ['차단기', '변압기', 'mcc', '전동기', 'breaker', 'transformer', 'motor', '수배전'] },
  { equipment: '제어설비', keywords: ['dcs', 'plc', 'transmitter', '계측', '제어밸브', '전송기', 'positioner', 'fgss', '계장', 'pit-', 'tit-'] },
  { equipment: '펌프/밸브', keywords: ['펌프', 'pump', '밸브', 'valve'] },
  { equipment: '배관', keywords: ['배관', 'pipe', 'tube'] },
  { equipment: '비계', keywords: ['비계', '가설'] },
]

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function sheetHint(sheetName) {
  const m = sheetName.match(/\(([^)]+)\)/)
  return m ? m[1] : sheetName
}

function classifyEquipment(texts) {
  const joined = texts.map(squash).join(' ')
  for (const rule of EQUIPMENT_RULES) {
    if (rule.keywords.some((k) => joined.includes(k))) return rule.equipment
  }
  return null
}

function classifyField(equipment, texts) {
  if (equipment && EQUIP_TO_FIELD[equipment]) return EQUIP_TO_FIELD[equipment]
  const joined = texts.map(squash).join(' ')
  for (const field of ['제어', '전기', '기계']) {
    if (FIELD_KEYWORDS[field].some((k) => joined.includes(k))) return field
  }
  return null
}

// 작업 예정일 파싱 — "2026-07-10~2026-07-15", "2026.7.5", 단일일자, 엑셀 날짜 일련번호 지원
const pad2 = (n) => String(n).padStart(2, '0')
const RE_DATE = /(\d{4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})/g
function excelSerialToYMD(n) {
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}
function parsePlanDates(cell) {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number') {
    return cell > 30000 && cell < 80000 ? { start: excelSerialToYMD(cell), end: null } : null
  }
  const s = String(cell)
  const found = []
  let m
  RE_DATE.lastIndex = 0
  while ((m = RE_DATE.exec(s)) !== null) found.push(`${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`)
  if (!found.length) return null
  return { start: found[0], end: found.length > 1 ? found[found.length - 1] : null }
}
// 단일 셀 → 하나의 날짜(YYYY-MM-DD). 엑셀 날짜 일련번호 또는 날짜 문자열 지원
function parseOneDate(cell) {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number') return cell > 30000 && cell < 80000 ? excelSerialToYMD(cell) : null
  const m = String(cell).match(/(\d{4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})/)
  return m ? `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` : null
}

function parseQty(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const cleaned = String(v).replace(/[,\s]/g, '')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const isPureNumber = (v) => /^\d+(\.\d+)?$/.test(norm(v))

// 색인(번호) 토큰 판별 — 명칭이 아니라 항목 번호인 셀을 걸러낸다.
// 예: "1", "1-1", "1.2", "Ⅰ", "Ⅰ-1", "Ⅱ-11", "I-1", "II-3", "①", "가", "(1)"
const RE_INDEX = [
  /^\d+([.\-]\d+)*$/, // 1, 1-1, 1.2.3
  /^[Ⅰ-Ⅻⅰ-ⅻ]+([.\-]\s*\d+)?$/, // 유니코드 로마숫자 (± -숫자)
  /^[IVXLCDM]{1,5}[-.．]\s*\d*$/i, // ASCII 로마숫자 + 구분자 (I-1, II-3) — 구분자 필수라 'Inlet' 등은 제외
  /^[①-⑳㉑-㉟➀-➓]+$/, // 원문자
  /^[가-힣]$/, // 단일 한글 (가, 나, 다)
  /^\(?\d+\)?$/, // (1)
]
function isIndexToken(v) {
  const s = norm(v)
  if (!s || s.length > 12) return false
  return RE_INDEX.some((re) => re.test(s))
}

function headerScore(row) {
  let score = 0
  for (const cell of row) {
    const t = squash(cell)
    if (!t) continue
    if (HEADER_CELL_KEYWORDS.some((k) => t === k || t.includes(k))) score += 1
  }
  return score
}

function mapColumns(headerRow) {
  const map = {}
  headerRow.forEach((cell, idx) => {
    const t = squash(cell)
    if (!t) return
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      if (map[field] != null) continue
      if (patterns.some((p) => t === p || t.includes(p))) {
        map[field] = idx
        break
      }
    }
  })
  // 명칭 컬럼: STRONG 우선(rank 0..), 없으면 WEAK(rank 100..). 같은 순위면 왼쪽 우선.
  let nameIdx = null
  let nameRank = Infinity
  headerRow.forEach((cell, idx) => {
    const t = squash(cell)
    if (!t || AMOUNT_KEYWORDS.some((a) => t.includes(a))) return
    let rank = Infinity
    const si = NAME_STRONG.findIndex((p) => t === p || t.includes(p))
    if (si !== -1) rank = si
    else {
      const wi = NAME_WEAK.findIndex((p) => t === p || t.includes(p))
      if (wi !== -1) rank = 100 + wi
    }
    if (rank < nameRank) {
      nameRank = rank
      nameIdx = idx
    }
  })
  if (nameIdx != null) map.name = nameIdx
  return map
}

// 명칭 셀이 번호(색인)/공백이면 오른쪽에서 첫 텍스트 셀을 명칭으로 대체
// (번호열이 명칭 앞/병합셀에 오는 내역서 대응 — 예: "항목"열에 Ⅰ-1, 실제 명칭은 옆 칸)
// 헤더 후보 행에 명칭류 컬럼이 있는지 — 단가/금액만 있는 2행 헤더의 하위행을 헤더로 오인하지 않도록
function hasNameHeader(row) {
  return row.some((c) => {
    const t = squash(c)
    if (!t) return false
    return NAME_STRONG.some((p) => t === p || t.includes(p)) || NAME_WEAK.some((p) => t === p || t.includes(p))
  })
}

function resolveName(row, colMap) {
  const raw = norm(row[colMap.name])
  if (raw && !isIndexToken(raw)) return raw
  const used = new Set([colMap.qty, colMap.unit, colMap.spec, colMap.tag, colMap.remark])
  for (let i = (colMap.name ?? 0); i < row.length; i++) {
    if (used.has(i)) continue
    const v = norm(row[i])
    if (v && !isIndexToken(v) && !AMOUNT_KEYWORDS.some((a) => squash(v).includes(a))) return v
  }
  return raw
}

function isExcludedRow(name, qty, unit, allText) {
  if (!name) return { excluded: true }
  const n = squash(name)
  // 노트/수식/기준 설명 행
  if (/^[*※•\-=]/.test(norm(name)) || n.includes('산출기준') || n.includes('면적=') || n.startsWith('=')) {
    return { excluded: true }
  }
  for (const kw of EXCLUDE_NAME_KEYWORDS) {
    const k = squash(kw)
    if (n === k || n.startsWith(k)) return { excluded: true }
  }
  // 수량·단위가 모두 없는 행은 작업항목이 아님 (PRD 6.5)
  if (qty == null && !unit) return { excluded: true }
  // 금액만 있는 행
  if (qty == null && !unit && AMOUNT_KEYWORDS.some((a) => allText.includes(a))) return { excluded: true }
  return { excluded: false }
}

function analyzeSheet(sheetName, rows, fileName) {
  const result = { tasks: [], excludedCount: 0 }
  if (!rows.length) return result
  // 시트 단위 제외
  if (SKIP_SHEET_KEYWORDS.some((k) => squash(sheetName).includes(squash(k)))) return result

  let headerIdx = -1
  let best = 0
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const s = headerScore(rows[i])
    // 명칭류 컬럼이 있는 행만 헤더 후보 (단가/금액 반복 하위행이 점수만 높아 오선택되는 것 방지)
    if (s >= 2 && s > best && hasNameHeader(rows[i])) {
      best = s
      headerIdx = i
    }
  }
  if (headerIdx === -1) return result

  const colMap = mapColumns(rows[headerIdx])
  if (colMap.name == null) return result

  const hint = sheetHint(sheetName)

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const name = resolveName(row, colMap)
    const spec = colMap.spec != null ? norm(row[colMap.spec]) : ''
    const unit = colMap.unit != null ? norm(row[colMap.unit]) : ''
    const qty = colMap.qty != null ? parseQty(row[colMap.qty]) : null
    const remark = colMap.remark != null ? norm(row[colMap.remark]) : ''
    const tag = colMap.tag != null ? norm(row[colMap.tag]) : ''
    // 계획일정: ① 시작일/종료일 별도 컬럼 → ② 단일 예정일 컬럼(기간)
    const psCol = colMap.planStart != null ? parseOneDate(row[colMap.planStart]) : null
    const peCol = colMap.planEnd != null ? parseOneDate(row[colMap.planEnd]) : null
    const plan =
      psCol || peCol
        ? { start: psCol || peCol, end: peCol || psCol }
        : colMap.plandate != null
        ? parsePlanDates(row[colMap.plandate])
        : null
    const allText = row.map(squash).join(' ')

    const ex = isExcludedRow(name, qty, unit, allText)
    if (ex.excluded) {
      if (name || allText.trim()) result.excludedCount += 1
      continue
    }

    const equipment = classifyEquipment([hint, name, spec, tag]) || (EQUIP_TO_FIELD[hint] ? hint : null)
    const field = classifyField(equipment, [hint, name, spec, tag, fileName])

    const issues = []
    if (qty == null) issues.push('수량 불명확')
    if (!unit) issues.push('단위 없음')
    if (!field) issues.push('분야 분류 불가')

    result.tasks.push({
      field: field || '미분류',
      equipment: equipment || '기타',
      name,
      spec,
      qty: qty == null ? 0 : qty,
      planQty: qty == null ? 0 : qty,
      unit: unit || 'EA',
      remark,
      tag,
      planStart: plan?.start || null,
      planEnd: plan?.end || null,
      sheetName,
      sourceRow: r + 1,
      issues,
    })
  }
  return result
}

// 동일 작업(명칭+규격+단위) 중복 제거 — 집계/산출 시트에 같은 항목이 반복될 수 있음
function dedupe(tasks) {
  const seen = new Map()
  const out = []
  for (const t of tasks) {
    const key = `${squash(t.name)}|${squash(t.spec)}|${squash(t.unit)}`
    if (seen.has(key)) {
      // 더 정보가 많은(수량 있는) 항목으로 갱신
      const prev = out[seen.get(key)]
      if (prev.qty === 0 && t.qty > 0) out[seen.get(key)] = t
      // 예정일은 어느 한 쪽에만 있을 수 있으니 보존
      const keep = out[seen.get(key)]
      if (!keep.planStart && t.planStart) {
        keep.planStart = t.planStart
        keep.planEnd = t.planEnd
      }
      continue
    }
    seen.set(key, out.length)
    out.push(t)
  }
  return out
}

export async function analyzeWorkbook(arrayBuffer, fileName) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  let allTasks = []
  let totalRows = 0
  let excludedCount = 0

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
    totalRows += rows.length
    const res = analyzeSheet(sheetName, rows, fileName)
    excludedCount += res.excludedCount
    allTasks.push(...res.tasks)
  }

  allTasks = dedupe(allTasks)
  const prefix = fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z가-힣]/g, '').slice(0, 3).toUpperCase()
  allTasks.forEach((t, i) => (t.id = `${prefix || 'T'}-${String(i + 1).padStart(4, '0')}`))

  return buildAnalysisResult(fileName, wb.SheetNames, totalRows, excludedCount, allTasks)
}

export function buildAnalysisResult(fileName, sheetNames, totalRows, excludedCount, tasks) {
  const byField = {}
  const byEquipment = {}
  for (const t of tasks) {
    byField[t.field] = (byField[t.field] || 0) + 1
    byEquipment[t.equipment] = (byEquipment[t.equipment] || 0) + 1
  }
  return {
    fileName,
    sheetCount: sheetNames.length,
    totalRows,
    extractedCount: tasks.length,
    excludedCount,
    byField,
    byEquipment,
    needVerify: tasks.filter((t) => t.issues && t.issues.length),
    tasks,
  }
}
