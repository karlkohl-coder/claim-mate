import { z } from "zod";
import { IsoDate, Money, Source, SubmissionChannel } from "./common";

/*
 * Ergebnis der Regel-Engine. Enthält keinen fertigen Text:
 * Begründungen sind Codes mit Parametern. Oberfläche und KI machen daraus
 * Deutsch oder Englisch. So kann nichts falsch übersetzt oder erfunden werden.
 */

export const Outcome = z.enum(["eligible", "not_eligible", "unclear"]);
export type Outcome = z.infer<typeof Outcome>;

export const Reason = z.object({
  /** z. B. "DELAY_TIER_REACHED", "CAUSE_EXEMPT". Die Liste kommt mit der Engine (Schritt 3). */
  code: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type Reason = z.infer<typeof Reason>;

/** Ein Posten der Entschädigung, z. B. eine Fahrt bei Zeitkarten. */
export const CompensationLine = z.object({
  journeyIndex: z.number().int().nonnegative().optional(),
  amountEur: Money,
  reason: Reason,
});
export type CompensationLine = z.infer<typeof CompensationLine>;

/** Welche Version welcher Regel angewendet wurde. Für Nachvollziehbarkeit und Tests. */
export const AppliedRule = z.object({
  rule: z.string().min(1), // z. B. "rail.delayCompensation"
  validFrom: IsoDate,
  status: z.enum(["placeholder", "verified"]),
  sources: z.array(Source),
});
export type AppliedRule = z.infer<typeof AppliedRule>;

export const EvaluationResult = z.object({
  mode: z.enum(["rail", "air"]),
  outcome: Outcome,
  /** Gesamtbetrag in Euro. Nur bei "eligible". */
  totalEur: Money.optional(),
  lines: z.array(CompensationLine).default([]),
  reasons: z.array(Reason),
  /** Pfade der fehlenden Angaben, z. B. "ticketPriceEur". Die KI fragt gezielt danach. */
  missingFacts: z.array(z.string()),
  /** Letzter Tag, an dem der Antrag eingereicht werden kann. */
  deadline: IsoDate.optional(),
  submission: z.array(SubmissionChannel),
  appliedRules: z.array(AppliedRule),
  /** true, sobald eine Platzhalter-Regel verwendet wurde. Die Oberfläche warnt dann deutlich. */
  usesPlaceholders: z.boolean(),
});
export type EvaluationResult = z.infer<typeof EvaluationResult>;
