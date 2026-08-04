import { query, queryOne, execute } from "@/shared/lib/db";
import { ensureEquipments } from "@/shared/lib/equipment";
import type { ParsedPlanItem } from "./maintenancePlanParser";
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

/**
 * 특정 연도 기준으로 전체 계획을 판정해서 돌려준다.
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
              where r.plan_id = p.id and r.done_year < $1) as recorded_year,
            (select g.grade from maintenance_plan_grade g
              where g.plan_id = p.id and g.year = $1) as planned_grade
       from maintenance_plan p
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
}

export async function listDesignStatements(): Promise<DesignStatementRow[]> {
  return query<DesignStatementRow>(
    `select id, target_year, field, title, item_count, created_at::text
       from design_statement order by created_at desc`,
  );
}

export interface DesignStatementItemRow {
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
    `select id, target_year, field, title, item_count, created_at::text
       from design_statement where id = $1`,
    [statementId],
  );
  const items = await query<DesignStatementItemRow>(
    `select category, seq, name, spec, qty::float8 as qty, unit,
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
  projectId?: string | null;
  note?: string | null;
}): Promise<void> {
  await execute(
    `insert into maintenance_record (plan_id, done_year, grade, project_id, note)
     values ($1,$2,$3,$4,$5)
     on conflict (plan_id, done_year) do update
       set grade = excluded.grade, project_id = excluded.project_id, note = excluded.note`,
    [params.planId, params.doneYear, params.grade ?? null, params.projectId ?? null, params.note ?? null],
  );
}
