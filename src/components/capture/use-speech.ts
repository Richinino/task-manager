"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Diktovanie cez Web Speech API. Typy sú minimálne — prehliadačové knižnice
 * ich nemajú a `any` sa tu nepoužíva.
 */
interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  readonly length: number;
  [index: number]: SpeechAlternativeLike | undefined;
}
interface SpeechResultListLike {
  readonly length: number;
  [index: number]: SpeechResultLike | undefined;
}
interface SpeechEventLike {
  results: SpeechResultListLike;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = (): (() => void) => () => {};

export interface UseSpeech {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
  stop: () => void;
}

/**
 * `onTranscript` dostane CELÝ doteraz rozpoznaný text relácie (nie prírastok),
 * takže volajúci ho vždy len pripojí k tomu, čo bolo v poli na začiatku.
 * `onStart` sa volá tesne pred spustením — tam si volajúci zapamätá základ.
 */
export function useSpeech(
  onTranscript: (transcript: string) => void,
  onStart: () => void,
): UseSpeech {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const callbacks = useRef({ onTranscript, onStart });
  useEffect(() => {
    callbacks.current = { onTranscript, onStart };
  });

  const stop = useCallback((): void => {
    recRef.current?.stop();
  }, []);

  const toggle = useCallback((): void => {
    if (recRef.current !== null) {
      recRef.current.stop();
      return;
    }
    const Ctor = getCtor();
    if (Ctor === null) return;

    const rec = new Ctor();
    rec.lang = "sk-SK";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      callbacks.current.onTranscript(text);
    };
    const finish = (): void => {
      recRef.current = null;
      setListening(false);
    };
    rec.onend = finish;
    rec.onerror = finish;

    callbacks.current.onStart();
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      finish();
    }
  }, []);

  // Zavretie okna nesmie nechať mikrofón otvorený.
  useEffect(
    () => () => {
      recRef.current?.abort();
      recRef.current = null;
    },
    [],
  );

  return { supported, listening, toggle, stop };
}
