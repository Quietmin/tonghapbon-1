import { query, queryOne, execute, transaction } from "@/shared/lib/db";
import { ensureEquipments } from "@/shared/lib/equipment";
import { parseCycle, type ParsedPlanItem, type ParsedCycle } from "./maintenancePlanParser";
import { detectGradePattern } from "./gradePattern";
import { judge, isOverhaulScope, type Classification, type JudgeResult } from "./maintenanceJudge";

/**
 * 중장기 보수계획의 DB 접근 계층.
 * 화면과 API Route는 여기만 부르고 SQL을 직접 쓰지 않는다.
 */

export interface PlanSource {
  id: string;
  file_name: string;
  field: string | null;
  sheet_count: number;
  item_count: number;
  uploaded_at: string;
}

export interface PlanRow {
  id: string;
  category: string | null;
  sub_category: string | null;
  name: string;
  tag_no: string | null;
  maker: string | null;
  spec: string | null;
  field: string | null;
  cycle_raw: string | null;
  cycle_years: number | null;
  cycle_kind: string;
  cycle_options: number[] | null;
  patrol_cycle: string | null;
  method: string | null;
  completion: string | null;
  last_done_year: number | null;
  sheet_name: string | null;
  /** maintenance_record에 실적이 있으면 그 최근 연도 (없으면 null) */
  recorded_year: number | null;
}

/** 판정 결과가 붙은 계획 행 — 화면이 그대로 쓴다 */
export interface JudgedPlanRow extends PlanRow {
  judge: JudgeResult;
  /** O/H 여부 — 수량산출서 대상인지 */
  isOverhaul: boolean;
  /** 엑셀 원본에 그 연도 등급이 있었으면 표시 (참고용) */
  plannedGrade: string | null;
}

export async function saveParsedPlan(params: {
  fileName: string;
  field: string | null;
  sheetCount: number;
  items: ParsedPlanItem[];
}): Promise<{ sourceId: string; itemCount: number }> {
  const { fileName, field, sheetCount, items } = params;

  const source = await queryOne<{ id: string }>(
    `insert into maintenance_plan_source (file_name, field, sheet_count, item_count)
     values ($1, $2, $3, $4) returning id`,
    [fileName, field, sheetCount, items.length],
  );
  if (!source) throw new Error("업로드 이력을 저장하지 못했습니다.");

  // 설비 마스터에도 반영 — 대분류를 설비명으로 쓴다.
  // (계획 엑셀의 "기기명"은 개별 태그 단위라 설비 마스터의 단위와 다르다.
  //  세 모듈이 공유하는 설비 마스터에는 대분류 수준으로 올려둔다.)
  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))];
  const equipMap = await ensureEquipments(
    categories.map((c) => ({ name: c, field: field ?? undefined })),
  );

  // 639건을 한 건씩 INSERT하면 왕복이 그만큼 쌓여 25초가 걸렸다.
  // 여러 행을 한 문장으로 묶어 보내 왕복 수를 줄인다.
  const CHUNK = 100;
  const PLAN_COLS = 19;

  for (let start = 0; start < items.length; start += CHUNK) {
    const chunk = items.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    chunk.forEach((it, i) => {
      const base = i * PLAN_COLS;
      placeholders.push(
        `(${Array.from({ length: PLAN_COLS }, (_, k) => `$${base + k + 1}`).join(",")})`,
      );
      values.push(
        source.id,
        it.category ? (equipMap.get(it.category.trim().toLowerCase()) ?? null) : null,
        it.category,
        it.subCategory,
        it.name,
        it.tagNo,
        it.maker,
        it.spec,
        field,
        it.cycleRaw,
        it.cycle.kind === "fixed" ? (it.cycle.years ?? null) : null,
        it.cycle.kind,
        it.cycle.kind === "ambiguous" ? (it.cycle.options ?? null) : null,
        it.patrolCycle,
        it.method,
        it.completion,
        it.lastDoneYear,
        it.sheetName,
        it.rowIndex,
      );
    });

    // returning id 순서는 values 순서와 같으므로 chunk와 1:1로 짝지을 수 있다
    const inserted = await query<{ id: string }>(
      `insert into maintenance_plan
         (source_id, equipment_id, category, sub_category, name, tag_no, maker, spec, field,
          cycle_raw, cycle_years, cycle_kind, cycle_options, patrol_cycle, method, completion,
          last_done_year, sheet_name, row_index)
       values ${placeholders.join(",")}
       returning id`,
      values,
    );

    // 등급도 같은 방식으로 한 번에 넣는다
    const gVals: unknown[] = [];
    const gPh: string[] = [];
    inserted.forEach((row, i) => {
      for (const g of chunk[i].grades) {
        const base = gVals.length;
        gPh.push(`($${base + 1},$${base + 2},$${base + 3})`);
        gVals.push(row.id, g.year, g.grade);
      }
    });
    if (gPh.length) {
      await execute(
        `insert into maintenance_plan_grade (plan_id, year, grade) values ${gPh.join(",")}
         on conflict (plan_id, year) do update set grade = excluded.grade`,
        gVals,
      );
    }
  }

  return { sourceId: source.id, itemCount: items.length };
}

