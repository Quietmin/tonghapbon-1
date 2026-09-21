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
await step("overhaul_entry_photo 테이블 존재 · 옛 사진 컬럼은 사라졌다", async () => {
  const t = await db.query(
    `select 1 from information_schema.tables where table_name='overhaul_entry_photo'`);
  if (!t.rows.length) throw new Error("사진 테이블이 없다");
  const c = await db.query(
    `select column_name from information_schema.columns
      where table_name='overhaul_entry' and column_name in ('photo_before','photo_after')`);
  if (c.rows.length) throw new Error("옛 사진 컬럼이 남아 있다: " + c.rows.map(r => r.column_name).join(","));
});
await step("지사(branch) 컬럼 — 회차·계획·계획파일·산출서 네 곳 모두", async () => {
  const r = await db.query(
    `select table_name from information_schema.columns
      where column_name='branch'
        and table_name in ('overhaul_project','maintenance_plan','maintenance_plan_source','design_statement')`);
  const found = r.rows.map((x) => x.table_name).sort();
  if (found.length !== 4) throw new Error("branch 컬럼이 빠진 테이블이 있다. 있는 곳: " + found.join(","));
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

  const entryId = (
    await db.query(
      `insert into overhaul_entry (task_id, entry_date, done_qty, work_detail)
       values ($1, '2026-01-06', 10, '작업함') returning id`,
      [taskId],
    )
  ).rows[0].id;
  await db.query(
    `insert into overhaul_entry_photo (entry_id, slot, seq, data)
     values ($1,'before',1,'data:image/png;base64,AAAA')`,
    [entryId],
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

await step("listAllEntriesForProject (사진은 참조만)", async () => {
  const r = await db.query(
    `select o.id, o.task_id, o.entry_date::text, o.done_qty::float8 as done_qty,
            o.work_detail, o.delay_reason, o.next_plan,
            coalesce((
              select json_agg(json_build_object('id', p.id, 'slot', p.slot, 'seq', p.seq)
                              order by p.slot, p.seq, p.id)
                from overhaul_entry_photo p where p.entry_id = o.id
            ), '[]'::json) as photos
       from overhaul_entry o
       join overhaul_task t on t.id = o.task_id
      where t.project_id = $1
      order by o.task_id, o.entry_date desc`,
    [projectId],
  );
  const photos = r.rows[0].photos;
  if (!Array.isArray(photos) || photos.length !== 1) throw new Error("사진 참조가 안 나온다: " + JSON.stringify(photos));
  if (photos[0].slot !== "before") throw new Error("slot이 틀리다");
  if (JSON.stringify(photos[0]).includes("base64")) throw new Error("이미지 데이터가 섞여 나온다");
});

await step("사진 여러 장 · 순서 · 삭제", async () => {
  const e = (await db.query(`select id from overhaul_entry where task_id = $1`, [taskId])).rows[0].id;
  // 같은 slot에 여러 장
  for (const n of [2, 3]) {
    await db.query(
      `insert into overhaul_entry_photo (entry_id, slot, seq, data) values ($1,'before',$2,$3)`,
      [e, n, `data:image/png;base64,B${n}`]);
  }
  await db.query(
    `insert into overhaul_entry_photo (entry_id, slot, seq, data) values ($1,'after',1,'data:image/png;base64,A1')`,
    [e]);

  const all = await db.query(
    `select id, slot, seq from overhaul_entry_photo where entry_id = $1 order by slot, seq`, [e]);
  if (all.rows.length !== 4) throw new Error(`4장이어야 하는데 ${all.rows.length}장`);
  if (all.rows.filter(r => r.slot === "before").length !== 3) throw new Error("분해 전이 3장이 아니다");

  // keepIds 방식: 남길 것만 지목하면 나머지가 지워진다
  const keep = all.rows.filter(r => r.slot === "before").slice(0, 1).map(r => r.id);
  await db.query(
    `delete from overhaul_entry_photo where entry_id = $1 and id <> all($2::bigint[])`, [e, keep]);
  const left = await db.query(`select id from overhaul_entry_photo where entry_id = $1`, [e]);
  if (left.rows.length !== 1) throw new Error(`1장 남아야 하는데 ${left.rows.length}장`);

  // 빈 배열이면 전부 지워진다
  await db.query(
    `delete from overhaul_entry_photo where entry_id = $1 and id <> all($2::bigint[])`, [e, []]);
  const none = await db.query(`select id from overhaul_entry_photo where entry_id = $1`, [e]);
  if (none.rows.length !== 0) throw new Error("전부 지워지지 않았다");

  // 되돌려 놓는다 (뒤 검증이 쓴다)
  await db.query(
    `insert into overhaul_entry_photo (entry_id, slot, seq, data) values ($1,'before',1,'data:image/png;base64,AAAA')`,
    [e]);
});

await step("getPhotoById", async () => {
  const id = (await db.query(`select id from overhaul_entry_photo limit 1`)).rows[0].id;
  const r = await db.query(`select data from overhaul_entry_photo where id = $1`, [id]);
  if (!r.rows[0].data.startsWith("data:image/")) throw new Error("사진을 못 꺼낸다");
});

await step("실적을 지우면 사진도 함께 지워진다", async () => {
  const before = (await db.query(`select count(*)::int as n from overhaul_entry_photo`)).rows[0].n;
  if (before === 0) throw new Error("검증할 사진이 없다");
  await db.query(`delete from overhaul_entry where task_id = $1 and entry_date = '2026-01-06'`, [taskId]);
  const after = (await db.query(`select count(*)::int as n from overhaul_entry_photo`)).rows[0].n;
  if (after !== 0) throw new Error(`사진이 남았다: ${after}장`);
  // 되돌려 놓는다
  const e = (await db.query(
    `insert into overhaul_entry (task_id, entry_date, done_qty) values ($1,'2026-01-06',10) returning id`,
    [taskId])).rows[0].id;
  await db.query(
    `insert into overhaul_entry_photo (entry_id, slot, seq, data) values ($1,'before',1,'data:image/png;base64,AAAA')`,
    [e]);
});

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

  // 실적 저장 (사진 지시 없음 → 사진에 손대지 않는다)
  const upsert = (qty, memo) => db.query(
    `insert into overhaul_entry (task_id, entry_date, done_qty, work_detail)
     values ($1,'2026-02-01',$2,$3)
     on conflict (task_id, entry_date) do update
       set done_qty = excluded.done_qty, work_detail = excluded.work_detail
     returning id`, [tid, qty, memo]);

  const e = (await upsert(5, "1차")).rows[0].id;
  await db.query(
    `insert into overhaul_entry_photo (entry_id, slot, seq, data)
     values ($1,'before',1,'data:image/jpeg;base64,AAA'), ($1,'before',2,'data:image/jpeg;base64,BBB')`,
    [e]);

  await upsert(7, "메모만 수정");   // 사진 지시를 안 보낸 상황
  const kept = await db.query(`select count(*)::int as n from overhaul_entry_photo where entry_id = $1`, [e]);
  if (kept.rows[0].n !== 2) throw new Error(`사진이 날아갔다: ${kept.rows[0].n}장`);
  const memo = await db.query(`select work_detail from overhaul_entry where id = $1`, [e]);
  if (memo.rows[0].work_detail !== "메모만 수정") throw new Error("메모가 안 바뀌었다");

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

await step("지사 분리 — 회차·설비가 지사별로만 보인다", async () => {
  const ys = (await db.query(
    `insert into overhaul_project (name, branch) values ('양산 회차','양산지사') returning id`)).rows[0].id;
  const dg = (await db.query(
    `insert into overhaul_project (name, branch) values ('대구 회차','대구지사') returning id`)).rows[0].id;

  const projs = await db.query(
    `select id from overhaul_project where branch = $1
      order by start_date desc nulls last, created_at desc`, ["양산지사"]);
  if (projs.rows.length !== 1 || projs.rows[0].id !== ys) throw new Error("회차 지사 필터가 틀리다");

  await db.query(
    `insert into maintenance_plan (name, field, branch, cycle_kind) values ('양산 설비','기계','양산지사','none')`);
  await db.query(
    `insert into maintenance_plan (name, field, branch, cycle_kind) values ('대구 설비','기계','대구지사','none')`);
  const plans = await db.query(
    `select name from maintenance_plan p where p.is_active and p.branch = $1`, ["대구지사"]);
  if (plans.rows.length !== 1 || plans.rows[0].name !== "대구 설비") throw new Error("설비 지사 필터가 틀리다");

  // 매트릭스의 등급 조회도 지사 조인으로 좁혀진다
  const grades = await db.query(
    `select t.plan_id from maintenance_plan_grade t
       join maintenance_plan p on p.id = t.plan_id and p.branch = $1`, ["대구지사"]);
  if (grades.rows.length !== 0) throw new Error("남의 지사 등급이 섞여 나온다");

  await db.query(`delete from overhaul_project where id in ($1,$2)`, [ys, dg]);
  await db.query(`delete from maintenance_plan where name in ('양산 설비','대구 설비')`);
});

console.log(`\n결과: ${pass} ok, ${fail} fail\n`);
await db.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
