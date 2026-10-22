import { query } from "@/shared/lib/db";
import { BRANCHES } from "@/shared/lib/branches";

/**
 * 설비 마스터 첫 화면의 전 지사 개요.
 *
 * 지사마다 "가장 최근 오버홀이 어디까지 왔는지"를 한 줄로 보여준다:
 * 설비 수 · 최근 회차(이름·기간) · 최근 작업실적일 · 보수 이력 최근 연도.
 * 데이터가 하나도 없는 지사도 줄은 나온다 — 거기서 지사를 골라 시작하기 때문.
 */

export interface BranchOverviewRow {
  branch: string;
  equipmentCount: number;
  latestProject: { name: string; start_date: string | null; end_date: string | null } | null;
  /** 일일 작업실적(overhaul_entry)의 가장 최근 날짜 */
  lastEntryDate: string | null;
  /** 보수 이력(maintenance_record, status='done')의 가장 최근 연도 */
  lastDoneYear: number | null;
}

export async function listBranchOverview(): Promise<BranchOverviewRow[]> {
  const [equip, projects, entries, records] = await Promise.all([
    query<{ branch: string; n: number }>(
      `select branch, count(*)::int as n from equipment where branch is not null group by branch`,
    ),
    query<{ branch: string; name: string; start_date: string | null; end_date: string | null }>(
      `select distinct on (branch) branch, name, start_date::text, end_date::text
         from overhaul_project
        where branch is not null
        order by branch, start_date desc nulls last, created_at desc`,
    ),
    // 실적은 회차를 거쳐야 지사를 안다: entry → task → project
    query<{ branch: string; last_entry: string }>(
      `select pr.branch, max(o.entry_date)::text as last_entry
         from overhaul_entry o
         join overhaul_task t on t.id = o.task_id
         join overhaul_project pr on pr.id = t.project_id
        where pr.branch is not null
        group by pr.branch`,
    ),
    query<{ branch: string; last_done_year: number }>(
      `select p.branch, max(r.done_year)::int as last_done_year
         from maintenance_record r
         join maintenance_plan p on p.id = r.plan_id
        where r.status = 'done' and p.branch is not null
        group by p.branch`,
    ),
  ]);

  const equipMap = new Map(equip.map((r) => [r.branch, r.n]));
  const projectMap = new Map(projects.map((r) => [r.branch, r]));
  const entryMap = new Map(entries.map((r) => [r.branch, r.last_entry]));
  const recordMap = new Map(records.map((r) => [r.branch, r.last_done_year]));

  return [...BRANCHES]
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((branch) => {
      const p = projectMap.get(branch);
      return {
        branch,
        equipmentCount: equipMap.get(branch) ?? 0,
        latestProject: p ? { name: p.name, start_date: p.start_date, end_date: p.end_date } : null,
        lastEntryDate: entryMap.get(branch) ?? null,
        lastDoneYear: recordMap.get(branch) ?? null,
      };
    });
}