export async function listPlanSources(): Promise<PlanSource[]> {
  return query<PlanSource>(
    `select id, file_name, field, sheet_count, item_count, uploaded_at::text
       from maintenance_plan_source order by uploaded_at desc`,
  );
}

export async function deletePlanSource(sourceId: string): Promise<number> {
  return execute(`delete from maintenance_plan_source where id = $1`, [sourceId]);
}

// ---------------------------------------------------------------------------
// 설비 추가 · 수정 · 사용중지
//
// 엑셀에 없던 설비를 손으로 넣거나, 이미 있는 행을 고치거나, 폐기·교체된
// 설비를 목록에서 뺀다. 지우지는 않는다 — 지우면 그 설비의 보수 이력
// (maintenance_plan_grade · maintenance_record)이 cascade로 같이 사라지기
// 때문이다. 사용중지는 is_active만 내리고 이력은 그대로 둔다.
// ---------------------------------------------------------------------------

export interface PlanItemInput {
  category?: string | null;
  subCategory?: string | null;
  name: string;
  tagNo?: string | null;
  maker?: string | null;
  spec?: string | null;
  field?: string | null;
  /** 정밀점검주기 원문 — "2년", "필요시" 등. 저장 시 parseCycle로 다시 해석한다 */
  cycleRaw?: string | null;
  method?: string | null;
  completion?: string | null;
}

async function linkEquipment(category: string | null | undefined, field: string | null | undefined) {
  const name = category?.trim();
  if (!name) return null;
  const { ensureEquipment } = await import("@/shared/lib/equipment");
  return ensureEquipment({ name, field: field ?? undefined });
}

export async function createManualPlanItem(input: PlanItemInput): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("기기명을 입력하세요.");

  const equipmentId = await linkEquipment(input.category, input.field);
  const cycle = parseCycle(input.cycleRaw ?? null);

  const row = await queryOne<{ id: string }>(
    `insert into maintenance_plan
       (source_id, equipment_id, category, sub_category, name, tag_no, maker, spec, field,
        cycle_raw, cycle_years, cycle_kind, cycle_options, method, completion, is_active)
     values (null, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
     returning id`,
    [
      equipmentId,
      input.category ?? null,
      input.subCategory ?? null,
      name,
      input.tagNo ?? null,
      input.maker ?? null,
      input.spec ?? null,
      input.field ?? null,
      input.cycleRaw ?? null,
      cycle.kind === "fixed" ? (cycle.years ?? null) : null,
      cycle.kind,
      cycle.kind === "ambiguous" ? (cycle.options ?? null) : null,
      input.method ?? null,
      input.completion ?? null,
    ],
  );
  if (!row) throw new Error("설비를 추가하지 못했습니다.");
  return { id: row.id };
}

export async function updatePlanItem(id: string, patch: PlanItemInput): Promise<void> {
  const name = patch.name?.trim();
  if (!name) throw new Error("기기명을 입력하세요.");

  const equipmentId = await linkEquipment(patch.category, patch.field);
  const cycle = parseCycle(patch.cycleRaw ?? null);

  await execute(
    `update maintenance_plan
        set equipment_id = coalesce($1, equipment_id),
            category = $2, sub_category = $3, name = $4, tag_no = $5, maker = $6, spec = $7,
            field = $8, cycle_raw = $9, cycle_years = $10, cycle_kind = $11, cycle_options = $12,
            method = $13, completion = $14
      where id = $15`,
    [
      equipmentId,
      patch.category ?? null,
      patch.subCategory ?? null,
      name,
      patch.tagNo ?? null,
      patch.maker ?? null,
      patch.spec ?? null,
      patch.field ?? null,
      patch.cycleRaw ?? null,
      cycle.kind === "fixed" ? (cycle.years ?? null) : null,
      cycle.kind,
      cycle.kind === "ambiguous" ? (cycle.options ?? null) : null,
      patch.method ?? null,
      patch.completion ?? null,
      id,
    ],
  );
}

