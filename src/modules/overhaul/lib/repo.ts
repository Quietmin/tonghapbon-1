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
  /**
   * DB 컬럼은 있지만 갱신하지 않는다 — 모든 행이 기본값 '대기'로 남아 있다.
   * 상태는 항상 수량으로 계산한다(progress.ts의 taskStatus). 진실의 원천이 하나여야
   * 화면·엑셀·보고서가 어긋나지 않기 때문이다.
   * 그래서 이 값으로 거르거나 정렬하면 안 된다. 수량과 무관한 상태 지정(예: 검사
   * 승인 대기)이 필요해지면 그때 이 컬럼을 되살리고 갱신 경로를 만든다.
   */
  status: string;
  assignee: string | null;
  plan_start: string | null;
  plan_end: string | null;
  needs_review: boolean;
  sheet_name: string | null;
  row_index: number | null;
  /** 이 작업이 어느 수량산출서 항목에서 나왔는지 (항목ID 컬럼을 달고 온 파일만) */
  statement_item_id: number | null;
}

/** 작업 조회 컬럼 — 목록·전체·단건이 같은 모양을 돌려주도록 한 곳에 모아둔다 */
const TASK_COLUMNS = `id, source_id, equipment_id, name, spec, unit,
            plan_qty::float8 as plan_qty, done_qty::float8 as done_qty,
            field, equipment_type, tag, status, assignee,
            plan_start::text, plan_end::text, needs_review, sheet_name, row_index,
            statement_item_id`;

const PROJECT_COLUMNS = `id, name, plant, unit, start_date::text, end_date::text`;

// ---------------------------------------------------------------------------
// 프로젝트 (오버홀 회차)
//
// 회차마다 한 건이다. 2026년 1호기와 2027년 1호기는 별개의 프로젝트이고,
// 작업항목·실적·업로드 이력이 project_id로 완전히 갈린다.
// 지금 어느 회차를 보고 있는지는 activeProject.ts가 쿠키로 들고 있다.
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<OverhaulProject[]> {
  return query<OverhaulProject>(
    `select ${PROJECT_COLUMNS} from overhaul_project
      order by start_date desc nulls last, created_at desc`,
  );
}

export async function getProject(id: string): Promise<OverhaulProject | null> {
  return queryOne<OverhaulProject>(
    `select ${PROJECT_COLUMNS} from overhaul_project where id = $1`,
    [id],
  );
}

export async function createProject(input: {
  name: string;
  plant?: string | null;
  unit?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}): Promise<OverhaulProject> {
  const name = input.name?.trim();
  if (!name) throw new Error("프로젝트명을 입력하세요.");
  const created = await queryOne<OverhaulProject>(
    `insert into overhaul_project (name, plant, unit, start_date, end_date)
     values ($1,$2,$3,$4,$5)
     returning ${PROJECT_COLUMNS}`,
    [
      name,
      input.plant || null,
      input.unit || null,
      input.start_date || null,
      input.end_date || null,
    ],
  );
  if (!created) throw new Error("프로젝트를 만들지 못했습니다.");
  return created;
}

/** 회차 삭제 — 딸린 업로드 이력·작업항목·실적이 함께 지워진다 (FK on delete cascade) */
export async function deleteProject(id: string): Promise<number> {
  return execute(`delete from overhaul_project where id = $1`, [id]);
}

/**
 * 가장 최근 회차를 돌려준다. 하나도 없으면 기본값으로 만든다.
 * 활성 회차가 지정되지 않았을 때의 기본 선택이다 (activeProject.ts 참고).
 */
export async function getOrCreateProject(): Promise<OverhaulProject> {
  const found = await queryOne<OverhaulProject>(
    `select ${PROJECT_COLUMNS} from overhaul_project
      order by start_date desc nulls last, created_at desc limit 1`,
  );
  if (found) return found;

  const created = await queryOne<OverhaulProject>(
    `insert into overhaul_project (name, plant, unit)
     values ('정기 오버홀', '발전본부', '1호기')
     returning ${PROJECT_COLUMNS}`,
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
}): Promise<{ sourceId: string; taskCount: number; linkedStatementItems: number }> {
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
          field, equipment_type, tag, plan_start, plan_end, needs_review, sheet_name, row_index,
          statement_item_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        t.statementItemId ?? null,
      ],
    );
  }

  // 시공사가 채워 온 일정을 원래 수량산출서에도 되돌려 적는다.
  // 이게 있어야 "내역서를 뽑아 → 일정을 받아 → 공정관리로" 한 바퀴가 닫힌다.
  const linked = await backfillStatementSchedule(tasks);

  return { sourceId: source.id, taskCount: tasks.length, linkedStatementItems: linked };
}

