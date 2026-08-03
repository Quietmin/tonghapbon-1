import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // legacy/ 안의 원본 3개 앱은 통합 앱 빌드 대상이 아니다 (참고용 동결 코드).
  outputFileTracingExcludes: {
    "*": ["./legacy/**"],
  },
  // PGlite는 WASM 바이너리를 들고 있어 번들러가 건드리면 깨진다.
  // 서버에서 node_modules 그대로 require 하도록 제외한다.
  serverExternalPackages: ["@electric-sql/pglite"],
  // db/schema.sql은 동적으로 조합한 경로(path.join(process.cwd(), ...))로 읽어서
  // Next의 자동 추적이 놓칠 수 있다. 서버리스 번들에 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/**": ["./db/schema.sql"],
  },
};

export default nextConfig;
