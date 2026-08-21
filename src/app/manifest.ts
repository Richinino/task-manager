import type { MetadataRoute } from "next";

/**
 * Web App Manifest — vďaka nemu sa dá appka nainštalovať na plochu telefónu.
 *
 * Farby sú zosúladené s tokenmi v `globals.css`: `--bg` svetlej témy je
 * oklch(0.985 0.003 100) ≈ #fbfbfa. Tú istú hodnotu má aj svetlá vetva
 * `themeColor` vo `viewport` v `layout.tsx` — inštalovaná appka tak vyzerá
 * rovnako ako appka v prehliadači.
 *
 * Next.js z tohto súboru vygeneruje `/manifest.webmanifest` a sám doplní
 * `<link rel="manifest">` do `<head>`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Task manažér",
    short_name: "Úlohy",
    description:
      "Osobný systém na riadenie úloh a nápadov. Novú úlohu zachytíš aj bez signálu — odošle sa, keď sa pripojenie vráti.",
    lang: "sk",
    dir: "ltr",

    // Po spustení z plochy má zmysel začať tam, kde sa reálne pracuje.
    start_url: "/dnes",
    scope: "/",
    display: "standalone",
    orientation: "portrait",

    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    categories: ["productivity"],

    // Next.js 16 (Turbopack) publikuje ikony generované cez `ImageResponse`
    // na cestách BEZ prípony — `/icon` a `/apple-icon`. `/icon.png` by vrátilo
    // 404 a inštalácia by zlyhala; formát prezradí prehliadaču pole `type`.
    icons: [
      // Rovnaký obrázok v dvoch účeloch: „any" pre klasické zobrazenie,
      // „maskable" pre Android, ktorý si ikonu oreže do svojho tvaru.
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],

    // Skratky v kontextovom menu ikony na ploche (dlhé podržanie / pravý klik).
    shortcuts: [
      {
        name: "Dnes",
        short_name: "Dnes",
        description: "Úlohy naplánované na dnešný deň",
        url: "/dnes",
      },
      {
        name: "Inbox",
        short_name: "Inbox",
        description: "Nezatriedené nápady a úlohy",
        url: "/inbox",
      },
    ],
  };
}
