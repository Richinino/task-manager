import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

import "./globals.css";

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
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#12131a" },
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
    <html lang="sk" suppressHydrationWarning>
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
