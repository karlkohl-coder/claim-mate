"use client";

import type { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";
import { createPersistedStore } from "./persisted";

/*
 * Ein "Ticket" ist ein Fall: eine verspätete Fahrt, ein annullierter Flug usw.
 * Alles bleibt lokal im Browser.
 */

export type TicketStatus = "open" | "evaluated" | "submitted_self" | "sent" | "answered" | "paid";

export type TimelineType = "created" | "evaluated" | "submitted_self" | "handed_to_mail" | "answer_uploaded" | "paid";
export type TimelineEvent = { type: TimelineType; at: string; note?: string };

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: { name: string; previewUrl?: string }[];
  result?: EvaluationResult;
  error?: string;
  status?: string;
  pending?: boolean;
};

export type Letter = {
  id: string;
  createdAt: string;
  /** Versandfertiges PDF (Base64), als Kopie für den Nutzer. */
  pdfBase64: string;
  recipient: string[];
  /** Simulierter Briefdienst oder Demo-Versand per E-Mail. */
  service: "letterxpress-demo" | "demo-mail";
  demoMailTo?: string;
  /** Nur ohne SMTP-Zugang: Link zur Vorschau beim Test-Mailserver. */
  demoPreviewUrl?: string;
  creditsCharged: number;
};

export type Ticket = {
  id: string;
  mode: "rail" | "air";
  createdAt: string;
  updatedAt: string;
  status: TicketStatus;
  timeline: TimelineEvent[];
  messages: DisplayMessage[];
  history: unknown[];
  provider: string | null;
  facts: CaseFacts | null;
  result: EvaluationResult | null;
  letter?: Letter;
  answerFileName?: string;
  /** Erste Nachricht, die beim Öffnen automatisch gesendet wird (z. B. aus der Soforthilfe). */
  draft?: string;
};

const store = createPersistedStore<Ticket[]>("tickets", []);

export const useTickets = store.useStore;
export const useTicketsReady = store.useReady;

export function useTicket(id: string | null): Ticket | undefined {
  return useTickets().find((t) => t.id === id);
}

export function createTicket(mode: "rail" | "air", draft?: string): Ticket {
  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: crypto.randomUUID(),
    mode,
    createdAt: now,
    updatedAt: now,
    status: "open",
    timeline: [{ type: "created", at: now }],
    messages: [],
    draft,
    history: [],
    provider: null,
    facts: null,
    result: null,
  };
  store.update((all) => [ticket, ...all]);
  return ticket;
}

export function updateTicket(id: string, change: (t: Ticket) => Ticket) {
  store.update((all) => all.map((t) => (t.id === id ? { ...change(t), updatedAt: new Date().toISOString() } : t)));
}

export function addTimeline(id: string, type: TimelineType, note?: string) {
  updateTicket(id, (t) =>
    t.timeline.some((e) => e.type === type) ? t : { ...t, timeline: [...t.timeline, { type, at: new Date().toISOString(), note }] },
  );
}

export function deleteTicket(id: string) {
  store.update((all) => all.filter((t) => t.id !== id));
}
