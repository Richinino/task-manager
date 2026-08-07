import { ImageResponse } from "next/og";

/**
 * Ikona appky. Next.js z nej pri builde vygeneruje statické `/icon.png`,
 * takže v repozitári nemusí ležať žiadny binárny súbor.
 *
 * Návrh: plná plocha v akcentovej indigo (`--accent` svetlej témy,
 * oklch(0.54 0.19 275) ≈ #4f46e5) a v strede hrubé biele odškrtnutie.
 * Žiadny text ani tenké čiary — v 48 px sa musí dať prečítať na prvý pohľad.
 * Odškrtnutie je zároveň v „safe zone" pre maskable ikony na Androide.
 */

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
        }}
      >
        <svg
          width="272"
          height="272"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 12.6 L9.8 17.9 L19.5 6.4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