export async function setPlanItemActive(id: string, isActive: boolean): Promise<void> {
  await execute(`update maintenance_plan set is_active = $1 where id = $2`, [isActive, id]);
}

/**
 * 특정 연도 기준으로 전체 계획을 판정해서 돌려준다. 사용중지된 설비는 뺀다.
 *
 * 마지막 보수연도는 실적(maintenance_record)이 있으면 그것을 우선하고,
 * 없으면 최초 업로드 시 엑셀에서 역산한 값을 쓴다. 그래서 오버홀이 끝나고
 * 실적만 남기면 다음 회차 판정이 자동으로 갱신된다.
 */
export async function listJudgedPlans(targetYear: number): Promise<JudgedPlanRow[]> {
  const rows = await query<PlanRow & { planned_grade: string | null }>(
    `select p.id, p.category, p.sub_category, p.name, p.tag_no, p.maker, p.spec, p.field,
            p.cycle_raw, p.cycle_years, p.cycle_kind, p.cycle_options,
            p.patrol_cycle, p.method, p.completion, p.last_done_year, p.sheet_name,
            (select max(r.done_year) from maintenance_record r
              where r.plan_id = p.id and r.done_year < $1 and r.status = 'done') as recorded_year,
            (select g.grade from maintenance_plan_grade g
              where g.plan_id = p.id and g.year = $1) as planned_grade
       from maintenance_plan p
      where p.is_active
      order by p.sheet_name, p.row_index`,
    [targetYear],
  );

  return rows.map((r) => {
    // 실적이 있으면 실적을 신뢰, 없으면 엑셀 역산값
    const lastDoneYear = r.recorded_year ?? r.last_done_year;
    const cycle =
      r.cycle_kind === "fixed"
        ? ({ kind: "fixed" as const, years: r.cycle_years ?? undefined, raw: r.cycle_raw ?? "" })
        : r.cycle_kind === "ambiguous"
          ? ({ kind: "ambiguous" as const, options: r.cycle_options ?? [], raw: r.cycle_raw ?? "" })
          : r.cycle_kind === "asneeded"
            ? ({ kind: "asneeded" as const, raw: r.cycle_raw ?? "" })
            : ({ kind: "none" as const, raw: r.cycle_raw ?? "" });

    return {
      ...r,
      judge: judge({ cycle, lastDoneYear }, targetYear),
      isOverhaul: isOverhaulScope(r.method),
      plannedGrade: r.planned_grade,
    };
  });
}

export interface PlanSummary {
  total: number;
  byClassification: Record<Classification, number>;
  /** O/H만 따로 — 실제 수량산출서 대상 */
  overhaulByClassification: Record<Classification, number>;
  /** O/H가 아닌 시행방법별 건수 (참고 표시용) */
  nonOverhaulByMethod: Record<string, number>;
  needsDecisionCount: number;
}

export function summarize(rows: JudgedPlanRow[]): PlanSummary {
  const empty = (): Record<Classification, number> => ({ 필수: 0, 선택: 0, 불필요: 0 });
  const s: PlanSummary = {
    total: rows.length,
    byClassification: empty(),
    overhaulByClassification: empty(),
    nonOverhaulByMethod: {},
    needsDecisionCount: 0,
  };
  for (const r of rows) {
    s.byClassification[r.judge.classification]++;
    if (r.isOverhaul) s.overhaulByClassification[r.judge.classification]++;
    else {
      const m = r.method || "(미지정)";
      s.nonOverhaulByMethod[m] = (s.nonOverhaulByMethod[m] || 0) + 1;
    }
    if (r.judge.needsDecision) s.needsDecisionCount++;
  }
  return s;
}

/** 계획에 등록된 연도 범위 — 화면의 연도 선택 목록용 */
export async function listAvailableYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    `select distinct year from maintenance_plan_grade order by year`,
  );
  return rows.map((r) => r.year);
}

// ---------------------------------------------------------------------------
// 전체 현황 (장기 추적)
//
// 특정 한 해를 판정하는 listJudgedPlans와 달리, 전체 설비를 한 장에 놓고
// "언제 보수했고 · 주기가 몇 년이고 · 다음은 언제인지"를 연도 축으로 보여준다.
// 과거는 데이터가 있는 첫 해부터 전부, 미래는 기본 5년까지만 본다.
// 실적이 쌓이면 과거 구간이 그만큼 길어지므로 30년 이상 추적이 된다.
// ---------------------------------------------------------------------------

