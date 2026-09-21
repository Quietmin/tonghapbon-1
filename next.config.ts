import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 워크스페이스 루트를 이 폴더로 못박는다.
  //
  // 사용자 홈(C:\Users\User)에 package-lock.json 이 하나 굴러다녀서, Next 가
  // 거기를 루트로 잡고 모든 모듈 이름을 홈 기준 상대경로로 만들었다. 그러면
  // 이름에 "바탕 화면"이 섞이는데, Turbopack 이 그 이름을 바이트 단위로 자르다가
  // 한글 중간에서 끊겨 빌드가 통째로 죽는다(ident.rs char boundary 패닉).
  // 루트를 고정하면 이름이 "src_modules_..." 로만 만들어져 한글이 끼지 않는다.
  turbopack: { root: path.resolve(import.meta.dirname) },
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
