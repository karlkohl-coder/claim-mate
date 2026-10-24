"use client";

import type { RailTicketType } from "@/domain/case";
import { createPersistedStore } from "./persisted";

/*
 * "Meine Fahrkarten": dauerhafte Fahrkarten wie Deutschlandticket, Monatskarte, BahnCard 100.
 * Solange eine Fahrkarte am Reisetag gültig ist, wird sie automatisch für Bahn-Tickets verwendet.
 */

export type Pass = {
  id: string;
  type: Extract<RailTicketType, "deutschlandticket" | "season_ticket" | "season_ticket_long_distance" | "bahncard100">;
  travelClass: 1 | 2;
  validFrom: string;
  validUntil: string;
  priceEur?: number;
  label?: string;
  file?: { name: string; mediaType: string; data: string };
};

const store = createPersistedStore<Pass[]>("passes", []);
export const usePasses = store.useStore;
export const getPasses = store.getState;

export function addPass(pass: Omit<Pass, "id">) {
  store.update((all) => [{ ...pass, id: crypto.randomUUID() }, ...all]);
}

export function deletePass(id: string) {
  store.update((all) => all.filter((p) => p.id !== id));
}