/** 표의 한 칸 — 계획과 실적을 겹쳐서 담는다 */
export interface MatrixCell {
  year: number;
  /** 그 해 계획 등급 (엑셀 원본에 적혀 있던 A/B/C) */
  planned: string | null;
  /** 그 해 실적 등급 — 실제로 보수한 기록 */
  done: string | null;
  /** 실적 레코드가 있는지 (실제로 했든, 확인 후 안 했든) */
  hasRecord: boolean;
  /** 계약변경 등으로 확인 후 보수하지 않은 해 — hasRecord와 함께 본다 */
  skipped: boolean;
  /** 주기로 계산한 보수 예정 연도인지 (미래 칸에만 의미가 있다) */
  projected: boolean;
  /**
   * 과거 등급이 반복되는 패턴으로 확인될 때만 채워지는 추정 등급.
   * 패턴이 불확실하면 null — 화면에서 "확인 필요"로 남는다.
   */
  estimatedGrade: string | null;
}

export interface MatrixRow {
  id: string;
  category: string | null;
  sub_category: string | null;
  name: string;
  tag_no: string | null;
  maker: string | null;
  spec: string | null;
  field: string | null;
  method: string | null;
  completion: string | null;
  cycle_raw: string | null;
  cycle_years: number | null;
  cycle_kind: string;
  cycle_options: number[] | null;
  isOverhaul: boolean;
  isActive: boolean;
  /** 마지막으로 보수한 해 (실적·과거 계획 중 가장 최근) */
  lastDoneYear: number | null;
  /** 그중 실적으로 확인된 해 — 없으면 엑셀 계획에서만 온 것이다 */
  lastRecordYear: number | null;
  /** 보수한 횟수 (계획·실적 합쳐 중복 없이) */
  doneCount: number;
  judge: JudgeResult;
  cells: MatrixCell[];
}

export interface MatrixPayload {
  /** 표의 연도 축 — 과거 첫 해부터 올해+futureYears까지 */
  years: number[];
  thisYear: number;
  /** 이 해부터가 미래 구간 (= thisYear + 1) */
  futureFrom: number;
  rows: MatrixRow[];
  summary: {
    total: number;
    /** 올해 도래 또는 기한 초과 */
    dueNow: number;
    overdue: number;
    /** 주기가 애매하거나 이력이 없어 사람이 봐야 하는 건 */
    needsDecision: number;
    /** 보수 이력이 하나도 없는 건 */
    noHistory: number;
  };
}

