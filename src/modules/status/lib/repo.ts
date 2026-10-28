import { execute, query, queryOne } from "@/shared/lib/db";
import type { IssueStatus } from "./constants";

/**
 * 현황관리 DB 계층 — SQL 은 여기에만 둔다 (다른 모듈 repo.ts 와 같은 규칙).
 * 테이블 정의는 db/schema.sql 의 status_issue.
 */

export interface StatusIssueRow {
  id: string;
  branch: string | null;
  equipment_name: string;
  content: string;
  department: string;
  reporter: string;
  status: IssueStatus;
  action_note: string | null;
  /** YYYY-MM-DD */
  scheduled_date: string | null;
  handled_by: string | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, branch, equipment_name, content, department, reporter, status,
  action_note, scheduled_date::text as scheduled_date, handled_by,
  status_updated_at, created_at, updated_at`;

export interface IssueFilter {
  branch?: string;
  status?: string;
  /** 여러 상태 중 하나(예: 조치가 필요한 미완료·조치중). status 와 함께 주면 둘 다 적용된다 */
  statuses?: string[];
  department?: string;
  /** 설비명·이슈 내용·작성자 부분검색 */
  q?: string;
}

/** 필터를 where 절로. status 는 건수 집계(countByStatus)에서 빼야 해서 따로 받는다 */
function where(f: IssueFilter, includeStatus: boolean): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    conds.push(cond.replace("$#", `$${params.length}`));
  };
  if (f.branch) add("branch = $#", f.branch);
  if (includeStatus && f.status) add("status = $#", f.status);
  if (includeStatus && f.statuses?.length) {
    const ph = f.statuses.map((s) => {
      params.push(s);
      return "$" + params.length;
    });
    conds.push(`status in (${ph.join(", ")})`);
  }
  if (f.department) add("department = $#", f.department);
  const q = f.q?.trim();
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    conds.push(`(equipment_name ilike ${p} or content ilike ${p} or reporter ilike ${p})`);
  }
  return { sql: conds.length ? `where ${conds.join(" and ")}` : "", params };
}

export type IssueSort = "priority" | "recent" | "scheduled";

const ORDER: Record<IssueSort, string> = {
  // 아직 조치가 필요한 것부터(미완료 → 조치중 → 추후 조치 예정 → 조치완료), 같은 상태 안에서는 최근 등록순
  priority: `case status when '미완료' then 0 when '조치중' then 1
                            when '추후 조치 예정' then 2 else 3 end,
                created_at desc`,
  // 상태와 무관하게 최근 등록순
  recent: "created_at desc",
  // 조치 예정일이 가까운 순(예정일이 없는 것은 뒤로)
  scheduled: "scheduled_date asc nulls last, created_at desc",
};

/** 목록 — 기본은 조치가 필요한 것부터(priority). 첫 화면 대시보드는 recent·scheduled 도 쓴다 */
export async function listIssues(
  filter: IssueFilter = {},
  limit = 300,
  sort: IssueSort = "priority",
): Promise<StatusIssueRow[]> {
  const { sql, params } = where(filter, true);
  return query<StatusIssueRow>(
    `select ${COLUMNS} from status_issue ${sql}
      order by ${ORDER[sort]}
      limit ${Math.max(1, Math.min(1000, Math.floor(limit)))}`,
    params,
  );
}

/** 상태별 건수 — 상태 필터는 빼고 나머지 조건만 적용한다(칩에 늘 전체 분포가 보이도록) */
export async function countByStatus(filter: IssueFilter = {}): Promise<Record<string, number>> {
  const { sql, params } = where(filter, false);
  const rows = await query<{ status: string; c: number }>(
    `select status, count(*)::int as c from status_issue ${sql} group by status`,
    params,
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

export interface IssueInput {
  branch: string | null;
  equipmentName: string;
  content: string;
  department: string;
  reporter: string;
}

export async function createIssue(input: IssueInput): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `insert into status_issue (branch, equipment_name, content, department, reporter)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.branch,
      input.equipmentName.trim(),
      input.content.trim(),
      input.department.trim(),
      input.reporter.trim(),
    ],
  );
  if (!row) throw new Error("현황을 저장하지 못했습니다.");
  return row;
}

export interface IssuePatch {
  status?: IssueStatus;
  actionNote?: string | null;
  /** YYYY-MM-DD, 빈 문자열·null 이면 지운다 */
  scheduledDate?: string | null;
  handledBy?: string | null;
}

/**
 * 유지보수 담당자의 갱신 — 들어온 키만 바꾼다(부분 수정). 상태가 실제로 바뀔 때만
 * status_updated_at 을 갱신해서 "마지막으로 상태가 바뀐 때"를 남긴다.
 */
export async function updateIssue(id: string, patch: IssuePatch): Promise<StatusIssueRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const add = (col: string, v: unknown, cast = "") => {
    params.push(v);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  const orNull = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };

  if (patch.status !== undefined) {
    add("status", patch.status);
    sets.push(`status_updated_at = case when status is distinct from $${params.length} then now() else status_updated_at end`);
  }
  if (patch.actionNote !== undefined) add("action_note", orNull(patch.actionNote));
  if (patch.scheduledDate !== undefined) add("scheduled_date", orNull(patch.scheduledDate), "::date");
  if (patch.handledBy !== undefined) add("handled_by", orNull(patch.handledBy));

  if (sets.length === 0) return getIssue(id);

  const n = await execute(`update status_issue set ${sets.join(", ")} where id = $1`, params);
  if (n === 0) return null;
  return getIssue(id);
}

export async function getIssue(id: string): Promise<StatusIssueRow | null> {
  return queryOne<StatusIssueRow>(`select ${COLUMNS} from status_issue where id = $1`, [id]);
}