/**
 * 항목ID를 달고 온 작업의 계획일정을 design_statement_item에 반영한다.
 * 항목ID가 없는 파일이면 아무 일도 하지 않는다 (반환 0).
 */
async function backfillStatementSchedule(tasks: ParsedTask[]): Promise<number> {
  const dated = tasks.filter((t) => t.statementItemId != null && (t.planStart || t.planEnd));
  if (!dated.length) return 0;

  let n = 0;
  for (const t of dated) {
    n += await execute(
      `update design_statement_item
          set plan_start = coalesce($2, plan_start),
              plan_end   = coalesce($3, plan_end)
        where id = $1`,
      [t.statementItemId, t.planStart, t.planEnd],
    );
  }
  return n;
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
    `select ${TASK_COLUMNS}
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
    `select ${TASK_COLUMNS}
       from overhaul_task where project_id = $1
      order by sheet_name nulls last, row_index nulls last`,
    [projectId],
  );
}

export async function getTask(taskId: string): Promise<OverhaulTask | null> {
  return queryOne<OverhaulTask>(
    `select ${TASK_COLUMNS} from overhaul_task where id = $1`,
    [taskId],
  );
}

/**
 * 작업 선택 드롭다운용 — 목록 화면처럼 무겁게 조회할 필요 없다.
 * 수천 건짜리 내역서도 처리해야 하므로 상한을 둔다. 넘치면 화면에서 검색으로 좁힌다.
 */
export async function listTaskOptions(
  projectId: string,
  opts: { q?: string; limit?: number } = {},
): Promise<{ id: string; name: string; equipment_type: string | null }[]> {
  const params: unknown[] = [projectId];
  const where = ["project_id = $1"];
  if (opts.q?.trim()) {
    params.push(opts.q.trim());
    where.push(`(name ilike '%' || $${params.length} || '%' or spec ilike '%' || $${params.length} || '%')`);
  }
  params.push(Math.min(opts.limit ?? 300, 1000));
  return query(
    `select id, name, equipment_type from overhaul_task
      where ${where.join(" and ")}
      order by sheet_name nulls last, row_index nulls last
      limit $${params.length}`,
    params,
  );
}

// ---------------------------------------------------------------------------
// 작업항목 직접 편집
//
// 파서가 100% 맞을 수는 없다. 수량·단위·분야가 어긋난 항목(needs_review)을
// 화면에서 고칠 수 있어야 하고, 엑셀에 없던 작업을 손으로 넣을 수도 있어야 한다.
// ---------------------------------------------------------------------------

export interface TaskPatch {
  name?: string;
  spec?: string | null;
  unit?: string | null;
  plan_qty?: number;
  field?: string | null;
  equipment_type?: string | null;
  tag?: string | null;
  assignee?: string | null;
  plan_start?: string | null;
  plan_end?: string | null;
  needs_review?: boolean;
}

const TASK_PATCHABLE: (keyof TaskPatch)[] = [
  "name", "spec", "unit", "plan_qty", "field", "equipment_type",
  "tag", "assignee", "plan_start", "plan_end", "needs_review",
];

/**
 * 부분 수정. body에 실제로 들어온 키만 반영한다 —
 * 전부 보내게 하면 일부만 보낸 호출이 나머지를 NULL로 덮어쓴다.
 * 빈 문자열은 NULL로 바꾼다(날짜 컬럼에 ''를 넣으면 캐스팅 오류가 난다).
 */
export async function updateTask(taskId: string, patch: TaskPatch): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const key of TASK_PATCHABLE) {
    if (!(key in patch)) continue;
    const v = patch[key];
    cols.push(`${key} = $${cols.length + 1}`);
    vals.push(v === "" ? null : v);
  }
  if (!cols.length) return;
  vals.push(taskId);
  await execute(
    `update overhaul_task set ${cols.join(", ")} where id = $${vals.length}`,
    vals,
  );
}

/** 엑셀에 없던 작업을 손으로 추가한다. source_id는 없으므로 파일 되돌리기에 안 걸린다. */
export async function createTask(
  projectId: string,
  input: TaskPatch & { name: string },
): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("작업명을 입력하세요.");

  const equipmentType = input.equipment_type?.trim() || null;
  // 설비 마스터에도 등록해 고장이력·챗봇이 같은 설비를 참조하게 한다 ('기타'는 분류 실패)
  const equipMap =
    equipmentType && equipmentType !== "기타"
      ? await ensureEquipments([
          { name: equipmentType, type: equipmentType, field: input.field ?? undefined },
        ])
      : null;

  const created = await queryOne<{ id: string }>(
    `insert into overhaul_task
       (project_id, equipment_id, name, spec, unit, plan_qty,
        field, equipment_type, tag, assignee, plan_start, plan_end, needs_review)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
     returning id`,
    [
      projectId,
      equipMap?.get(equipmentType!.toLowerCase()) ?? null,
      name,
      input.spec || null,
      input.unit || "EA",
      input.plan_qty ?? 0,
      input.field || null,
      equipmentType,
      input.tag || null,
      input.assignee || null,
      input.plan_start || null,
      input.plan_end || null,
    ],
  );
  if (!created) throw new Error("작업을 추가하지 못했습니다.");
  return created;
}

/** 작업 한 건 삭제 — 딸린 실적 이력도 함께 지워진다 (FK on delete cascade) */
export async function deleteTask(taskId: string): Promise<number> {
  return execute(`delete from overhaul_task where id = $1`, [taskId]);
}

// ---------------------------------------------------------------------------
// 실적 입력
// ---------------------------------------------------------------------------

export type PhotoSlot = "before" | "after";

/** 사진 한 장의 식별 정보. 이미지 데이터는 담지 않는다 */
export interface EntryPhotoRef {
  id: number;
  slot: PhotoSlot;
  seq: number;
}

export interface OverhaulEntry {
  id: string;
  task_id: string;
  entry_date: string;
  /** 그날까지의 누적 완료수량 (그날 하루치 증가분이 아님) */
  done_qty: number;
  work_detail: string | null;
  delay_reason: string | null;
  next_plan: string | null;
  /**
   * 그날 붙은 사진 목록 — id·slot·순서만 담고 이미지 데이터는 넣지 않는다.
   * 한 장에 수백 KB인 base64라 목록에 섞으면 실적을 한 번 저장할 때마다 그 작업의
   * 과거 사진을 전부 되받게 된다. 실제 이미지는 /api/overhaul/photos/one?id= 에서
   * 한 장씩 받아 브라우저가 캐시한다.
   */
  photos: EntryPhotoRef[];
}

/** 사진은 참조만 — 이유는 OverhaulEntry.photos 주석 참고 */
const ENTRY_COLUMNS = `o.id, o.task_id, o.entry_date::text, o.done_qty::float8 as done_qty,
            o.work_detail, o.delay_reason, o.next_plan,
            coalesce((
              select json_agg(json_build_object('id', p.id, 'slot', p.slot, 'seq', p.seq)
                              order by p.slot, p.seq, p.id)
                from overhaul_entry_photo p where p.entry_id = o.id
            ), '[]'::json) as photos`;

export async function listEntries(taskId: string): Promise<OverhaulEntry[]> {
  return query<OverhaulEntry>(
    `select ${ENTRY_COLUMNS}
       from overhaul_entry o where o.task_id = $1
      order by o.entry_date desc`,
    [taskId],
  );
}

/** 저장할 사진 지시 — 화면이 보내는 그대로 */
export interface EntryPhotoInput {
  /** 그대로 남길 기존 사진 id. 여기 없는 기존 사진은 지워진다 */
  keepIds: number[];
  /** 새로 붙일 사진 (이미 줄여진 data URL) */
  add: { slot: PhotoSlot; dataUrl: string }[];
}

/**
 * task_id+entry_date가 이미 있으면 덮어쓰고, 없으면 새로 만든다.
 *
 * 사진(photos)은 아예 안 보내면 손대지 않는다 — 메모만 고쳐 저장했을 때 사진이
 * 날아가지 않게 하려는 것이다. 보내면 "keepIds에 없는 기존 사진은 지우고, add를
 * 새로 붙인다"로 동작한다. 화면이 이미지 원본을 들고 있지 않아도 되도록,
 * 남길 사진은 id로만 지목한다.
 */
export async function upsertEntry(input: {
  taskId: string;
  date: string;
  cumulative: number;
  workDetail?: string | null;
  delayReason?: string | null;
  nextPlan?: string | null;
  photos?: EntryPhotoInput;
}): Promise<void> {
  const row = await queryOne<{ id: string }>(
    `insert into overhaul_entry
       (task_id, entry_date, done_qty, work_detail, delay_reason, next_plan)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (task_id, entry_date) do update
       set done_qty      = excluded.done_qty,
           work_detail   = excluded.work_detail,
           delay_reason  = excluded.delay_reason,
           next_plan     = excluded.next_plan,
           updated_at    = now()
     returning id`,
    [
      input.taskId,
      input.date,
      input.cumulative,
      input.workDetail || null,
      input.delayReason || null,
      input.nextPlan || null,
    ],
  );
  if (!row) throw new Error("실적을 저장하지 못했습니다.");

  if (input.photos) await applyEntryPhotos(row.id, input.photos);
  await recomputeTaskDoneQty(input.taskId);
}

/** 사진 지시를 반영한다. 남길 목록에 없는 기존 사진은 지운다. */
async function applyEntryPhotos(entryId: string, photos: EntryPhotoInput): Promise<void> {
  const keep = photos.keepIds.filter((n) => Number.isInteger(n));
  // 빈 배열이면 <> all(빈 배열)이 모든 행에 참이라 전부 지워진다 — 의도한 동작이다
  await execute(
    `delete from overhaul_entry_photo
      where entry_id = $1 and id <> all($2::bigint[])`,
    [entryId, keep],
  );

  if (!photos.add.length) return;

  // 순서는 slot별로 이어 붙인다
  const maxSeq = await query<{ slot: string; n: number }>(
    `select slot, coalesce(max(seq), 0)::int as n
       from overhaul_entry_photo where entry_id = $1 group by slot`,
    [entryId],
  );
  const nextSeq = new Map(maxSeq.map((r) => [r.slot, r.n]));

  for (const item of photos.add) {
    const slot: PhotoSlot = item.slot === "after" ? "after" : "before";
    const seq = (nextSeq.get(slot) ?? 0) + 1;
    nextSeq.set(slot, seq);
    await execute(
      `insert into overhaul_entry_photo (entry_id, slot, seq, data) values ($1,$2,$3,$4)`,
      [entryId, slot, seq, item.dataUrl],
    );
  }
}

export async function deleteEntry(taskId: string, date: string): Promise<void> {
  await execute(`delete from overhaul_entry where task_id = $1 and entry_date = $2`, [taskId, date]);
  await recomputeTaskDoneQty(taskId);
}

/**
 * overhaul_task.done_qty = 그 작업의 "가장 최근 날짜에 보고한 누적".
 *
 * 예전에는 모든 기록 중 최댓값을 썼는데(원본 store.jsx의 Math.max 그대로),
 * 그러면 한 번 올라간 수치가 절대 내려오지 않아 오입력을 되돌릴 수 없었다.
 * 1/5에 100을 잘못 넣고 1/6에 10으로 정정해도 공정률이 100%로 남았고,
 * 1/5 기록을 통째로 지우는 것 말고는 방법이 없었다.
 *
 * "가장 최근에 보고한 누적이 현재 상태"가 공정 보고의 상식적인 모델이고,
 * 무엇보다 틀렸을 때 다시 입력하는 것만으로 고쳐진다.
 */
async function recomputeTaskDoneQty(taskId: string): Promise<void> {
  await execute(
    `update overhaul_task
        set done_qty = coalesce(
              (select done_qty from overhaul_entry
                where task_id = $1
                order by entry_date desc
                limit 1), 0)
      where id = $1`,
    [taskId],
  );
}

export interface EntryRange {
  task_id: string;
  min_date: string;
  max_date: string;
  cnt: number;
}

/** 공정표의 "실적 바"용 — 작업별 실적 입력 날짜의 최초·최근 날짜 */
export async function listEntryRanges(projectId: string): Promise<EntryRange[]> {
  return query<EntryRange>(
    `select o.task_id,
            min(o.entry_date)::text as min_date,
            max(o.entry_date)::text as max_date,
            count(*)::int as cnt
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
      group by o.task_id`,
    [projectId],
  );
}

/**
 * 보고서용 — 프로젝트 전체 실적 이력을 한 번에 가져온다 (작업별 날짜 내림차순).
 * 사진은 여기서도 참조만 싣는다 (OverhaulEntry.photos 주석 참고).
 */
export async function listAllEntriesForProject(projectId: string): Promise<OverhaulEntry[]> {
  return query<OverhaulEntry>(
    `select ${ENTRY_COLUMNS}
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
      order by o.task_id, o.entry_date desc`,
    [projectId],
  );
}

// ---------------------------------------------------------------------------
// 사진
//
// 이미지 데이터는 절대 목록에 함께 싣지 않는다. 목록은 id·slot·순서만 주고,
// 화면이 <img src="/api/overhaul/photos/one?id=…">로 한 장씩 받아간다.
// 브라우저가 캐시하므로 같은 사진을 다시 볼 때는 요청이 나가지 않는다.
// ---------------------------------------------------------------------------

/** 사진 한 장을 꺼낸다 (data URL) */
export async function getPhotoById(id: number): Promise<string | null> {
  const row = await queryOne<{ data: string }>(
    `select data from overhaul_entry_photo where id = $1`,
    [id],
  );
  return row?.data ?? null;
}
