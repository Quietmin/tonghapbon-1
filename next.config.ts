import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // legacy/ 안의 원본 3개 앱은 통합 앱 빌드 대상이 아니다 (참고용 동결 코드).
  outputFileTracingExcludes: {
    "*": ["./legacy/**"],
  },
};

export default nextConfig;
