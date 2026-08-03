import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { Pool } from "pg";

/**
 * 데이터 접근 계층 — 이 파일만이 실제 DB 종류를 안다.
 * repo.ts를 비롯한 나머지 코드는 query/queryOne/execute만 부르고, 그 밑이
 * PGlite인지 진짜 Postgres(Supabase 등)인지 전혀 모른다.
 *
 *   DATABASE_URL 환경변수가 없으면 → PGlite. 계정·서버 없이 로컬 파일로 동작
 *     (개발 단계 기본값. Vercel에서는 배포 번들이 읽기 전용이라 os.tmpdir()를 쓰고,
 *      인스턴스마다 새로 초기화되므로 요청 간 데이터가 남지 않는다 — 데모용)
 *   DATABASE_URL이 있으면 → 그 Postgres에 그대로 연결. 여러 사람이 같은 데이터를
 *     보려면 이 경로를 쓴다 (Supabase 등). 스키마는 자동으로 적용하지 않으므로
 *     처음 한 번 `npm run db:migrate`로 db/schema.sql을 적용해야 한다.
 *
 * 주의: 서버 전용이다. 클라이언트 컴포넌트에서 import하면 안 된다.
 */

const DATABASE_URL = process.env.DATABASE_URL;

interface Backend {
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  withTransaction<T>(fn: (tx: Backend) => Promise<T>): Promise<T>;
}

// ---------------------------------------------------------------------------
// PGlite 백엔드 — 로컬 개발 기본값
// ---------------------------------------------------------------------------

const RUNTIME_ROOT = process.env.VERCEL ? os.tmpdir() : process.cwd();
const DATA_DIR = path.join(RUNTIME_ROOT, ".data", "pgdata");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

declare global {
  // Next 개발 서버는 코드가 바뀔 때마다 모듈을 다시 평가한다.
  // 전역에 물려두지 않으면 저장할 때마다 DB 인스턴스가 새로 생겨 파일이 잠긴다.
  var __plantOpsDb: Promise<Backend> | undefined;
}

async function createPgliteBackend(): Promise<Backend> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pg_trgm } });
  // PGlite는 실행할 때마다 가상 파일시스템이 새로 구성될 수 있어(Vercel /tmp 등)
  // 매번 스키마를 적용한다. idempotent하게 작성돼 있어 여러 번 실행해도 안전하다.
  await db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

  const backend: Backend = {
    async query(sql, params) {
      const res = await db.query(sql, params);
      return { rows: res.rows as never[], rowCount: (res as { affectedRows?: number }).affectedRows ?? res.rows.length };
    },
    async withTransaction(fn) {
      return db.transaction(async (tx) => {
        const txBackend: Backend = {
          query: async (sql, params) => {
            const res = await tx.query(sql, params);
            return { rows: res.rows as never[], rowCount: (res as { affectedRows?: number }).affectedRows ?? res.rows.length };
          },
          withTransaction: () => {
            throw new Error("중첩 트랜잭션은 지원하지 않습니다.");
          },
        };
        return fn(txBackend);
      }) as Promise<Awaited<ReturnType<typeof fn>>>;
    },
  };
  return backend;
}

// ---------------------------------------------------------------------------
// 진짜 Postgres 백엔드 — DATABASE_URL이 있을 때 (Supabase 등)
// ---------------------------------------------------------------------------

function createPostgresBackend(connectionString: string): Backend {
  // 관리형 Postgres(Supabase/Neon 등)는 TLS가 필수인데, Node 기본 CA 목록에
  // 없는 인증서를 쓰는 경우가 많아 엄격 검증을 끈다. 서버리스라 커넥션 수를 낮게 잡는다.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  return {
    async query(sql, params) {
      const res = await pool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    },
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const txBackend: Backend = {
          query: async (sql, params) => {
            const res = await client.query(sql, params);
            return { rows: res.rows, rowCount: res.rowCount ?? 0 };
          },
          withTransaction: () => {
            throw new Error("중첩 트랜잭션은 지원하지 않습니다.");
          },
        };
        const result = await fn(txBackend);
        await client.query("commit");
        return result;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

function getBackend(): Promise<Backend> {
  globalThis.__plantOpsDb ??= DATABASE_URL
    ? Promise.resolve(createPostgresBackend(DATABASE_URL))
    : createPgliteBackend();
  return globalThis.__plantOpsDb;
}

// ---------------------------------------------------------------------------
// 공개 API — repo.ts는 이 네 개만 쓴다
// ---------------------------------------------------------------------------

/** SELECT — 행 배열을 돌려준다. 파라미터는 반드시 $1, $2 로 넘길 것(문자열 결합 금지) */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const backend = await getBackend();
  const res = await backend.query<T>(sql, params);
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
  const backend = await getBackend();
  const res = await backend.query(sql, params);
  return res.rowCount;
}

/** 여러 문장을 한 트랜잭션으로 묶는다. 콜백이 던지면 전부 롤백된다. */
export async function transaction<T>(
  fn: (tx: {
    query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
  }) => Promise<T>,
): Promise<T> {
  const backend = await getBackend();
  return backend.withTransaction(async (txBackend) =>
    fn({
      query: async <R,>(sql: string, params: unknown[] = []) => (await txBackend.query<R>(sql, params)).rows,
    }),
  );
}
