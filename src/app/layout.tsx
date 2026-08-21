import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

import "./globals.css";

/*
  Písma z návrhu. `next/font` ich pri builde stiahne a priloží k appke,
  takže za behu nesiaha na cudzí server — appka ostáva funkčná offline
  a neposiela nič Googlu.

  `latin-ext` NIE JE voliteľné: bez neho by sa č, š, ž, ť, ď, ľ, ĺ, ŕ, ô a ä
  vykreslili náhradným písmom a polovica slovenského rozhrania by mala iný tvar.
*/
const plex = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Task manažér", template: "%s · Task manažér" },
  description: "Osobný systém na riadenie úloh a nápadov.",
  applicationName: "Task manažér",
  // Po pridaní na plochu iOS beží appka na celej ploche bez panela prehliadača.
  // Krátky názov „Úlohy" sa pod ikonou zmestí bez orezania.
  appleWebApp: {
    capable: true,
    title: "Úlohy",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#22242e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Nastaví tému ešte pred prvým vykreslením, aby pri načítaní nebliklo biele
 * pozadie v tmavom režime.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored === "dark" || (stored !== "light" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="sk"
      suppressHydrationWarning
      className={`${plex.variable} ${jetbrains.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
