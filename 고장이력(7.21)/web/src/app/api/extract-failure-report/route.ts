import { PDFParse } from "pdf-parse";
import { parseFailureReportText } from "@/lib/parseFailureReport";
import { saveUploadedFile } from "@/lib/db";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB, matches the upload UI copy
const ALLOWED_EXTENSIONS = ["pdf", "hwp", "hwpx"];

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "파일이 첨부되지 않았습니다." }, { status: 400 });
  }

  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return Response.json(
      { error: "엑셀, 한글(HWP), PDF 파일만 업로드할 수 있습니다." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "파일 용량은 최대 20MB까지 지원합니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedName = saveUploadedFile(buffer, file.name);
  const attachment = { fileName: file.name, storedName };

  if (extension === "hwp" || extension === "hwpx") {
    // TODO(PRD 3.6.3 / open issue): no reliable pure-JS HWP text extractor evaluated yet.
    // The file is still accepted so it can be attached, but fields must be entered manually.
    return Response.json({
      fields: {},
      attachment,
      warning: "한글(HWP) 파일은 아직 자동 추출을 지원하지 않습니다. 파일은 첨부되며, 항목은 직접 입력해주세요.",
    });
  }

  let text: string;
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error("PDF parse failed", error);
    return Response.json(
      {
        error: "PDF 파일을 읽는 중 문제가 발생했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.",
        attachment,
      },
      { status: 422 },
    );
  }

  const fields = parseFailureReportText(text);
  const extractedCount = Object.values(fields).filter((v) => v && v.length > 0).length;

  return Response.json({
    fields,
    attachment,
    warning:
      extractedCount === 0
        ? "표준 양식에서 항목을 인식하지 못했습니다. 아래 내용을 직접 입력해주세요."
        : undefined,
  });
}
