import { getFailureHistoryById, updateFailureHistory, type FailureHistoryInput } from "@/lib/db";

export async function PATCH(request: Request, ctx: RouteContext<"/api/failure-history/[id]">) {
  const { id } = await ctx.params;
  const failureId = Number(id);

  const existing = getFailureHistoryById(failureId);
  if (!existing) {
    return Response.json({ error: "고장이력을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await request.json()) as Partial<FailureHistoryInput>;
  if (Object.keys(body).length === 0) {
    return Response.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  updateFailureHistory(failureId, body);
  return Response.json({ ok: true });
}
