"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * Spoken turn-by-turn guidance via the browser's SpeechSynthesis API.
 * Everything happens on the device: no audio, text or position is sent
 * anywhere (UK GDPR, §12). Designed for eyes-free walking and for blind and
 * partially sighted users (WCAG 2.2 — the visual HUD remains the equivalent).
 */

const noopSubscribe = () => () => {};
const hasSpeech = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const noSpeech = () => false;

/** SSR-safe capability check. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, hasSpeech, noSpeech);
}

/** "In 85 metres" reads better than "In 85 m" — round to steps nobody counts. */
export function spokenDistance(meters: number): string {
  if (meters >= 950) return `${(meters / 1000).toFixed(1).replace(".0", "")} kilometres`;
  const rounded = meters < 100 ? Math.round(meters / 5) * 5 : Math.round(meters / 10) * 10;
  return `${Math.max(rounded, 5)} metres`;
}

/**
 * Speak `announcement` whenever it changes to a new non-null string while
 * enabled. Callers must therefore only change the string at moments worth
 * announcing (step transitions, approach warnings, arrival, off-route).
 */
export function useVoiceGuidance(enabled: boolean, announcement: string | null): void {
  useEffect(() => {
    if (!enabled || !announcement) return;
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(announcement);
    utterance.lang = "en-GB";
    utterance.rate = 1;
    window.speechSynthesis.cancel(); // a fresh instruction outranks a stale one
    window.speechSynthesis.speak(utterance);
  }, [enabled, announcement]);

  // Silence immediately when the walk ends or voice is switched off.
  useEffect(() => {
    if (enabled) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [enabled]);

  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );
}
