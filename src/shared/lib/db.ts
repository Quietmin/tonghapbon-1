import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/**
 * 앱 안에서 도는 PostgreSQL.
 *
 * PGlite는 Postgres를 그대로 WASM으로 컴파일한 것이라, 여기서 쓰는 SQL은
 * 나중에 어떤 Postgres 서버에 붙이든 그대로 동작한다. 계정·서버·Docker가 필요 없고
 * 데이터는 프로젝트 안 .data/pgdata/ 에 파일로 남는다.
 *
 * 주의: 서버 전용이다. 클라이언트 컴포넌트에서 import하면 안 된다
 * (API Route나 서버 컴포넌트에서만 부른다).
 */

const DATA_DIR = path.join(process.cwd(), ".data", "pgdata");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

// Next 개발 서버는 코드가 바뀔 때마다 모듈을 다시 평가한다.
// 전역에 물려두지 않으면 저장할 때마다 DB 인스턴스가 새로 생겨 파일이 잠긴다.
declare global {
  var __plantOpsDb: Promise<PGlite> | undefined;
}

async function connect(): Promise<PGlite> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = await PGlite.create({
    dataDir: DATA_DIR,
    extensions: { pg_trgm },
  });

  // 스키마는 idempotent하게 작성돼 있어 매번 실행해도 안전하다.
  // 스키마 파일만 고치고 서버를 다시 띄우면 반영된다.
  await db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

  return db;
}

export function getDb(): Promise<PGlite> {
  globalThis.__plantOpsDb ??= connect();
  return globalThis.__plantOpsDb;
}

/** SELECT — 행 배열을 돌려준다. 파라미터는 반드시 $1, $2 로 넘길 것(문자열 결합 금지) */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params);
  return res.rows;
}

/** 한 행만 기대할 때. 없으면 null */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE — 영향받은 행 수를 돌려준다 */
export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const db = await getDb();
  const res = await db.query(sql, params);
  return res.affectedRows ?? 0;
}

/** 여러 문장을 한 트랜잭션으로 묶는다. 콜백이 던지면 전부 롤백된다. */
export async function transaction<T>(
  fn: (tx: {
    query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
  }) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    return fn({
      query: async <R,>(sql: string, params: unknown[] = []) =>
        (await tx.query<R>(sql, params)).rows,
    });
  }) as Promise<T>;
}
