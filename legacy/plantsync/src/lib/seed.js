// 데모 시드 데이터 — 실제 엑셀 업로드 전에도 앱이 동작하도록 예시 프로젝트를 구성
const ASSIGNEES = ['김도현', '이상민', '박마리', '정우진', '최수영', null]

const SPEC_TABLE = {
  GT: [
    ['압축기 블레이드 점검', 'Stage 1~4 / 3000hr', 'EA', 24],
    ['연소기 노즐 정비', 'Fuel Nozzle Overhaul', 'EA', 12],
    ['터빈 베인 세정', 'Grade A Inspection', 'SET', 8],
    ['베어링 간극 측정', 'Journal / Thrust', 'EA', 6],
  ],
  ST: [
    ['증기터빈 다이어프램 점검', 'HP/IP/LP', 'EA', 16],
    ['커플링 정렬', 'Laser Alignment', 'SET', 4],
    ['글랜드 실 교체', 'Labyrinth Seal', 'EA', 20],
  ],
  HRSG: [
    ['튜브 누설 검사', 'Ultrasonic Leak Test', 'METER', 1248],
    ['헤더 용접부 검사', 'PT / MT', '개소', 64],
    ['드럼 내부 점검', 'Internal Inspection', 'EA', 3],
  ],
  DH: [
    ['열교환기 세관', 'Chemical Cleaning', 'EA', 6],
    ['지역난방 배관 보온', 'Insulation Repair', 'METER', 320],
  ],
  발전기: [
    ['고정자 절연저항 측정', 'IR / PI Test', 'EA', 3],
    ['회전자 인출 점검', 'Rotor Removal', 'SET', 1],
    ['수소냉각기 정비', 'H2 Cooler', 'EA', 4],
  ],
  전기설비: [
    ['차단기 접점 점검', '154kV GIS', 'EA', 9],
    ['변압기 절연유 시료 채취', 'DGA', 'EA', 5],
    ['전동기 베어링 교체', 'MCC 연계', 'EA', 18],
  ],
  제어설비: [
    ['DCS 카드 점검', 'I/O Module', 'EA', 42],
    ['압력 전송기 교정', 'Transmitter Calibration', 'EA', 30],
    ['제어밸브 포지셔너 정비', 'Positioner', 'EA', 21],
    ['계전기 정정 시험', 'Relay Setting', 'EA', 15],
  ],
}

const EQUIP_FIELD = {
  GT: '기계', ST: '기계', HRSG: '기계', DH: '기계',
  발전기: '전기', 전기설비: '전기',
  제어설비: '제어',
}

// 분야별 목표 진척(대시보드 예시와 유사): 기계 78%, 전기 52%, 제어 34%
const FIELD_TARGET = { 기계: 0.78, 전기: 0.52, 제어: 0.34 }

let counter = 0
function makeTask(equipment, name, spec, unit, planQty, seedIdx) {
  const field = EQUIP_FIELD[equipment]
  const target = FIELD_TARGET[field]
  // 항목별로 약간의 편차를 준다 (deterministic pseudo-random)
  const jitter = ((seedIdx * 37) % 40) / 100 - 0.2
  const ratio = Math.max(0, Math.min(1, target + jitter))
  const doneQty = Math.round(planQty * ratio)
  counter += 1
  return {
    id: `SEED-${String(counter).padStart(4, '0')}`,
    field,
    equipment,
    name,
    spec,
    unit,
    planQty,
    doneQty,
    remark: '',
    tag: `U4-${equipment}-${String(seedIdx + 1).padStart(2, '0')}`,
    sheetName: `목적물내역서(${equipment})`,
    sourceRow: 5 + seedIdx,
    issues: [],
    assignee: ASSIGNEES[seedIdx % ASSIGNEES.length],
    entries: [],
  }
}

export function buildSeedTasks() {
  counter = 0
  const tasks = []
  let idx = 0
  for (const [equip, items] of Object.entries(SPEC_TABLE)) {
    for (const [name, spec, unit, planQty] of items) {
      tasks.push(makeTask(equip, name, spec, unit, planQty, idx))
      idx += 1
    }
  }
  return tasks
}

export function buildSeedProject() {
  return {
    name: '양산복합화력 4호기',
    unit: '4호기',
    plant: '양산지사',
    startDate: '2026-06-22',
    endDate: '2026-07-17',
    today: '2026-07-07',
    source: '데모 데이터',
  }
}
