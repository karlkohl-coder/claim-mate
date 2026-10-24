"use client";

import { createPersistedStore } from "./persisted";

/*
 * Credits – in der Demo nur simuliert, im Browser gespeichert.
 * Eine automatische Einreichung kostet LETTER_CREDITS. Credits werden erst reserviert,
 * abgebucht, sobald der Briefdienst den Auftrag annimmt, und bei Fehlern zurückgebucht.
 */

/** Kosten eines Briefes, offen aufgeschlüsselt (Beispielwerte für die Demo). */
export const LETTER_COST_BREAKDOWN = [
  { key: "print", eur: 0.25 },
  { key: "envelope", eur: 0.1 },
  { key: "postage", eur: 0.95 },
  { key: "service", eur: 0.4 },
  { key: "payment", eur: 0.2 },
] as const;
export const CREDIT_PRICE_EUR = LETTER_COST_BREAKDOWN.reduce((sum, item) => sum + item.eur, 0);
export const LETTER_CREDITS = 1;

export const PACKAGES = [
  { credits: 1, priceEur: Math.round(CREDIT_PRICE_EUR * 100) / 100 },
  { credits: 3, priceEur: Math.round(CREDIT_PRICE_EUR * 3 * 100) / 100 },
  { credits: 10, priceEur: Math.round(CREDIT_PRICE_EUR * 10 * 100) / 100 },
];

export type LedgerEntry = {
  id: string;
  at: string;
  type: "free" | "purchase" | "reserve" | "charge" | "refund";
  credits: number;
  ticketId?: string;
};

type CreditState = { balance: number; reserved: number; freeCreditRedeemed: boolean; ledger: LedgerEntry[] };

const store = createPersistedStore<CreditState>("credits", { balance: 0, reserved: 0, freeCreditRedeemed: false, ledger: [] });

export const useCredits = store.useStore;

const entry = (type: LedgerEntry["type"], credits: number, ticketId?: string): LedgerEntry => ({
  id: crypto.randomUUID(),
  at: new Date().toISOString(),
  type,
  credits,
  ticketId,
});

export function redeemFreeCredit(): boolean {
  if (store.getState().freeCreditRedeemed) return false;
  store.update((s) => ({ ...s, balance: s.balance + 1, freeCreditRedeemed: true, ledger: [entry("free", 1), ...s.ledger] }));
  return true;
}

/** Simulierter Kauf. */
export function purchaseCredits(credits: number) {
  store.update((s) => ({ ...s, balance: s.balance + credits, ledger: [entry("purchase", credits), ...s.ledger] }));
}

/** Reserviert Credits für einen Brief. Gibt false zurück, wenn das Guthaben nicht reicht. */
export function reserveCredits(credits: number, ticketId: string): boolean {
  const s = store.getState();
  if (s.balance - s.reserved < credits) return false;
  store.update((st) => ({ ...st, reserved: st.reserved + credits, ledger: [entry("reserve", credits, ticketId), ...st.ledger] }));
  return true;
}

/** Briefdienst hat angenommen: endgültig abbuchen. */
export function chargeReserved(credits: number, ticketId: string) {
  store.update((s) => ({
    ...s,
    balance: s.balance - credits,
    reserved: Math.max(0, s.reserved - credits),
    ledger: [entry("charge", credits, ticketId), ...s.ledger],
  }));
}

/** Fehler beim Versand: Reservierung zurückgeben. */
export function refundReserved(credits: number, ticketId: string) {
  store.update((s) => ({ ...s, reserved: Math.max(0, s.reserved - credits), ledger: [entry("refund", credits, ticketId), ...s.ledger] }));
}
