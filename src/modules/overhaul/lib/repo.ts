import { query, queryOne, execute } from "@/shared/lib/db";
import { ensureEquipments } from "@/shared/lib/equipment";
import type { ParsedTask } from "./excelParser";

/**
 * 오버홀 공정관리의 DB 접근 계층.
 * 화면과 API Route는 여기만 부르고 SQL을 직접 쓰지 않는다.
 */

export interface OverhaulProject {
  id: string;
  name: string;
  plant: string | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface OverhaulSource {
  id: string;
  file_name: string;
  field_hint: string | null;
  task_count: number;
  uploaded_at: string;
}

export interface OverhaulTask {
  id: string;
  source_id: string | null;
  equipment_id: string | null;
  name: string;
  spec: string | null;
  unit: string | null;
  plan_qty: number;
  done_qty: number;
  field: string | null;
  equipment_type: string | null;
  tag: string | null;
  status: string;
  assignee: string | null;
  plan_start: string | null;
  plan_end: string | null;
  needs_review: boolean;
  sheet_name: string | null;
  row_index: number | null;
}

/**
 * 단일 사업장 운영이라 프로젝트는 한 개만 쓴다.
 * 없으면 기본값으로 만들고, 있으면 그대로 돌려준다.
 */
export async function getOrCreateProject(): Promise<OverhaulProject> {
  const found = await queryOne<OverhaulProject>(
    `select id, name, plant, unit, start_date::text, end_date::text
       from overhaul_project order by created_at limit 1`,
  );
  if (found) return found;

  const created = await queryOne<OverhaulProject>(
    `insert into overhaul_project (name, plant, unit)
     values ('정기 오버홀', '발전본부', '1호기')
     returning id, name, plant, unit, start_date::text, end_date::text`,
  );
  if (!created) throw new Error("프로젝트를 만들지 못했습니다.");
  return created;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<OverhaulProject, "name" | "plant" | "unit" | "start_date" | "end_date">>,
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = $${cols.length + 1}`);
    vals.push(v === "" ? null : v);
  }
  if (!cols.length) return;
  vals.push(id);
  await execute(`update overhaul_project set ${cols.join(", ")} where id = $${vals.length}`, vals);
}

/**
 * 분석 결과를 저장한다. 업로드 파일 1개 = source 1건이라 나중에 파일 단위로 지울 수 있다.
 *
 * 파서가 분류한 설비 유형은 설비 마스터에도 함께 등록해서, 고장이력·챗봇이 같은
 * 설비를 참조할 수 있게 한다.
 */
export async function saveAnalysis(params: {
  projectId: string;
  fileName: string;
  fieldHint?: string | null;
  tasks: ParsedTask[];
}): Promise<{ sourceId: string; taskCount: number }> {
  const { projectId, fileName, fieldHint, tasks } = params;

  const source = await queryOne<{ id: string }>(
    `insert into overhaul_source (project_id, file_name, field_hint, task_count)
     values ($1, $2, $3, $4) returning id`,
    [projectId, fileName, fieldHint ?? null, tasks.length],
  );
  if (!source) throw new Error("업로드 이력을 저장하지 못했습니다.");

  // 설비 마스터를 먼저 채운다. '기타'는 분류 실패를 뜻하므로 마스터에 만들지 않는다.
  const equipMap = await ensureEquipments(
    tasks
      .filter((t) => t.equipment && t.equipment !== "기타")
      .map((t) => ({ name: t.equipment, type: t.equipment, field: t.field === "미분류" ? null : t.field })),
  );

  for (const t of tasks) {
    const equipmentId = equipMap.get(t.equipment.trim().toLowerCase()) ?? null;
    await execute(
      `insert into overhaul_task
         (project_id, source_id, equipment_id, name, spec, unit, plan_qty,
          field, equipment_type, tag, plan_start, plan_end, needs_review, sheet_name, row_index)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        projectId,
        source.id,
        equipmentId,
        t.name,
        t.spec || null,
        t.unit || null,
        t.planQty,
        t.field === "미분류" ? null : t.field,
        t.equipment,
        t.tag || null,
        t.planStart,
        t.planEnd,
        t.issues.length > 0,
        t.sheetName,
        t.sourceRow,
      ],
    );
  }

  return { sourceId: source.id, taskCount: tasks.length };
}

export async function listSources(projectId: string): Promise<OverhaulSource[]> {
  return query<OverhaulSource>(
    `select id, file_name, field_hint, task_count, uploaded_at::text
       from overhaul_source where project_id = $1 order by uploaded_at desc`,
    [projectId],
  );
}

/** 업로드 파일 단위 되돌리기 — 딸린 작업항목도 함께 지워진다 (FK on delete cascade) */
export async function deleteSource(sourceId: string): Promise<number> {
  return execute(`delete from overhaul_source where id = $1`, [sourceId]);
}

export interface TaskFilter {
  field?: string;
  equipmentType?: string;
  status?: string;
  q?: string;
  needsReview?: boolean;
  limit?: number;
  offset?: number;
}

export async function listTasks(
  projectId: string,
  f: TaskFilter = {},
): Promise<{ rows: OverhaulTask[]; total: number }> {
  const where: string[] = ["project_id = $1"];
  const params: unknown[] = [projectId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (f.field) add("field = ?", f.field);
  if (f.equipmentType) add("equipment_type = ?", f.equipmentType);
  if (f.status) add("status = ?", f.status);
  if (f.needsReview) where.push("needs_review = true");
  if (f.q) {
    // 한국어는 조사·어미가 붙어 문장 전체 유사도가 안 먹는다.
    // 어절로 쪼개 모두 포함하는 행을 찾는다 (db/schema.sql 상단의 검색 전략 주석 참고).
    for (const token of f.q.trim().split(/\s+/).filter(Boolean)) {
      params.push(token);
      const p = `$${params.length}`;
      where.push(`(name ilike '%' || ${p} || '%' or spec ilike '%' || ${p} || '%')`);
    }
  }

  const clause = where.join(" and ");
  const totalRow = await queryOne<{ n: number }>(
    `select count(*)::int as n from overhaul_task where ${clause}`,
    params,
  );

  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  const rows = await query<OverhaulTask>(
    `select id, source_id, equipment_id, name, spec, unit,
            plan_qty::float8 as plan_qty, done_qty::float8 as done_qty,
            field, equipment_type, tag, status, assignee,
            plan_start::text, plan_end::text, needs_review, sheet_name, row_index
       from overhaul_task
      where ${clause}
      order by sheet_name nulls last, row_index nulls last
      limit ${limit} offset ${offset}`,
    params,
  );

  return { rows, total: totalRow?.n ?? 0 };
}

export async function listAllTasks(projectId: string): Promise<OverhaulTask[]> {
  return query<OverhaulTask>(
    `select id, source_id, equipment_id, name, spec, unit,
            plan_qty::float8 as plan_qty, done_qty::float8 as done_qty,
            field, equipment_type, tag, status, assignee,
            plan_start::text, plan_end::text, needs_review, sheet_name, row_index
       from overhaul_task where project_id = $1
      order by sheet_name nulls last, row_index nulls last`,
    [projectId],
  );
}
