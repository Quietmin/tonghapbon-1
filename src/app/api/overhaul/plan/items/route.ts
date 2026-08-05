import { NextResponse } from "next/server";
import {
  createManualPlanItem,
  updatePlanItem,
  setPlanItemActive,
  type PlanItemInput,
} from "@/modules/overhaul/lib/maintenanceRepo";

export const dynamic = "force-dynamic";

/** POST — 엑셀에 없던 설비를 손으로 추가한다. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlanItemInput;
    const created = await createManualPlanItem(body);
    return NextResponse.json({ ok: true, ...created });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/**
 * PATCH — 기존 설비를 고치거나 사용중지 상태를 바꾼다.
 * body: { id, patch?: PlanItemInput, isActive?: boolean }
 * patch와 isActive는 각각 독립적으로 보낼 수 있다.
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id: string;
      patch?: PlanItemInput;
      isActive?: boolean;
    };
    if (!body.id) throw new Error("id가 없습니다.");

    if (body.patch) await updatePlanItem(body.id, body.patch);
    if (typeof body.isActive === "boolean") await setPlanItemActive(body.id, body.isActive);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
