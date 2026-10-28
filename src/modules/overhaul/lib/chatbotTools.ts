// 따소미 챗봇의 "시스템 전체 조회" 도구 모음 — 서버 전용(route handler에서만 import).
//
// GPT가 필요할 때 스스로 호출하는 읽기 전용 함수들이다. 쓰기(insert/update/delete)는
// 어떤 도구에도 없다 — 챗봇은 조회만 한다는 원칙(chatbotRules.ts MUTATION_RE)과 같은 이유.
//
// 숫자·판정을 새로 계산하지 않는다: DB에 저장된 값을 요약해 돌려줄 뿐이고,
// 해석은 GPT가 "데이터에 있는 값만 사용"하는 지시(route.ts SYSTEM_INSTRUCTIONS) 아래에서 한다.
//
// 지사(branch) 범위: 호출자(route.ts)가 oh_branch 쿠키를 풀어 branch를 넘겨주면
// 지사 데이터만, 선택 전(null)이면 전 지사를 조회한다.
import type OpenAI from "openai";
import { query } from "@/shared/lib/db";
import { listIssues, countByStatus } from "@/modules/status/lib/repo";

const MAX_ROWS = 10;
const MAX_TEXT = 300;

function clampLimit(v: unknown, fallback = 5): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
  return Math.max(1, Math.min(MAX_ROWS, n));
}

function shortText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t;
}

function keywordOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= 80 ? t : null;
}

// ---------------------------------------------------------------------------
// 1) 고장이력 (failure_history — 메인 DB)
// ---------------------------------------------------------------------------

async function searchFailureHistory(args: Record<string, unknown>, branch: string | null) {
  const keyword = keywordOf(args.keyword);
  const status = args.status === "조치중" || args.status === "조치완료" ? (args.status as string) : null;
  const limit = clampLimit(args.limit);

  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    conds.push(cond.replace("$#", `$${params.length}`));
  };
  if (branch) add("branch = $#", branch);
  if (status) add("status = $#", status);
  if (keyword) {
    params.push(`%${keyword}%`);
    const p = `$${params.length}`;
    conds.push(
      `(title ilike ${p} or equipment_name ilike ${p} or device_name ilike ${p}
        or heat_facility ilike ${p} or situation ilike ${p} or content_summary ilike ${p})`,
    );
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";

  const rows = await query<Record<string, unknown>>(
    `select title, branch, heat_facility, equipment_name, device_name, failure_field, status,
            occurred_at, recovered_at, situation, cause_4m1e, emergency_action,
            recovery_detail, recurrence_prevention, content_summary
       from failure_history ${where}
      order by occurred_at desc nulls last, created_at desc
      limit ${limit}`,
    params,
  );
  const total = await query<{ n: number }>(
    `select count(*)::int as n from failure_history ${where}`,
    params,
  );

  return {
    totalMatched: total[0]?.n ?? rows.length,
    shown: rows.length,
    items: rows.map((r) => ({
      ...r,
      situation: shortText(r.situation),
      cause_4m1e: shortText(r.cause_4m1e),
      emergency_action: shortText(r.emergency_action),
      recovery_detail: shortText(r.recovery_detail),
      recurrence_prevention: shortText(r.recurrence_prevention),
      content_summary: shortText(r.content_summary),
    })),
  };
}

// ---------------------------------------------------------------------------
// 2) 매뉴얼·보고서 보관함 (docgen_documents — docgen 전용 Supabase, 메타데이터만)
//    PDF 본문은 검색하지 않는다(그림 파일) — 제목·설비·고장내용 등 메타로 찾아서
//    "매뉴얼관리 > 보관함"에서 열도록 안내한다. anon 키 + RLS 전제라 읽기만 가능.
// ---------------------------------------------------------------------------

