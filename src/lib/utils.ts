import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Spájanie tried s riešením konfliktov.
 *
 * `tailwind-merge` musí o našej typografickej škále vedieť. Bez toho si
 * `text-body` vyloží ako FARBU textu (meno je pre neho neznáme slovo, presne
 * ako `text-danger`) a keď je v tom istom volaní aj skutočná farba, jednu
 * z nich zahodí ako konflikt — v praxi vypadne veľkosť.
 *
 * Prejaví sa to tak, že text má zrazu 16 px namiesto 10 a nikde nie je chyba:
 * preklad ani testy o triedach nevedia. Nájde sa to len okom v prehliadači.
 * Vstavané `text-xs` ten problém nemá, lebo tie mená pozná.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "mini", "meta", "body", "row"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
