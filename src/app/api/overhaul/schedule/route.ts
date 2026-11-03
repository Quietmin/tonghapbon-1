import { NextResponse } from "next/server";
import { listAllTasks, listEntryRanges } from "@/modules/overhaul/lib/repo";
import { resolveProjectFromRequest } from "@/modules/overhaul/lib/activeProject";
import { taskProgress } from "@/modules/overhaul/lib/progress";
import {
  taskSchedule,
  plannedProgressOn,
  plannedOverall,
  scheduleDelayTasks,
  diffDays,
} from "@/modules/overhaul/lib/schedule";

export const dynamic = "force-dynamic";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const today = () => new Date().toISOString().slice(0, 10);

type Task = Awaited<ReturnType<typeof listAllTasks>>[number];

/** "기계공사 (가스터빈)" → "가스터빈". 괄호가 없으면 시트명 그대로 */
const sheetLabel = (s: string | null) => {
  if (!s) return "";
  const m = s.match(/\(([^)]+)\)\s*$/);
  return (m ? m[1] : s).trim();
};

/**
 * 같은 설비 묶음 안에 이름이 같은 작업이 둘 이상이면 구분 꼬리표를 만든다.
 * 예) 가스터빈 시트의 "비계 설치"와 배열회수보일러 시트의 "비계 설치"는 둘 다 "비계" 묶음에
 * 들어가 화면에서 똑같아 보인다 → "가스터빈 · 시스템비계 600㎡"처럼 출처 시트·규격을 붙인다.
 * 서로 다른 값만 쓰고(모두 같은 시트면 시트는 생략), 그래도 겹치면 순번을 붙인다.
 * 이름이 하나뿐인 작업은 꼬리표가 없다 — 화면을 어지럽히지 않게.
 */
function duplicateDetails(tasks: Task[]): Map<string, string> {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = `${t.equipment_type ?? "기타"}\u0000${t.name.replace(/\s+/g, "")}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const out = new Map<string, string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const distinct = (f: (t: Task) => string) => new Set(list.map(f)).size > 1;
    const useSheet = distinct((t) => sheetLabel(t.sheet_name));
    const useSpec = distinct((t) => (t.spec ?? "").trim());
    const labels = list.map((t) =>
      [useSheet ? sheetLabel(t.sheet_name) : "", useSpec ? (t.spec ?? "").trim() : ""].filter(Boolean).join(" · "),
    );
    const seen = new Map<string, number>();
    list.forEach((t, i) => {
      const base = labels[i];
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const clash = labels.filter((l) => l === base).length > 1;
      out.set(t.id, clash ? [base, `${n}번째`].filter(Boolean).join(" · ") : base);
    });
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const project = await resolveProjectFromRequest(req);
    const tasks = await listAllTasks(project.id);
    const ranges = await listEntryRanges(project.id);
    const rangeByTask = new Map(ranges.map((r) => [r.task_id, r]));

    const hasPeriod = Boolean(project.start_date && project.end_date);
    const total = hasPeriod ? Math.max(1, diffDays(project.start_date!, project.end_date!)) : 0;
    const todayOff = hasPeriod ? clamp(diffDays(project.start_date!, today()), 0, total) : 0;

    const risk = hasPeriod ? scheduleDelayTasks(tasks, project, today()) : [];
    const riskIds = new Set(risk.map((t) => t.id));
    const details = duplicateDetails(tasks);

    const rows = tasks.map((t) => {
      const sch = taskSchedule(t, project);
      const actual = taskProgress(t);
      const planned = plannedProgressOn(sch, today());
      const behind = riskIds.has(t.id);
      const status = actual >= 100 ? "완료" : behind ? "지연" : actual > 0 ? "진행중" : "대기";

      // 실적 바 — 실적 입력 이력의 날짜 범위(있으면), 없으면 진척률 비례(계획 시작 기준)
      const range = rangeByTask.get(t.id);
      let actualBar: {
        startOff: number;
        endOff: number;
        real: boolean;
        startStr?: string;
        endStr?: string;
      } | null = null;
      if (range) {
        const aS = clamp(diffDays(project.start_date!, range.min_date), 0, total);
        const aE = clamp(diffDays(project.start_date!, range.max_date), 0, total);
        actualBar = { startOff: aS, endOff: Math.max(aS, aE), real: true, startStr: range.min_date, endStr: range.max_date };
      } else if (actual > 0) {
        const span = Math.max(sch.endOff - sch.startOff, 1);
        actualBar = { startOff: sch.startOff, endOff: sch.startOff + Math.max(0.4, span * (actual / 100)), real: false };
      }

      return {
        id: t.id,
        name: t.name,
        /** 같은 묶음에 같은 이름이 있을 때만 — 출처 시트·규격 */
        detail: details.get(t.id) ?? null,
        unit: t.unit,
        field: t.field,
        equipment: t.equipment_type ?? "기타",
        planQty: t.plan_qty,
        doneQty: t.done_qty,
        sch,
        actual,
        planned,
        behind,
        status,
        actualBar,
      };
    });

    return NextResponse.json({
      ok: true,
      project,
      hasPeriod,
      total,
      todayOff,
      plannedPct: hasPeriod ? plannedOverall(tasks, project, today()) : 0,
      riskCount: risk.length,
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
