#!/usr/bin/env node
// db/schema.sql을 실제 Postgres(Supabase 등)에 적용한다.
//
// 로컬 PGlite는 서버가 뜰 때마다 스키마를 자동으로 다시 적용하므로 이 스크립트가
// 필요 없다. 이 스크립트는 DATABASE_URL이 가리키는 "진짜" Postgres에 딱 한 번
// (또는 스키마를 고칠 때마다) 수동으로 적용할 때만 쓴다.
//
// 사용법:
//   npm run db:migrate
//
// .env.local에 DATABASE_URL을 채워야 한다. Supabase의 커넥션 풀러(6543)는
// DDL 배치 실행 중 세션 상태 제약이 있을 수 있으니, 이 스크립트만은
// MIGRATION_DATABASE_URL로 "Direct connection"(5432) 문자열을 따로 줘도 된다.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

// Next는 자체 프로세스에서만 .env.local을 자동으로 읽는다.
// 이 스크립트는 독립 실행(plain node)이라 직접 파싱해서 채운다.
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL(또는 MIGRATION_DATABASE_URL)이 없습니다.\n" +
      ".env.local.example을 복사해 .env.local을 만들고 값을 채우세요.",
  );
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "db", "schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("연결됨. 스키마 적용 중...");
  // 파라미터 없이 문자열 하나로 호출 -> simple query 프로토콜이 쓰여
  // ;로 구분된 여러 문장을 한 번에 실행할 수 있다.
  await client.query(sql);
  console.log("완료. db/schema.sql이 적용되었습니다.");
} catch (e) {
  console.error("스키마 적용 실패:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
