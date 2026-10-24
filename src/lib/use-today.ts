"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Heutiges Datum (YYYY-MM-DD), erst im Browser. Beim Vorab-Rendern leer. */
export function useToday(): string {
  return useSyncExternalStore(
    subscribe,
    () => new Date().toISOString().slice(0, 10),
    () => "",
  );
}
