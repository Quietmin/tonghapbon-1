import { NextResponse } from "next/server";
import { query, queryOne } from "@/shared/lib/db";

export const dynamic = "force-dynamic";

/**
 * DB가 살아있는지, 스키마가 제대로 올라갔는지 한눈에 보는 진단용 엔드포인트.
 * 화면을 붙이기 전에 데이터 계층만 따로 확인할 수 있어야 해서 만들었다.
 */
export async function GET() {
  try {
    const version = await queryOne<{ version: string }>("select version()");

    const tables = await query<{ table_name: string; rows: number }>(
      `select c.relname as table_name, c.reltuples::bigint as rows
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    );

    // 실제 건수 (reltuples는 통계 기반 추정치라 방금 넣은 행이 안 잡힌다)
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const r = await queryOne<{ n: number }>(`select count(*)::int as n from "${t.table_name}"`);
      counts[t.table_name] = r?.n ?? 0;
    }

    return NextResponse.json({
      ok: true,
      engine: version?.version.split(" on ")[0] ?? null,
      tableCount: tables.length,
      counts,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
