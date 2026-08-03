import { NextResponse } from "next/server";
import { analyzeWorkbook } from "@/modules/overhaul/lib/excelParser";
import { getOrCreateProject, saveAnalysis } from "@/modules/overhaul/lib/repo";

export const dynamic = "force-dynamic";
// 64개 시트짜리 내역서는 파싱에 시간이 걸린다.
export const maxDuration = 60;

/**
 * 설계내역서 엑셀 업로드 → 작업항목 자동 추출 → DB 적재.
 *
 * multipart/form-data
 *   file       (필수, 여러 개 가능)
 *   fieldHint  (선택) 자동 / 기계 / 전기 / 제어 — 업로드 시 사용자가 지정한 분야
 *   dryRun     (선택) "1"이면 분석만 하고 저장하지 않는다 (미리보기용)
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }

    const fieldHintRaw = String(form.get("fieldHint") ?? "").trim();
    const fieldHint = fieldHintRaw && fieldHintRaw !== "자동" ? fieldHintRaw : null;
    const dryRun = String(form.get("dryRun") ?? "") === "1";

    const project = await getOrCreateProject();
    const results = [];

    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const analysis = analyzeWorkbook(buf, file.name);

      // 업로드 시 분야를 지정했으면 파서의 자동 분류보다 우선한다.
      if (fieldHint) for (const t of analysis.tasks) t.field = fieldHint;

      let sourceId: string | null = null;
      if (!dryRun) {
        const saved = await saveAnalysis({
          projectId: project.id,
          fileName: file.name,
          fieldHint,
          tasks: analysis.tasks,
        });
        sourceId = saved.sourceId;
      }

      results.push({
        sourceId,
        fileName: analysis.fileName,
        sheetCount: analysis.sheetCount,
        totalRows: analysis.totalRows,
        extractedCount: analysis.extractedCount,
        excludedCount: analysis.excludedCount,
        needVerifyCount: analysis.needVerify.length,
        byField: analysis.byField,
        byEquipment: analysis.byEquipment,
        // 미리보기용 상위 20건만. 전체는 저장 후 작업 관리 화면에서 본다.
        sample: analysis.tasks.slice(0, 20),
      });
    }

    return NextResponse.json({ ok: true, dryRun, projectId: project.id, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
