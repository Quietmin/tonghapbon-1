import { resetAllData } from "@/lib/db";

export async function POST() {
  resetAllData();
  return Response.json({ ok: true });
}
