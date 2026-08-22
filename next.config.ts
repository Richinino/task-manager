import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary that must not be bundled by the server compiler.
  serverExternalPackages: ["@electric-sql/pglite"],
  typedRoutes: true,

  /*
    Android hľadá Digital Asset Links výhradne na
    `/.well-known/assetlinks.json` a inú cestu neakceptuje. Priečinky
    začínajúce bodkou si ale Next v `app/` nevšíma, takže cesta vzniká
    prepisom na obsluhu, ktorá číta odtlačok z premenných prostredia.
  */
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
};

export default nextConfig;
