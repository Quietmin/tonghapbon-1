import { listEquipment } from "@/shared/lib/equipment";
import { normalizeEquipmentName } from "@/shared/lib/equipmentMeta";
import {
  listAvailableYears,
  listPlanMatrix,
  type MatrixRow,
} from "@/modules/overhaul/lib/maintenanceRepo";

/**
 * 설비 단위 장기 유지보수 계획 — 계획·실적이 있는 전체 연도를 그린다.
 * 과거는 데이터가 있는 첫 해까지, 미래는 엑셀 계획의 마지막 해까지 —
 * 중장기 계획 엑셀이 2033년까지 있으면 표도 2033년까지 간다. 데이터가
 * 짧아도 최소 과거 pastYears(기본 2년) ~ 향후 futureYears(기본 4년)는 보여준다.
 *
 * 전체 현황(/overhaul/matrix)이 보수계획 1행(태그 단위)씩 펼쳐 보는 표라면,
 * 여기는 그 행들을 설비(대분류) 단위로 말아 올린 요약이다. 연도 판정은
 * listPlanMatrix의 것을 그대로 쓴다 — 실적(maintenance_record)·엑셀 계획 등급·
 * 주기 기반 예정 계산이 전체 현황과 어긋나면 안 되기 때문.
 *
 * 행은 설비 마스터(equipment) 목록에서 출발한다. 보수계획이 아직 없는 설비도
 * 빈 줄로 나온다 — 설비를 추가하면 바로 이 표에 나타나야 하니까. 반대로
 * 마스터에 없는 대분류의 계획(설비명을 바꿨거나 옛 데이터)은 표 끝에
 * "마스터 미등록" 행으로 붙여 숨지 않게 한다.
 *
 * 계획과 설비의 연결 키는 이름이다 — linkEquipment가 category(대분류)를
 * 설비명으로 upsert하므로, lower(trim(category)) == lower(trim(equipment.name)).
 */

export interface LongTermCell {
  year: number;
  /** 실적으로 확인된 항목 수 (status='done') */
  done: number;
  /** 확인 후 보수 안 함 */
  skipped: number;
  /** 엑셀 원본 계획 등급이 있는 항목 수 */
  planned: number;
  /** 주기로 계산한 예정 항목 수 */
  projected: number;
}

export interface LongTermRow {
  /** null이면 설비 마스터에 없는 계획 그룹 (마스터 미등록) */
  equipmentId: string | null;
  name: string;
  type: string | null;
  field: string | null;
  /** 딸린 보수계획 항목(태그) 수 */
  itemCount: number;
  lastDoneYear: number | null;
  cells: LongTermCell[];
}

export interface LongTermPayload {
  years: number[];
  thisYear: number;
  rows: LongTermRow[];
}

const nameKey = (s: string) => s.trim().toLowerCase();

export async function listLongTermPlan(
  branch: string,
  opts?: { pastYears?: number; futureYears?: number },
): Promise<LongTermPayload> {
  const pastYears = opts?.pastYears ?? 2;
  const futureYears = opts?.futureYears ?? 4;

  // 엑셀 계획의 마지막 해까지 미래 축을 늘린다 — 기본 4년으로 자르면
  // 중장기 계획(10년+)의 뒷부분이 표에서 통째로 사라진다.
  const nowYear = new Date().getFullYear();
  const gradeYears = await listAvailableYears(branch);
  const maxPlanYear = gradeYears.length ? gradeYears[gradeYears.length - 1] : nowYear;
  const extendedFuture = Math.max(futureYears, maxPlanYear - nowYear);

  const [equipment, matrix] = await Promise.all([
    listEquipment(branch),
    listPlanMatrix({ branch, futureYears: extendedFuture }),
  ]);

  const thisYear = matrix.thisYear;
  // 과거 축도 데이터가 있는 첫 해(matrix.years[0] = 등급·실적의 최솟값)까지 연다
  const startYear = Math.min(matrix.years[0] ?? thisYear, thisYear - pastYears);
  const years: number[] = [];
  for (let y = startYear; y <= thisYear + extendedFuture; y++) years.push(y);

  // 계획 행을 대분류(=설비명)로 묶는다 — 등록 때와 같은 규칙으로 머리 번호를 뗀다
  const groups = new Map<string, { label: string; rows: MatrixRow[] }>();
  for (const r of matrix.rows) {
    const label = (r.category ? normalizeEquipmentName(r.category) : "") || "(분류 없음)";
    const k = nameKey(label);
    const g = groups.get(k);
    if (g) g.rows.push(r);
    else groups.set(k, { label, rows: [r] });
  }

  const rollup = (
    equipmentId: string | null,
    name: string,
    type: string | null,
    field: string | null,
    members: MatrixRow[],
  ): LongTermRow => {
    const cells: LongTermCell[] = years.map((year) => {
      const cell: LongTermCell = { year, done: 0, skipped: 0, planned: 0, projected: 0 };
      for (const m of members) {
        const c = m.cells.find((x) => x.year === year);
        if (!c) continue;
        if (c.hasRecord && c.skipped) cell.skipped += 1;
        else if (c.hasRecord) cell.done += 1;
        else if (c.planned) cell.planned += 1;
        else if (c.projected) cell.projected += 1;
        // 올해 도래·기한초과(필수) 판정인데 올해 칸에 아무것도 없으면 예정으로 센다.
        // 매트릭스의 projected는 내년부터만 계산해서, 그대로 두면 보수계획 화면은
        // "필수"라는데 이 표의 올해 칸만 비어 보인다.
        else if (year === thisYear && m.judge.classification === "필수") cell.projected += 1;
      }
      return cell;
    });
    let lastDoneYear: number | null = null;
    for (const m of members) {
      if (m.lastDoneYear != null && (lastDoneYear == null || m.lastDoneYear > lastDoneYear)) {
        lastDoneYear = m.lastDoneYear;
      }
    }
    return { equipmentId, name, type, field, itemCount: members.length, lastDoneYear, cells };
  };

  const rows: LongTermRow[] = [];
  for (const e of [...equipment].sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
    const k = nameKey(e.name);
    const g = groups.get(k);
    rows.push(rollup(e.id, e.name, e.type, e.field, g?.rows ?? []));
    groups.delete(k);
  }
  // 남은 그룹 = 설비 마스터에 없는 계획 (마스터 미등록)
  for (const g of [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"))) {
    rows.push(rollup(null, g.label, null, null, g.rows));
  }

  return { years, thisYear, rows };
}
