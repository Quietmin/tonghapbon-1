import { createFailureHistory, type FailureHistoryInput } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as FailureHistoryInput;

  if (!body.title?.trim() && !body.equipmentName?.trim()) {
    return Response.json(
      { error: "고장제목 또는 설비명 중 하나는 입력해야 합니다." },
      { status: 400 },
    );
  }

  const id = createFailureHistory(body);
  return Response.json({ id }, { status: 201 });
}
