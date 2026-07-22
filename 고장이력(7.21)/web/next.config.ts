import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) spawns a worker by resolving a file path at
  // runtime; letting Next.js bundle it breaks that resolution, so it must run
  // as a plain Node require instead. See PRD 3.6.3 for the parsing approach.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // pdfjs-dist's worker script is only ever referenced via a runtime string
  // path (never a static import), so Next's build-time file tracer misses it
  // and it doesn't get copied into the deployed function bundle. Force it in.
  outputFileTracingIncludes: {
    "/api/extract-failure-report": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
