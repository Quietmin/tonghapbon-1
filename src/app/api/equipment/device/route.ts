import { NextResponse } from "next/server";
import {
  listDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  type DevicePatch,
} from "@/shared/lib/equipment";

/**
 * 기기·태그 CRUD — 설비 마스터의 2단. 항상 설비(equipmentId) 밑에서만 움직이고,
 * 지사는 소속 설비 것을 따라가므로 여기서 따로 지사를 받지 않는다.
 */

export const dynamic = "force-dynamic";

const PATCHABLE_FIELDS: (keyof DevicePatch)[] = ["tag", "name", "spec"];

function pickPatch(body: Record<string, unknown>): DevicePatch {
  const patch: DevicePatch = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  return patch;
}

export async function GET(req: Request) {
  try {
    const equipmentId = new URL(req.url).searchParams.get("equipmentId");
    if (!equipmentId) {
      return NextResponse.json({ ok: false, error: "설비 id가 없습니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, items: await listDevices(equipmentId) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body.equipmentId !== "string" || !body.equipmentId) {
      return NextResponse.json({ ok: false, error: "설비 id가 없습니다." }, { status: 400 });
    }
    const created = await createDevice({
      equipmentId: body.equipmentId,
      tag: body.tag,
      name: body.name ?? null,
      spec: body.spec ?? null,
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
      return NextResponse.json({ ok: false, error: "기기 id가 없습니다." }, { status: 400 });
    }
    await updateDevice(id, pickPatch(body.patch ?? {}));
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
      return NextResponse.json({ ok: false, error: "기기 id가 없습니다." }, { status: 400 });
    }
    const deleted = await deleteDevice(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "기기를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
