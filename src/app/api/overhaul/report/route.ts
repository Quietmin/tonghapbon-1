import { NextResponse } from "next/server";
import { getOrCreateProject, listAllTasks, listAllEntriesForProject } from "@/modules/overhaul/lib/repo";
import { buildReportData } from "@/modules/overhaul/lib/report";
import { taskProgress, taskStatus } from "@/modules/overhaul/lib/progress";
import type { OverhaulEntry } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";
const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const project = await getOrCreateProject();
    const tasks = await listAllTasks(project.id);
    const entries = await listAllEntriesForProject(project.id);

    const byTask = new Map<string, OverhaulEntry[]>();
    for (const e of entries) {
      const list = byTask.get(e.task_id) ?? [];
      list.push(e);
      byTask.set(e.task_id, list);
    }

    const report = buildReportData(tasks, byTask, project, today());

    // 엑셀 내보내기용 원본 목록 — 원본 exporter.js의 컬럼 구성과 동일
    const exportRows = tasks.map((t) => ({
      id: t.id,
      field: t.field,
      equipment: t.equipment_type,
      name: t.name,
      spec: t.spec,
      tag: t.tag,
      planQty: t.plan_qty,
      doneQty: t.done_qty,
      unit: t.unit,
      progress: taskProgress(t),
      status: taskStatus(t),
      assignee: t.assignee,
      sheetName: t.sheet_name,
      rowIndex: t.row_index,
    }));

    return NextResponse.json({
      ok: true,
      project,
      hasPeriod: Boolean(project.start_date && project.end_date),
      report,
      exportRows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
