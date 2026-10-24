"use client";

import { get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";

/*
 * Kleiner Speicher im Browser (IndexedDB), den React-Komponenten abonnieren können.
 * IndexedDB statt localStorage, weil Tickets Fotos und PDFs enthalten können.
 */
export function createPersistedStore<T>(key: string, initial: T) {
  let state = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  async function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const stored = await get<T>(key);
      if (stored !== undefined) {
        state = stored;
        emit();
      }
    } catch (error) {
      console.warn(`[store] ${key} konnte nicht geladen werden`, error);
    }
    ready = true;
    emit();
  }
  let ready = false;

  function update(change: (current: T) => T) {
    state = change(state);
    emit();
    set(key, state).catch((error) => console.warn(`[store] ${key} konnte nicht gespeichert werden`, error));
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    void load();
    return () => listeners.delete(listener);
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, () => state, () => initial);
  }

  function useReady(): boolean {
    return useSyncExternalStore(subscribe, () => ready, () => false);
  }

  return { useStore, useReady, update, getState: () => state };
}
