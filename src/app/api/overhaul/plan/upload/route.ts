import { NextResponse } from "next/server";
import { parseMaintenancePlan } from "@/modules/overhaul/lib/maintenancePlanParser";
import { saveParsedPlan } from "@/modules/overhaul/lib/maintenanceRepo";
import { resolveBranchFromRequest } from "@/modules/overhaul/lib/activeBranch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 설비별 중장기 유지보수 관리계획 엑셀 업로드.
 *
 * multipart/form-data
 *   file    (필수) 계획 엑셀
 *   field   (선택) 기계 / 전기 / 제어 — 이 파일이 담당하는 분야
 *   dryRun  (선택) "1"이면 분석만 하고 저장하지 않는다 (미리보기용)
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const fieldRaw = String(form.get("field") ?? "").trim();
    const field = fieldRaw && fieldRaw !== "자동" ? fieldRaw : null;
    const dryRun = String(form.get("dryRun") ?? "") === "1";
    const thisYear = new Date().getFullYear();

    // 계획은 지사 소속이다 — 지사를 안 고르고 저장하면 어느 지사에서도 안 보인다
    const branch = await resolveBranchFromRequest(req);
    if (!dryRun && !branch) {
      return NextResponse.json(
        { ok: false, error: "지사를 먼저 선택하세요." },
        { status: 400 },
      );
    }

    const results = [];
    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = parseMaintenancePlan(buf, file.name, thisYear);

      let sourceId: string | null = null;
      if (!dryRun) {
        const saved = await saveParsedPlan({
          fileName: file.name,
          field,
          branch,
          sheetCount: parsed.sheetCount,
          items: parsed.items,
        });
        sourceId = saved.sourceId;
      }

      results.push({
        sourceId,
        fileName: parsed.fileName,
        sheetCount: parsed.sheetCount,
        parsedSheets: parsed.parsedSheets,
        skippedSheets: parsed.skippedSheets,
        itemCount: parsed.items.length,
        byMethod: parsed.byMethod,
        byCycleKind: parsed.byCycleKind,
        sample: parsed.items.slice(0, 20).map((i) => ({
          category: i.category,
          name: i.name,
          tagNo: i.tagNo,
          spec: i.spec,
          cycleRaw: i.cycleRaw,
          cycleKind: i.cycle.kind,
          cycleYears: i.cycle.years ?? null,
          method: i.method,
          lastDoneYear: i.lastDoneYear,
          gradeCount: i.grades.length,
        })),
      });
    }

    return NextResponse.json({ ok: true, dryRun, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
