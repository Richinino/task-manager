import { ImageResponse } from "next/og";

/**
 * Ikona pre „Pridať na plochu" na iOS. iOS si ikonu oreže sám a priehľadnosť
 * nahradí čiernou — preto je pozadie plná indigo bez akéhokoľvek alfa kanála
 * a bez zaoblenia rohov.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          width="102"
          height="102"
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
