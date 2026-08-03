import fs from "node:fs";
import { getAttachmentById, getUploadedFilePath } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const { id } = await ctx.params;
  const attachment = getAttachmentById(Number(id));

  if (!attachment) {
    return Response.json({ error: "첨부파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const filePath = getUploadedFilePath(attachment.stored_name);
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "첨부파일이 저장소에 없습니다." }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const encodedName = encodeURIComponent(attachment.file_name);

  return new Response(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
    },
  });
}
