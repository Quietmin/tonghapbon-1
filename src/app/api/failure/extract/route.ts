import { NextResponse } from "next/server";
import { parseFailureReport } from "@/modules/failure/lib/parseFailureReport";

export const dynamic = "force-dynamic";

// base64는 원본보다 약 1.33배 커지고, Vercel 서버리스 함수의 요청 본문 한도가
// 4.5MB이므로 원본은 이 안에서 안전하게 잡는다.
const MAX_FILE_SIZE = 3 * 1024 * 1024;

/**
 * 수기 등록 화면에 PDF를 올리면 뽑아낼 수 있는 항목만 뽑아 돌려준다.
 * 못 뽑은 칸은 그대로 비워 두고(화면에서 음영으로 표시), 원본 파일은 base64로
 * 같이 돌려줘 등록 시 첨부로 붙일 수 있게 한다.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "파일이 없습니다." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "PDF 파일만 지원합니다." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: `파일이 너무 큽니다 (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB).` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fields, warning } = await parseFailureReport(buffer);

    return NextResponse.json({
      ok: true,
      fields,
      warning,
      attachment: {
        fileName: file.name,
        dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
