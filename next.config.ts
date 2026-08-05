import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary that must not be bundled by the server compiler.
  serverExternalPackages: ["@electric-sql/pglite"],
  typedRoutes: true,
};

export default nextConfig;
