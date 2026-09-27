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
      /*
        Objavovanie OAuth pre MCP (docs/MCP.md). Klient sa najprv pýta
        chráneného zdroja (RFC 9728) — aj s cestou `/api/mcp` na konci —
        a potom autorizačného servera (RFC 8414). Niektorí klienti skúšajú
        aj OpenID adresu, tak dostanú to isté.
      */
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/resource",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/metadata",
      },
      {
        source: "/.well-known/openid-configuration/:path*",
        destination: "/api/oauth/metadata",
      },
    ];
  },

  /*
    Obrazovka súhlasu sa nesmie dať vložiť do cudzej stránky — inak by ju
    niekto prekryl vlastným tlačidlom a súhlas by odklikol človek, ktorý
    netuší, na čo kliká.
  */
  async headers() {
    return [
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
