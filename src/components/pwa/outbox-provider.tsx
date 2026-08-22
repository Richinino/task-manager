"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { uuidv7 } from "@/lib/id";
import {
  countOutbox,
  enqueue,
  listOutbox,
  removeFromOutbox,
  type OutboxItem,
} from "@/lib/outbox";
import { quickCapture } from "@/server/actions/tasks";

/**
 * Most medzi frontou v prehliadači a serverom.
 *
 * Drží tri veci a nič viac:
 * - či sme online (`navigator.onLine` + udalosti `online`/`offline`),
 * - koľko úloh čaká vo fronte,
 * - odosielanie fronty — pri štarte, po pripojení a opakovane, kým je čo poslať.
 *
 * Obrazovky ostávajú serverové. Tento provider ich neobchádza: po úspešnom
 * odoslaní zavolá `router.refresh()` a úlohy pritečú bežnou cestou zo servera.
 *
 * **Prečo sa niektoré položky zahodia:** keď server odpovie `{ ok: false }`,
 * je to výsledok validácie — ten istý vstup dopadne rovnako aj o hodinu.
 * Taká položka by frontu blokovala navždy, preto ide von. Sieťová chyba
 * (vyhodená výnimka) je naopak dočasná: položka ostáva a skúsi sa znova.
 */

/** Ako často sa skúša odoslať fronta, keď v nej niečo viazne. */
const RETRY_MS = 20_000;

export interface OutboxContextValue {
  /** Podľa prehliadača. Optimistické — signál môže vypadnúť aj bez udalosti. */
  online: boolean;
  /** Počet úloh čakajúcich na odoslanie. */
  pending: number;
  /**
   * Odloží text do fronty. Odmietne, ak úložisko nie je dostupné — volajúci
   * to musí povedať používateľovi, nie prehltnúť.
   */
  enqueueCapture: (raw: string, defaultPlannedDate?: string) => Promise<void>;
}

const OutboxContext = createContext<OutboxContextValue | null>(null);

/**
 * Fronta z ktoréhokoľvek klientského komponentu — alebo `null` mimo providera.
 *
 * Zámerne nevyhadzuje: zachytávanie musí fungovať aj tam, kde provider
 * namontovaný nie je (prihlasovacia obrazovka, testy, budúce vloženie inde).
 * Volajúci sa v takom prípade zaobíde bez fronty a ide priamo na server.
 */
export function useOutbox(): OutboxContextValue | null {
  return useContext(OutboxContext);
}

/** `navigator.onLine` tak, aby prežil aj prostredie bez `navigator`. */
function readOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  // Starší WebView vlastnosť nemá vôbec — vtedy predpokladáme pripojenie,
  // lebo falošné „offline" by zastavilo ukladanie úplne zbytočne.
  return navigator.onLine !== false;
}

/**
 * Prihlásenie na zmeny pripojenia.
 *
 * Žije mimo komponentu zámerne: `useSyncExternalStore` sa pri zmene funkcie
 * odhlási a prihlási znova, takže funkcia vytvorená pri každom renderi by
 * poslucháčov zbytočne prepínala.
 */
function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OutboxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  /*
    Pripojenie je stav prehliadača, nie React. Preto sa neKOPÍRUJE do
    `useState`, ale číta cez `useSyncExternalStore`: ten sa sám prihlási na
    `online`/`offline` a pri renderi vráti aktuálnu hodnotu.

    Tretí argument je snímka pre server. Vykreslí sa „online", takže prvý
    klientský render dá to isté a hydratácia sedí; skutočnú hodnotu si React
    vypýta hneď potom sám. Predtým to robil efekt cez `setOnline`, čo je o
    jeden render navyše a o jednu kópiu pravdy viac.
  */
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);
  const [pending, setPending] = useState(0);

  /** Odosiela sa práve teraz — druhý beh by položky posielal dvakrát. */
  const flushingRef = useRef(false);
  /** Aby sa po odmontovaní nenastavoval stav. */
  const mountedRef = useRef(true);

  const setPendingSafe = useCallback((value: number) => {
    if (mountedRef.current) setPending(value);
  }, []);

  const refreshCount = useCallback(async (): Promise<number> => {
    const count = await countOutbox();
    setPendingSafe(count);
    return count;
  }, [setPendingSafe]);

  /**
   * Prejde frontu od najstaršej položky. Vracia sa hneď, ako narazí na sieťovú
   * chybu — keď nejde jedna, nepôjde ani zvyšok a nemá zmysel tĺcť do servera.
   */
  const flush = useCallback(async (): Promise<void> => {
    if (flushingRef.current) return;
    if (!readOnline()) return;
    flushingRef.current = true;

    try {
      const items = await listOutbox();
      setPendingSafe(items.length);
      if (items.length === 0) return;

      let sent = 0;
      for (const item of items) {
        try {
          const result = await quickCapture(item.raw, {
            defaultPlannedDate: item.defaultPlannedDate,
          });
          // `{ ok: false }` = neplatný vstup. Opakovanie by dopadlo rovnako,
          // takže položka ide preč, aby neupchala frontu.
          await removeFromOutbox(item.id);
          if (result.ok) sent += 1;
        } catch {
          // Sieť. Položka ostáva, skúsi sa neskôr.
          break;
        }
      }

      await refreshCount();
      if (sent > 0) {
        // Obrazovky sú serverové — bez tohto by odoslané úlohy neboli vidieť
        // až do ďalšej navigácie.
        router.refresh();
      }
    } catch {
      // Aj úplné zlyhanie úložiska je v poriadku — skúsi sa nabudúce.
    } finally {
      flushingRef.current = false;
    }
  }, [refreshCount, router, setPendingSafe]);

  /* ── stav pripojenia ──────────────────────────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* Pri štarte a po návrate signálu — vtedy má fronta zmysel skúsiť. */
  useEffect(() => {
    if (!online) return;
    void flush();
  }, [online, flush]);

  /*
    Udalosť `online` je len polovica pravdy: prehliadač ju hlási podľa
    sieťového rozhrania, nie podľa toho, či server naozaj odpovedá. Keď zápis
    zlyhá pri zapnutom wi-fi bez internetu, žiadna udalosť nepríde — preto
    opakovanie, ale iba dovtedy, kým je vo fronte čo posielať.
  */
  useEffect(() => {
    if (pending === 0 || !online) return;
    const timer = setInterval(() => void flush(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pending, online, flush]);

  /* Návrat do záložky je najlacnejší okamih na ďalší pokus. */
  useEffect(() => {
    const handleVisible = (): void => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [flush]);

  /* ── zaraďovanie ──────────────────────────────────────────────────────── */

  const enqueueCapture = useCallback(
    async (raw: string, defaultPlannedDate?: string): Promise<void> => {
      const text = raw.trim();
      if (text === "") return;

      const item: OutboxItem = {
        id: uuidv7(),
        raw: text,
        createdAt: Date.now(),
      };
      if (defaultPlannedDate !== undefined && defaultPlannedDate !== "") {
        item.defaultPlannedDate = defaultPlannedDate;
      }

      // Chyba tu ide von k volajúcemu zámerne: keď sa nedá odložiť, používateľ
      // sa to musí dozvedieť, kým má text ešte na obrazovke.
      await enqueue(item);
      setPendingSafe(await countOutbox());
    },
    [setPendingSafe],
  );

  const value = useMemo<OutboxContextValue>(
    () => ({ online, pending, enqueueCapture }),
    [online, pending, enqueueCapture],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}
