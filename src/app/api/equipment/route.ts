import { NextResponse } from "next/server";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";
import {
  listEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentPatch,
} from "@/shared/lib/equipment";

/**
 * 설비 마스터 CRUD. 설비는 지사에 속하므로 목록·생성은 항상
 * 활성 지사(oh_branch 쿠키) 안에서만 움직인다.
 */

export const dynamic = "force-dynamic";

// 항상 모든 칸을 보내면 일부만 보낸 호출이 나머지를 지워버린다 —
// body에 실제로 들어 있는 키만 뽑는다 (project 라우트와 같은 패턴).
const PATCHABLE_FIELDS: (keyof EquipmentPatch)[] = ["name", "type", "field", "note"];

function pickPatch(body: Record<string, unknown>): EquipmentPatch {
  const patch: EquipmentPatch = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  return patch;
}

export async function GET() {
  try {
    const branch = await resolveBranch();
    if (!branch) {
      return NextResponse.json({ ok: false, error: "지사를 먼저 선택하세요." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, items: await listEquipment(branch) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const branch = await resolveBranch();
    if (!branch) {
      return NextResponse.json({ ok: false, error: "지사를 먼저 선택하세요." }, { status: 400 });
    }
    const body = await req.json();
    const created = await createEquipment({
      branch,
      name: body.name,
      type: body.type ?? null,
      field: body.field ?? null,
      note: body.note ?? null,
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) {
      return NextResponse.json({ ok: false, error: "설비 id가 없습니다." }, { status: 400 });
    }
    await updateEquipment(id, pickPatch(body.patch ?? {}));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "설비 id가 없습니다." }, { status: 400 });
    }
    const deleted = await deleteEquipment(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "설비를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