export async function listPlanMatrix(opts?: {
  thisYear?: number;
  futureYears?: number;
  /** 사용중지된 설비도 함께 보여줄지 — 기본은 뺀다 */
  includeInactive?: boolean;
}): Promise<MatrixPayload> {
  const thisYear = opts?.thisYear ?? new Date().getFullYear();
  const futureYears = opts?.futureYears ?? 5;

  const plans = await query<
    Omit<PlanRow, "recorded_year"> & {
      completion: string | null;
      sheet_name: string | null;
      is_active: boolean;
    }
  >(
    `select p.id, p.category, p.sub_category, p.name, p.tag_no, p.maker, p.spec, p.field,
            p.cycle_raw, p.cycle_years, p.cycle_kind, p.cycle_options,
            p.patrol_cycle, p.method, p.completion, p.last_done_year, p.sheet_name, p.is_active
       from maintenance_plan p
      ${opts?.includeInactive ? "" : "where p.is_active"}
      order by p.sheet_name, p.row_index`,
  );

  // 등급·실적은 건별로 부르면 왕복이 639번이 된다. 통째로 받아 메모리에서 묶는다.
  const grades = await query<{ plan_id: string; year: number; grade: string }>(
    `select plan_id, year, grade from maintenance_plan_grade`,
  );
  const records = await query<{
    plan_id: string;
    done_year: number;
    grade: string | null;
    status: "done" | "skipped";
  }>(`select plan_id, done_year, grade, status from maintenance_record`);

  const gradeBy = new Map<string, Map<number, string>>();
  for (const g of grades) {
    let m = gradeBy.get(g.plan_id);
    if (!m) gradeBy.set(g.plan_id, (m = new Map()));
    m.set(g.year, g.grade);
  }
  const recordBy = new Map<string, Map<number, { grade: string | null; status: "done" | "skipped" }>>();
  for (const r of records) {
    let m = recordBy.get(r.plan_id);
    if (!m) recordBy.set(r.plan_id, (m = new Map()));
    m.set(r.done_year, { grade: r.grade, status: r.status });
  }

  // 연도 축 — 데이터가 있는 가장 이른 해부터 올해+5년까지
  let minYear = thisYear;
  for (const g of grades) if (g.year < minYear) minYear = g.year;
  for (const r of records) if (r.done_year < minYear) minYear = r.done_year;
  const lastYear = thisYear + futureYears;
  const years: number[] = [];
  for (let y = minYear; y <= lastYear; y++) years.push(y);

  const summary = { total: plans.length, dueNow: 0, overdue: 0, needsDecision: 0, noHistory: 0 };

  const rows: MatrixRow[] = plans.map((p) => {
    const gm = gradeBy.get(p.id) ?? new Map<number, string>();
    const rm = recordBy.get(p.id) ?? new Map<number, { grade: string | null; status: "done" | "skipped" }>();

    // 마지막 보수연도 계산에서 계획과 실적의 기준 연도가 다르다.
    //   실적: 올해 것도 포함한다 (이미 한 일이므로 다음 주기의 출발점이 된다). skipped는
    //         "확인은 했지만 안 했다"는 뜻이라 보수로 세지 않는다 — 다음 주기 계산에서 뺀다.
    //   계획: 올해 것은 제외한다 (올해 A가 찍혀 있는 건 "올해 할 계획"이지 한 게 아니다)
    // 이 구분이 없으면 올해 도래한 설비가 "이미 했음"으로 밀려 판정에서 사라진다.
    const recordYears = [...rm.entries()]
      .filter(([y, v]) => y <= thisYear && v.status === "done")
      .map(([y]) => y);
    const plannedPast = [...gm.keys()].filter((y) => y < thisYear);
    const lastRecordYear = recordYears.length ? Math.max(...recordYears) : null;
    const lastPlannedYear = plannedPast.length ? Math.max(...plannedPast) : null;
    const lastDoneYear =
      lastRecordYear != null && lastPlannedYear != null
        ? Math.max(lastRecordYear, lastPlannedYear)
        : (lastRecordYear ?? lastPlannedYear);

    const cycle: ParsedCycle =
      p.cycle_kind === "fixed"
        ? { kind: "fixed", years: p.cycle_years ?? undefined, raw: p.cycle_raw ?? "" }
        : p.cycle_kind === "ambiguous"
          ? { kind: "ambiguous", options: p.cycle_options ?? [], raw: p.cycle_raw ?? "" }
          : p.cycle_kind === "asneeded"
            ? { kind: "asneeded", raw: p.cycle_raw ?? "" }
            : { kind: "none", raw: p.cycle_raw ?? "" };

    const j = judge({ cycle, lastDoneYear }, thisYear);

    // 미래 예정 연도 — 다음 도래해부터 주기만큼 반복해서 표 끝까지 찍는다.
    // (여기서는 "이 해에 해야 한다"만 표시한다. 등급 추정은 아래에서 따로 한다)
    const projected = new Set<number>();
    if (cycle.kind === "fixed" && cycle.years && cycle.years > 0 && j.nextDueYear != null) {
      for (let y = Math.max(j.nextDueYear, thisYear + 1); y <= lastYear; y += cycle.years) {
        projected.add(y);
      }
    }

    // 미래 등급 추정 — 실제 보수가 있었던 연도만 시간순으로 뽑아 반복 패턴을 찾는다.
    // (레코드가 있으면 계획보다 실적을 신뢰한다) 패턴이 확인되면, 엑셀에도 없는
    // 순수 미래 구간(마지막으로 알려진 연도 이후)만 그 패턴을 이어 채운다.
    // 엑셀 범위 안의 빈 해(스킵 연도)는 건드리지 않는다 — 그건 추정이 아니라 과거 기록이다.
    const knownYears = [...new Set([...gm.keys(), ...rm.keys()])].sort((a, b) => a - b);
    const seqGrades: string[] = [];
    let lastKnownYear: number | null = null;
    for (const y of knownYears) {
      const rec = rm.get(y);
      // skipped는 "그 해에 등급이 없었다"가 아니라 "안 하기로 확인됐다"라 패턴에서 뺀다
      const g = rec ? (rec.status === "done" ? rec.grade : null) : gm.get(y) ?? null;
      if (g) {
        seqGrades.push(g);
        lastKnownYear = y;
      }
    }
    const pattern = detectGradePattern(seqGrades);
    const estimatedByYear = new Map<number, string>();
    if (pattern && lastKnownYear != null) {
      // 레코드(실적이든 skip이든)가 이미 있는 해는 추정을 겹쳐 씌우지 않는다
      const beyond = [...projected]
        .filter((y) => y > lastKnownYear! && !rm.has(y))
        .sort((a, b) => a - b);
      beyond.forEach((y, k) => {
        estimatedByYear.set(y, pattern.unit[k % pattern.period]);
      });
    }

    const cells: MatrixCell[] = years.map((y) => {
      const rec = rm.get(y);
      return {
        year: y,
        planned: gm.get(y) ?? null,
        done: rec && rec.status === "done" ? rec.grade : null,
        hasRecord: !!rec,
        skipped: rec?.status === "skipped",
        projected: projected.has(y),
        estimatedGrade: estimatedByYear.get(y) ?? null,
      };
    });

    const doneCount = new Set([...recordYears, ...plannedPast]).size;

    if (j.reason === "due") summary.dueNow++;
    if (j.reason === "overdue") summary.overdue++;
    if (j.needsDecision) summary.needsDecision++;
    if (lastDoneYear == null) summary.noHistory++;

    return {
      id: p.id,
      category: p.category,
      sub_category: p.sub_category,
      name: p.name,
      tag_no: p.tag_no,
      maker: p.maker,
      spec: p.spec,
      field: p.field,
      method: p.method,
      completion: p.completion,
      cycle_raw: p.cycle_raw,
      cycle_years: p.cycle_years,
      cycle_kind: p.cycle_kind,
      cycle_options: p.cycle_options,
      isOverhaul: isOverhaulScope(p.method),
      isActive: p.is_active,
      lastDoneYear,
      lastRecordYear,
      doneCount,
      judge: j,
      cells,
    };
  });

  return { years, thisYear, futureFrom: thisYear + 1, rows, summary };
}

