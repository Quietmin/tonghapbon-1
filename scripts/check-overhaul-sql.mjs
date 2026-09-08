// 이번에 새로 쓰거나 고친 SQL만 골라 PGlite에 실제로 던져 본다.
// 빌드·타입체크로는 SQL 오류가 잡히지 않아서, 스키마 적용부터 각 질의까지
// 한 번씩 실행해 문법·컬럼·조인이 맞는지 확인한다. 실제 DB는 건드리지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ohsqlcheck-"));
const db = await PGlite.create({ dataDir: dir, extensions: { pg_trgm } });

let pass = 0;
let fail = 0;
const step = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${label}\n       ${e.message}`);
    fail++;
  }
};

console.log("\n[1] 스키마 적용 (두 번 실행해도 안전한지 포함)");
await step("db/schema.sql 1회차", async () => {
  await db.exec(fs.readFileSync("db/schema.sql", "utf8"));
});
await step("db/schema.sql 2회차 (idempotent)", async () => {
  await db.exec(fs.readFileSync("db/schema.sql", "utf8"));
});
await step("overhaul_task.statement_item_id 컬럼 존재", async () => {
  const r = await db.query(
    `select 1 from information_schema.columns
      where table_name='overhaul_task' and column_name='statement_item_id'`,
  );
  if (!r.rows.length) throw new Error("컬럼이 없다");
});

// ── 최소한의 시드: 회차 1건, 내역서 1건+항목 1건, 작업 1건, 실적 1건 ──────
console.log("\n[2] 시드 데이터");
let projectId, statementId, itemId, taskId, planId;
await step("회차 · 계획 · 내역서 · 작업 · 실적 생성", async () => {
  projectId = (
    await db.query(
      `insert into overhaul_project (name, plant, unit, start_date, end_date)
       values ('smoke', 'p', '1호기', '2026-01-01', '2026-01-30') returning id`,
    )
  ).rows[0].id;

  planId = (
    await db.query(
      `insert into maintenance_plan (name, field, cycle_kind, cycle_years, method, last_done_year)
       values ('발전기 점검', '전기', 'fixed', 2, 'O/H', 2024) returning id`,
    )
  ).rows[0].id;
  await db.query(`insert into maintenance_plan_grade (plan_id, year, grade) values ($1, 2026, 'A')`, [planId]);

  statementId = (
    await db.query(
      `insert into design_statement (target_year, field, title, item_count)
       values (2026, '전기', 't', 1) returning id`,
    )
  ).rows[0].id;
  itemId = (
    await db.query(
      `insert into design_statement_item (statement_id, plan_id, category, seq, name, spec, qty, unit)
       values ($1, $2, '1. 발전설비', 1, '발전기 점검', 'spec', 1, 'EA') returning id`,
      [statementId, itemId ?? null].slice(0, 2),
    )
  ).rows[0].id;

  taskId = (
    await db.query(
      `insert into overhaul_task
         (project_id, name, spec, unit, plan_qty, done_qty, field, equipment_type,
          plan_start, plan_end, statement_item_id)
       values ($1,'발전기 점검','spec','EA',10,10,'전기','발전기','2026-01-05','2026-01-10',$2)
       returning id`,
      [projectId, itemId],
    )
  ).rows[0].id;

  await db.query(
    `insert into overhaul_entry (task_id, entry_date, done_qty, work_detail, photo_before)
     values ($1, '2026-01-06', 10, '작업함', 'data:image/png;base64,AAAA')`,
    [taskId],
  );
});

// ── 이번에 새로 쓰거나 고친 질의들 ────────────────────────────────────────
console.log("\n[3] 새/변경 질의");

await step("listProjects", () =>
  db.query(`select id, name, plant, unit, start_date::text, end_date::text
              from overhaul_project order by start_date desc nulls last, created_at desc`));

await step("TASK_COLUMNS (listAllTasks)", () =>
  db.query(
    `select id, source_id, equipment_id, name, spec, unit,
            plan_qty::float8 as plan_qty, done_qty::float8 as done_qty,
            field, equipment_type, tag, status, assignee,
            plan_start::text, plan_end::text, needs_review, sheet_name, row_index,
            statement_item_id
       from overhaul_task where project_id = $1`,
    [projectId],
  ));

await step("listTasks + needsReview 필터", () =>
  db.query(
    `select count(*)::int as n from overhaul_task
      where project_id = $1 and field = $2 and needs_review = true`,
    [projectId, "전기"],
  ));

await step("updateTask (부분 수정)", () =>
  db.query(`update overhaul_task set plan_start = $1, plan_end = $2 where id = $3`,
    [null, null, taskId]));

await step("listTaskOptions (q + limit)", () =>
  db.query(
    `select id, name, equipment_type from overhaul_task
      where project_id = $1 and (name ilike '%' || $2 || '%' or spec ilike '%' || $2 || '%')
      order by sheet_name nulls last, row_index nulls last limit $3`,
    [projectId, "발전", 300],
  ));

await step("listAllEntriesForProject (사진은 표시만)", async () => {
  const r = await db.query(
    `select o.id, o.task_id, o.entry_date::text, o.done_qty::float8 as done_qty,
            o.work_detail, o.delay_reason, o.next_plan,
            case when o.photo_before is null then null else '1' end as photo_before,
            case when o.photo_after  is null then null else '1' end as photo_after
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
      order by o.task_id, o.entry_date desc`,
    [projectId],
  );
  if (r.rows[0].photo_before !== "1") throw new Error("사진 있음 표시가 안 된다");
});

await step("listPhotoEntries 집계", async () => {
  const r = await db.query(
    `select count(*)::int as n,
            count(distinct o.task_id)::int as tasks,
            (sum((o.photo_before is not null)::int) + sum((o.photo_after is not null)::int))::int as photos
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
        and (o.photo_before is not null or o.photo_after is not null)`,
    [projectId],
  );
  if (r.rows[0].photos !== 1) throw new Error(`사진 수가 틀리다: ${r.rows[0].photos}`);
});

await step("listPhotoEntries 목록", () =>
  db.query(
    `select o.task_id, t.name as task_name, t.equipment_type, t.field,
            o.entry_date::text,
            (o.photo_before is not null) as has_before,
            (o.photo_after  is not null) as has_after,
            o.work_detail
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
        and (o.photo_before is not null or o.photo_after is not null)
      order by o.entry_date desc, t.name limit 24 offset 0`,
    [projectId],
  ));

await step("getEntryPhoto", () =>
  db.query(`select photo_before as photo from overhaul_entry where task_id = $1 and entry_date = $2`,
    [taskId, "2026-01-06"]));

await step("listJudgedPlans (분야 필터)", async () => {
  const r = await db.query(
    `select p.id, p.category, p.sub_category, p.name, p.tag_no, p.maker, p.spec, p.field,
            p.cycle_raw, p.cycle_years, p.cycle_kind, p.cycle_options,
            p.patrol_cycle, p.method, p.completion, p.last_done_year, p.sheet_name,
            (select max(r.done_year) from maintenance_record r
              where r.plan_id = p.id and r.done_year < $1 and r.status = 'done') as recorded_year,
            (select g.grade from maintenance_plan_grade g
              where g.plan_id = p.id and g.year = $1) as planned_grade
       from maintenance_plan p
      where p.is_active and p.field = $2
      order by p.sheet_name, p.row_index`,
    [2026, "전기"],
  );
  if (r.rows.length !== 1) throw new Error(`분야 필터 결과가 ${r.rows.length}건`);
});

await step("listPlanFields", async () => {
  const r = await db.query(
    `select distinct field from maintenance_plan
      where is_active and field is not null and btrim(field) <> '' order by field`,
  );
  if (r.rows[0].field !== "전기") throw new Error("분야 목록이 틀리다");
});

await step("suggestReconciliation (중첩 lateral: 항목ID 연결 → 이름 추정)", async () => {
  const r = await db.query(
    `select i.id as item_id, i.plan_id, i.name, i.spec, i.grade, i.classification,
            lt.name as linked_name,
            lt.plan_qty::float8 as linked_plan_qty,
            lt.done_qty::float8 as linked_done_qty,
            lt.plan_start::text as linked_plan_start,
            lt.plan_end::text   as linked_plan_end,
            gt.name as guess_name,
            gt.plan_qty::float8 as guess_plan_qty,
            gt.done_qty::float8 as guess_done_qty,
            r.status as existing_status
       from design_statement_item i
       left join lateral (
         select name, plan_qty, done_qty, plan_start, plan_end
           from overhaul_task
          where statement_item_id = i.id
          order by done_qty desc
          limit 1
       ) lt on true
       left join lateral (
         select name, plan_qty, done_qty
           from overhaul_task
          where lt.name is null
            and similarity(name, i.name) > 0.35
          order by similarity(name, i.name) desc
          limit 1
       ) gt on true
       left join maintenance_record r on r.plan_id = i.plan_id and r.done_year = $2
      where i.statement_id = $1
      order by i.category nulls last, i.seq`,
    [statementId, 2026],
  );
  const row = r.rows[0];
  if (!row) throw new Error("결과 없음");
  if (row.linked_name !== "발전기 점검") throw new Error("항목ID 연결이 안 잡힌다");
  if (row.guess_name !== null) throw new Error("연결이 있는데 이름 추정도 돌았다");
});

await step("backfillStatementSchedule (일정 되돌려 적기)", async () => {
  await db.query(
    `update design_statement_item
        set plan_start = coalesce($2, plan_start),
            plan_end   = coalesce($3, plan_end)
      where id = $1`,
    [itemId, "2026-01-05", "2026-01-10"],
  );
  const r = await db.query(`select plan_start::text, plan_end::text from design_statement_item where id = $1`, [itemId]);
  if (r.rows[0].plan_start !== "2026-01-05") throw new Error("일정이 안 적혔다");
});

await step("reconcileStatement (project_id 포함)", async () => {
  await db.query(
    `insert into maintenance_record (plan_id, done_year, grade, status, project_id, note)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (plan_id, done_year) do update
       set grade = excluded.grade, status = excluded.status,
           project_id = excluded.project_id, note = excluded.note`,
    [planId, 2026, "A", "done", projectId, null],
  );
  const r = await db.query(`select project_id from maintenance_record where plan_id = $1`, [planId]);
  if (r.rows[0].project_id !== projectId) throw new Error("회차가 안 남았다");
});

await step("getDesignStatement 항목 조회", () =>
  db.query(
    `select id, plan_id, category, seq, name, spec, qty::float8 as qty, unit,
            plan_start::text, plan_end::text, grade, note, classification
       from design_statement_item where statement_id = $1 order by category nulls last, seq`,
    [statementId],
  ));

await step("deleteProject 연쇄 삭제 (작업·실적 함께)", async () => {
  await db.query(`delete from overhaul_project where id = $1`, [projectId]);
  const t = await db.query(`select count(*)::int as n from overhaul_task`);
  const e = await db.query(`select count(*)::int as n from overhaul_entry`);
  if (t.rows[0].n !== 0 || e.rows[0].n !== 0) throw new Error("연쇄 삭제가 안 됐다");
  // 내역서·보수이력은 회차와 무관하게 남아야 한다
  const s = await db.query(`select count(*)::int as n from design_statement_item`);
  const m = await db.query(`select count(*)::int as n from maintenance_record`);
  if (s.rows[0].n !== 1) throw new Error("내역서 항목이 같이 지워졌다");
  if (m.rows[0].n !== 1) throw new Error("보수 이력이 같이 지워졌다");
});

console.log("\n[4] 이번에 고친 동작");

await step("누적수량 정정 — 최댓값이 아니라 최신 기록", async () => {
  const pid = (await db.query(
    `insert into overhaul_project (name) values ('correct') returning id`)).rows[0].id;
  const tid = (await db.query(
    `insert into overhaul_task (project_id, name, unit, plan_qty) values ($1,'t','EA',100) returning id`,
    [pid])).rows[0].id;
  const recompute = () => db.query(
    `update overhaul_task
        set done_qty = coalesce((select done_qty from overhaul_entry
                                  where task_id = $1 order by entry_date desc limit 1), 0)
      where id = $1`, [tid]);

  // 1/5에 100을 잘못 넣고 → 1/6에 10으로 정정
  await db.query(`insert into overhaul_entry (task_id, entry_date, done_qty) values ($1,'2026-01-05',100)`, [tid]);
  await recompute();
  await db.query(`insert into overhaul_entry (task_id, entry_date, done_qty) values ($1,'2026-01-06',10)`, [tid]);
  await recompute();
  const r = await db.query(`select done_qty::float8 as q from overhaul_task where id = $1`, [tid]);
  if (r.rows[0].q !== 10) throw new Error(`정정이 반영되지 않았다: ${r.rows[0].q}`);

  // 정정 기록을 지우면 직전 값으로 돌아간다
  await db.query(`delete from overhaul_entry where task_id = $1 and entry_date = '2026-01-06'`, [tid]);
  await recompute();
  const r2 = await db.query(`select done_qty::float8 as q from overhaul_task where id = $1`, [tid]);
  if (r2.rows[0].q !== 100) throw new Error(`삭제 후 복원이 안 된다: ${r2.rows[0].q}`);
  await db.query(`delete from overhaul_project where id = $1`, [pid]);
});

await step("사진 유지 — 메모만 고쳐도 사진이 남는다", async () => {
  const pid = (await db.query(
    `insert into overhaul_project (name) values ('photo') returning id`)).rows[0].id;
  const tid = (await db.query(
    `insert into overhaul_task (project_id, name, unit, plan_qty) values ($1,'t','EA',10) returning id`,
    [pid])).rows[0].id;

  const save = (qty, memo, touchBefore, before) => db.query(
    `insert into overhaul_entry (task_id, entry_date, done_qty, work_detail, photo_before)
     values ($1,'2026-02-01',$2,$3,$4)
     on conflict (task_id, entry_date) do update
       set done_qty = excluded.done_qty,
           work_detail = excluded.work_detail,
           photo_before = case when $5 then excluded.photo_before
                               else overhaul_entry.photo_before end`,
    [tid, qty, memo, before, touchBefore]);

  await save(5, "1차", true, "data:image/jpeg;base64,AAA");   // 사진과 함께 저장
  await save(7, "메모만 수정", false, null);                    // 사진은 안 보냄 → 유지되어야 함
  const r = await db.query(`select photo_before, work_detail from overhaul_entry where task_id = $1`, [tid]);
  if (!r.rows[0].photo_before) throw new Error("사진이 날아갔다");
  if (r.rows[0].work_detail !== "메모만 수정") throw new Error("메모가 안 바뀌었다");

  await save(7, "사진 삭제", true, null);                       // 명시적으로 null → 지워야 함
  const r2 = await db.query(`select photo_before from overhaul_entry where task_id = $1`, [tid]);
  if (r2.rows[0].photo_before !== null) throw new Error("사진이 안 지워졌다");
  await db.query(`delete from overhaul_project where id = $1`, [pid]);
});

await step("이력 반영 후보를 다른 회차에서 찾지 않는다", async () => {
  const a = (await db.query(`insert into overhaul_project (name) values ('2026') returning id`)).rows[0].id;
  const b = (await db.query(`insert into overhaul_project (name) values ('2027') returning id`)).rows[0].id;
  const st = (await db.query(
    `insert into design_statement (target_year, title, item_count) values (2026,'t',1) returning id`)).rows[0].id;
  await db.query(
    `insert into design_statement_item (statement_id, category, seq, name, qty, unit)
     values ($1,'c',1,'터빈 블레이드 교체',1,'EA')`, [st]);
  // 이름이 똑같은 작업을 "다른 회차"에만 만든다
  await db.query(
    `insert into overhaul_task (project_id, name, unit, plan_qty, done_qty)
     values ($1,'터빈 블레이드 교체','EA',1,1)`, [b]);

  const r = await db.query(
    `select gt.name as guess_name
       from design_statement_item i
       left join lateral (
         select name from overhaul_task
          where statement_item_id = i.id and project_id = $2 limit 1
       ) lt on true
       left join lateral (
         select name from overhaul_task
          where lt.name is null and project_id = $2
            and similarity(name, i.name) > 0.35
          order by similarity(name, i.name) desc limit 1
       ) gt on true
      where i.statement_id = $1`, [st, a]);
  if (r.rows[0].guess_name !== null) {
    throw new Error(`다른 회차 작업이 후보로 잡혔다: ${r.rows[0].guess_name}`);
  }
  await db.query(`delete from overhaul_project where id in ($1,$2)`, [a, b]);
});

console.log(`\n결과: ${pass} ok, ${fail} fail\n`);
await db.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
