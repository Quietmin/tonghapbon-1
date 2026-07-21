import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) spawns a worker by resolving a file path at
  // runtime; letting Next.js bundle it breaks that resolution, so it must run
  // as a plain Node require instead. See PRD 3.6.3 for the parsing approach.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