// ---------------------------------------------------------------------------
// 수량산출서
//
// 확정한 대상을 수량산출서로 뽑아 시공사에 주고, 시공사가 작업 시작일·종료일을 채워
// 되돌려주면 그 파일이 공정관리(overhaul_task)로 들어간다.
// 금액은 다루지 않는다 — 추정가 산정은 시스템 밖의 일이다.
// ---------------------------------------------------------------------------

export interface StatementItemInput {
  planId: string;
  category: string | null;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  /** A/B/C — 명칭에 섞지 않고 별도 컬럼에 저장한다 */
  grade?: string | null;
  note: string | null;
  classification: string;
}

export async function createDesignStatement(params: {
  targetYear: number;
  field: string | null;
  title: string;
  items: StatementItemInput[];
}): Promise<{ statementId: string }> {
  const stmt = await queryOne<{ id: string }>(
    `insert into design_statement (target_year, field, title, item_count)
     values ($1,$2,$3,$4) returning id`,
    [params.targetYear, params.field, params.title, params.items.length],
  );
  if (!stmt) throw new Error("수량산출서를 만들지 못했습니다.");

  // 대분류 그룹별로 순번을 1부터 다시 매긴다 — 원본 내역서 양식과 같다
  const seqByCategory = new Map<string, number>();
  const COLS = 10;
  const CHUNK = 200;

  for (let start = 0; start < params.items.length; start += CHUNK) {
    const chunk = params.items.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const ph: string[] = [];
    chunk.forEach((it, i) => {
      const key = it.category ?? "(미분류)";
      const seq = (seqByCategory.get(key) ?? 0) + 1;
      seqByCategory.set(key, seq);
      const base = i * COLS;
      ph.push(`(${Array.from({ length: COLS }, (_, k) => `$${base + k + 1}`).join(",")})`);
      values.push(
        stmt.id,
        it.planId,
        it.category,
        seq,
        it.name,
        it.spec,
        it.qty,
        it.unit,
        it.grade ?? null,
        it.note,
      );
    });
    await execute(
      `insert into design_statement_item
         (statement_id, plan_id, category, seq, name, spec, qty, unit, grade, note)
       values ${ph.join(",")}`,
      values,
    );
  }

  // classification은 별도로 업데이트하면 왕복이 늘어나므로 위 INSERT에 넣지 않고,
  // 항목별 분류가 필요하면 plan_id로 다시 판정할 수 있다. 다만 확정 당시 기준을
  // 남겨두는 게 나중에 비교에 유용하므로 한 문장으로 묶어 채운다.
  const clsValues: unknown[] = [];
  const clsPh: string[] = [];
  params.items.forEach((it, i) => {
    clsPh.push(`($${i * 2 + 1}::uuid, $${i * 2 + 2}::text)`);
    clsValues.push(it.planId, it.classification);
  });
  if (clsPh.length) {
    await execute(
      `update design_statement_item t
          set classification = v.cls
         from (values ${clsPh.join(",")}) as v(plan_id, cls)
        where t.statement_id = $${clsValues.length + 1} and t.plan_id = v.plan_id`,
      [...clsValues, stmt.id],
    );
  }

  return { statementId: stmt.id };
}