async function searchManuals(args: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_DOCGEN_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: "매뉴얼 보관함(docgen) 연결이 설정되어 있지 않습니다. 보관함 검색은 지금 불가능합니다." };
  }

  const keyword = keywordOf(args.keyword);
  const docType = args.doc_type === "manual" || args.doc_type === "fault" || args.doc_type === "report" ? (args.doc_type as string) : null;
  const limit = clampLimit(args.limit);

  const qs = new URLSearchParams();
  qs.set("select", "doc_type,title,file_name,manual_type,field,year,branch,facility,fault_content,page_count,created_at");
  qs.set("order", "created_at.desc");
  qs.set("limit", String(limit));
  if (docType) qs.set("doc_type", `eq.${docType}`);
  if (keyword) {
    // PostgREST or= 문법에서 구분자로 쓰이는 문자는 키워드에서 제거한다
    const k = keyword.replace(/[,()*"\\]/g, " ").trim();
    if (k) qs.set("or", `(title.ilike.*${k}*,file_name.ilike.*${k}*,facility.ilike.*${k}*,fault_content.ilike.*${k}*,manual_type.ilike.*${k}*)`);
  }

  const res = await fetch(`${url}/rest/v1/docgen_documents?${qs.toString()}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { error: `보관함 조회 실패 (HTTP ${res.status}) — 보관함 서버가 일시중지 상태일 수 있습니다.` };
  const rows = (await res.json()) as Record<string, unknown>[];
  return {
    shown: rows.length,
    note: "문서 열람은 화면의 '매뉴얼 관리 > 보관함'에서 제목으로 찾아 열 수 있다.",
    items: rows.map((r) => ({ ...r, fault_content: shortText(r.fault_content) })),
  };
}

// ---------------------------------------------------------------------------
// 3) 설비 마스터 + 기기 태그 (equipment / device — 메인 DB)
// ---------------------------------------------------------------------------

async function searchEquipment(args: Record<string, unknown>, branch: string | null) {
  const keyword = keywordOf(args.keyword);
  const limit = clampLimit(args.limit);
  const params: unknown[] = [branch];
  let kw = "";
  if (keyword) {
    params.push(`%${keyword}%`);
    // 태그는 하이픈·공백 표기가 흔들린다("PIT-7610"/"PIT 7610") — device.tag_norm과 같은 정규화로 비교
    params.push(`%${keyword.toUpperCase().replace(/[-_\s]/g, "")}%`);
    kw = `and (e.name ilike $2 or coalesce(e.type,'') ilike $2
          or exists (select 1 from device d where d.equipment_id = e.id
                       and (d.tag ilike $2 or d.tag_norm like $3 or coalesce(d.name,'') ilike $2)))`;
  }

  const equipment = await query<Record<string, unknown>>(
    `select e.name, e.type, e.field, e.branch, e.note,
            (select count(*) from device d where d.equipment_id = e.id)::int as device_count
       from equipment e
      where ($1::text is null or e.branch = $1) ${kw}
      order by e.name
      limit ${limit}`,
    params,
  );

  let devices: Record<string, unknown>[] = [];
  if (keyword) {
    devices = await query<Record<string, unknown>>(
      `select d.tag, d.name, d.spec, d.branch, e.name as equipment_name
         from device d
         left join equipment e on e.id = d.equipment_id
        where ($1::text is null or d.branch = $1)
          and (d.tag ilike $2 or d.tag_norm like $3 or coalesce(d.name,'') ilike $2)
        order by d.tag
        limit ${limit}`,
      params,
    );
  }
  return { equipment, devices };
}

// ---------------------------------------------------------------------------
// 4) 중장기보수계획 (maintenance_plan / maintenance_plan_grade — 메인 DB)
// ---------------------------------------------------------------------------

async function searchLongtermPlan(args: Record<string, unknown>, branch: string | null) {
  const keyword = keywordOf(args.keyword);
  const limit = clampLimit(args.limit);
  const params: unknown[] = [branch];
  let kw = "";
  if (keyword) {
    params.push(`%${keyword}%`);
    kw = `and (p.name ilike $2 or coalesce(p.tag_no,'') ilike $2 or coalesce(p.category,'') ilike $2)`;
  }

  const rows = await query<Record<string, unknown>>(
    `select p.category, p.name, p.tag_no, p.maker, p.field, p.branch,
            p.cycle_raw, p.cycle_years, p.cycle_kind, p.method, p.last_done_year, p.is_active,
            (select string_agg(g.year || ':' || g.grade, ', ' order by g.year)
               from maintenance_plan_grade g where g.plan_id = p.id) as grade_history
       from maintenance_plan p
      where ($1::text is null or p.branch = $1) ${kw}
      order by p.is_active desc, p.name
      limit ${limit}`,
    params,
  );
  return {
    shown: rows.length,
    note: "grade_history는 '연도:등급'(A=강, C=약) 원본 이력이고, 다음 보수년도 판정은 화면(설비관리 > 중장기보수계획)의 판정 로직을 따른다 — 여기 값으로 새 판정을 만들지 말 것.",
    items: rows,
  };
}

// ---------------------------------------------------------------------------
// 5) 현황관리 이슈 (status_issue — 메인 DB)
// ---------------------------------------------------------------------------

async function listStatusIssuesTool(args: Record<string, unknown>, branch: string | null) {
  const keyword = keywordOf(args.keyword);
  const status =
    typeof args.status === "string" && ["미완료", "조치중", "추후 조치 예정", "조치완료"].includes(args.status)
      ? args.status
      : undefined;
  const limit = clampLimit(args.limit);

  const filter = { branch: branch ?? undefined, status, q: keyword ?? undefined };
  const [rows, counts] = await Promise.all([listIssues(filter, limit, "priority"), countByStatus(filter)]);
  return {
    countsByStatus: counts,
    shown: rows.length,
    items: rows.map((r) => ({
      equipment_name: r.equipment_name,
      content: shortText(r.content),
      department: r.department,
      reporter: r.reporter,
      status: r.status,
      action_note: shortText(r.action_note),
      scheduled_date: r.scheduled_date,
      branch: r.branch,
      created_at: r.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// OpenAI Responses API용 도구 정의 + 디스패처
// ---------------------------------------------------------------------------

export const CHATBOT_TOOL_DEFS: OpenAI.Responses.Tool[] = [
  {
    type: "function" as const,
    strict: false,
    name: "search_failure_history",
    description:
      "고장이력을 검색한다. 설비명·기기명·고장내용 키워드와 상태(조치중/조치완료)로 거를 수 있고 최근 발생순으로 돌려준다. 고장 원인·조치내용·재발방지 대책 질문에 사용.",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "설비명·기기명·고장내용 검색어 (예: SFC, 펌프)" },
        status: { type: "string", enum: ["조치중", "조치완료"], description: "상태 필터 (생략하면 전체)" },
        limit: { type: "number", description: "최대 건수 (기본 5, 최대 10)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    strict: false,
    name: "search_manuals",
    description:
      "매뉴얼·고장 보고서·사진대장 보관함을 검색한다(제목·설비·고장내용 메타데이터 기준). 매뉴얼이나 절차서를 찾아 달라는 질문에 사용. doc_type: manual=매뉴얼, fault=고장 보고서, report=사진대장.",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "제목·설비명·고장내용 검색어 (예: SFC)" },
        doc_type: { type: "string", enum: ["manual", "fault", "report"], description: "문서 종류 (생략하면 전체)" },
        limit: { type: "number", description: "최대 건수 (기본 5, 최대 10)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    strict: false,
    name: "search_equipment",
    description: "설비 마스터와 기기 태그를 검색한다. 설비 이름·유형·분야·지사, 기기 태그(예: PIT-7610)·사양 질문에 사용.",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "설비명·유형·기기 태그 검색어 (생략하면 설비 목록)" },
        limit: { type: "number", description: "최대 건수 (기본 5, 최대 10)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    strict: false,
    name: "search_longterm_plan",
    description: "중장기보수계획을 검색한다. 설비·기기의 점검주기, 마지막 보수년도, 연도별 보수 등급(A/B/C) 이력 질문에 사용.",
    parameters: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "기기명·태그번호·설비구분 검색어" },
        limit: { type: "number", description: "최대 건수 (기본 5, 최대 10)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    strict: false,
    name: "list_status_issues",
    description: "현황관리의 조치 필요 이슈를 본다. '조치할 거 있어?', '미완료 현황' 같은 질문에 사용. 미조치 우선으로 정렬된다.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["미완료", "조치중", "추후 조치 예정", "조치완료"], description: "상태 필터 (생략하면 전체)" },
        keyword: { type: "string", description: "설비명·내용·작성자 검색어" },
        limit: { type: "number", description: "최대 건수 (기본 5, 최대 10)" },
      },
      additionalProperties: false,
    },
  },
];

/**
 * 도구 호출 실행 — 결과는 항상 JSON 문자열(GPT에 function_call_output으로 그대로 전달).
 * 실패해도 던지지 않고 { error } 를 돌려준다: 한 도구가 죽어도 대화는 계속돼야 한다.
 */
export async function runChatbotTool(name: string, rawArgs: string, branch: string | null): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawArgs || "{}");
    if (parsed && typeof parsed === "object") args = parsed;
  } catch {
    /* 인자 파싱 실패 — 빈 인자로 진행 */
  }

  try {
    switch (name) {
      case "search_failure_history":
        return JSON.stringify(await searchFailureHistory(args, branch));
      case "search_manuals":
        return JSON.stringify(await searchManuals(args));
      case "search_equipment":
        return JSON.stringify(await searchEquipment(args, branch));
      case "search_longterm_plan":
        return JSON.stringify(await searchLongtermPlan(args, branch));
      case "list_status_issues":
        return JSON.stringify(await listStatusIssuesTool(args, branch));
      default:
        return JSON.stringify({ error: `알 수 없는 도구: ${name}` });
    }
  } catch (e) {
    // 에러 메시지에 연결 문자열 등이 섞이지 않도록 일반화한다
    console.error(`[chatbotTools] ${name} 실행 실패:`, e instanceof Error ? e.message : e);
    return JSON.stringify({ error: "조회 중 오류가 발생했습니다. 데이터 없이 답하거나 다른 도구를 시도하라." });
  }
}