export interface DesignStatementRow {
  id: string;
  target_year: number;
  field: string | null;
  title: string | null;
  item_count: number;
  created_at: string;
  /** 이력 반영을 마친 시각. null이면 아직 준공 처리 전이거나 반영 전 */
  reconciled_at: string | null;
}

export async function listDesignStatements(): Promise<DesignStatementRow[]> {
  return query<DesignStatementRow>(
    `select id, target_year, field, title, item_count, created_at::text, reconciled_at::text
       from design_statement order by created_at desc`,
  );
}

export interface DesignStatementItemRow {
  id: number;
  plan_id: string | null;
  category: string | null;
  seq: number;
  name: string;
  spec: string | null;
  qty: number;
  unit: string;
  plan_start: string | null;
  plan_end: string | null;
  grade: string | null;
  note: string | null;
  classification: string | null;
}

export async function getDesignStatement(statementId: string): Promise<{
  statement: DesignStatementRow | null;
  items: DesignStatementItemRow[];
}> {
  const statement = await queryOne<DesignStatementRow>(
    `select id, target_year, field, title, item_count, created_at::text, reconciled_at::text
       from design_statement where id = $1`,
    [statementId],
  );
  const items = await query<DesignStatementItemRow>(
    `select id, plan_id, category, seq, name, spec, qty::float8 as qty, unit,
            plan_start::text, plan_end::text, grade, note, classification
       from design_statement_item
      where statement_id = $1
      order by category nulls last, seq`,
    [statementId],
  );
  return { statement, items };
}

export async function deleteDesignStatement(statementId: string): Promise<number> {
  return execute(`delete from design_statement where id = $1`, [statementId]);
}

// ---------------------------------------------------------------------------
// 보수 실적 — 오버홀 후 여기에 남기면 다음 회차 판정이 자동 갱신된다
// ---------------------------------------------------------------------------

export async function recordMaintenance(params: {
  planId: string;
  doneYear: number;
  grade?: string | null;
  status?: "done" | "skipped";
  projectId?: string | null;
  note?: string | null;
}): Promise<void> {
  await execute(
    `insert into maintenance_record (plan_id, done_year, grade, status, project_id, note)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (plan_id, done_year) do update
       set grade = excluded.grade, status = excluded.status,
           project_id = excluded.project_id, note = excluded.note`,
    [
      params.planId,
      params.doneYear,
      params.grade ?? null,
      params.status ?? "done",
      params.projectId ?? null,
      params.note ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// 준공 후 이력 반영 — 확정했던 수량산출서를 실제 결과와 맞춰보고 과거 이력으로 넘긴다
//
// overhaul_task와 design_statement_item은 행 단위로 잇지 않기로 했다(계획을 짤 때와
// 실행할 때 쓰는 표가 서로 다른 목적이라 강제로 묶으면 어긋난다). 그래서 실제
// 공정관리 실적을 이름으로 "참고 삼아" 붙여만 주고, 최종 판단은 사람이 한다.
//   완료 → maintenance_record(status='done')
//   계약기간이 지났는데도 미완료 → status='skipped' (계약변경으로 안 함 — 확인된 사실)
//   계획에 없었지만 이번에 같이 한 설비 → 화면에서 직접 추가해 done으로 남긴다
// ---------------------------------------------------------------------------

export interface ReconcileCandidate {
  itemId: number;
  planId: string | null;
  name: string;
  spec: string | null;
  grade: string | null;
  classification: string | null;
  /** 이름으로 찾은 가장 비슷한 공정관리 작업 — 참고용 제안일 뿐, 확정은 사람이 한다 */
  suggestedTaskName: string | null;
  suggestedPlanQty: number | null;
  suggestedDoneQty: number | null;
  /** 위 수량 비교로 시스템이 밀어보는 결론. 이미 반영됐으면 null */
  suggestedOutcome: "done" | "skipped" | null;
  /** 이미 이 해에 반영된 적이 있으면 그 결과 */
  existingStatus: "done" | "skipped" | null;
}

/**
 * 내역서 항목마다 이름이 가장 비슷한 공정관리 작업을 찾아 완료 여부를 제안한다.
 * (유사도 0.35 미만이면 매칭 없음으로 본다 — pg_trgm이 이미 설비 마스터 등에서
 * 쓰는 것과 같은 기준) 계약기간(프로젝트 종료일)이 지났는데 수량이 못 채워졌으면
 * "보수 안 함"을 제안하고, 아직 기간이 남았으면 제안하지 않는다(더 지켜봐야 하므로).
 */
export async function suggestReconciliation(statementId: string): Promise<{
  targetYear: number;
  candidates: ReconcileCandidate[];
}> {
  const statement = await queryOne<{ target_year: number }>(
    `select target_year from design_statement where id = $1`,
    [statementId],
  );
  if (!statement) throw new Error("내역서를 찾을 수 없습니다.");

  const project = await queryOne<{ end_date: string | null }>(
    `select end_date::text from overhaul_project order by created_at limit 1`,
  );
  const contractEnded = !!project?.end_date && new Date(project.end_date) < new Date();

  const rows = await query<{
    item_id: number;
    plan_id: string | null;
    name: string;
    spec: string | null;
    grade: string | null;
    classification: string | null;
    task_name: string | null;
    plan_qty: number | null;
    done_qty: number | null;
    existing_status: "done" | "skipped" | null;
  }>(
    `select i.id as item_id, i.plan_id, i.name, i.spec, i.grade, i.classification,
            t.name as task_name, t.plan_qty::float8 as plan_qty, t.done_qty::float8 as done_qty,
            r.status as existing_status
       from design_statement_item i
       left join lateral (
         select name, plan_qty, done_qty
           from overhaul_task
          where similarity(name, i.name) > 0.35
          order by similarity(name, i.name) desc
          limit 1
       ) t on true
       left join maintenance_record r on r.plan_id = i.plan_id and r.done_year = $2
      where i.statement_id = $1
      order by i.category nulls last, i.seq`,
    [statementId, statement.target_year],
  );

  const candidates: ReconcileCandidate[] = rows.map((r) => {
    let suggestedOutcome: "done" | "skipped" | null = null;
    if (!r.existing_status && r.task_name) {
      const complete = r.plan_qty != null && r.done_qty != null && r.done_qty >= r.plan_qty;
      if (complete) suggestedOutcome = "done";
      else if (contractEnded) suggestedOutcome = "skipped";
    }
    return {
      itemId: r.item_id,
      planId: r.plan_id,
      name: r.name,
      spec: r.spec,
      grade: r.grade,
      classification: r.classification,
      suggestedTaskName: r.task_name,
      suggestedPlanQty: r.plan_qty,
      suggestedDoneQty: r.done_qty,
      suggestedOutcome,
      existingStatus: r.existing_status,
    };
  });

  return { targetYear: statement.target_year, candidates };
}

/** "계획에 없던 추가 보수" 대상을 찾을 때 쓰는 가벼운 설비 검색 (사용중지 제외) */
export async function searchActivePlansLite(
  q: string,
  limit = 20,
): Promise<{ id: string; name: string; tag_no: string | null; category: string | null }[]> {
  const kw = q.trim();
  if (!kw) return [];
  return query(
    `select id, name, tag_no, category
       from maintenance_plan
      where is_active and (name ilike $1 or tag_no ilike $1 or category ilike $1)
      order by name
      limit $2`,
    [`%${kw}%`, limit],
  );
}

export interface ReconcileDecision {
  planId: string;
  outcome: "done" | "skipped";
  grade?: string | null;
  note?: string | null;
}

/**
 * 사람이 확인한 결정을 한 번에 이력으로 남기고, 내역서를 "반영 완료"로 표시한다.
 * 반복 실행해도 안전하다 — done_year가 같으면 덮어쓴다.
 */
export async function reconcileStatement(params: {
  statementId: string;
  targetYear: number;
  decisions: ReconcileDecision[];
}): Promise<{ recorded: number }> {
  await transaction(async (tx) => {
    for (const d of params.decisions) {
      await tx.query(
        `insert into maintenance_record (plan_id, done_year, grade, status, note)
         values ($1,$2,$3,$4,$5)
         on conflict (plan_id, done_year) do update
           set grade = excluded.grade, status = excluded.status, note = excluded.note`,
        [
          d.planId,
          params.targetYear,
          d.outcome === "done" ? (d.grade ?? null) : null,
          d.outcome,
          d.note ?? (d.outcome === "skipped" ? "계약변경으로 미시행" : null),
        ],
      );
    }
    await tx.query(`update design_statement set reconciled_at = now() where id = $1`, [
      params.statementId,
    ]);
  });
  return { recorded: params.decisions.length };
}
