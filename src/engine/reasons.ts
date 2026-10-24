/**
 * Alle Begründungs-Codes der Engine. Oberfläche und KI übersetzen sie.
 * Neue Codes nur hier ergänzen.
 */
export const REASON_CODES = [
  // Allgemein
  "NO_RULES_FOR_DATE", // Für das Reisedatum gibt es keine Regel-Version
  "MISSING_FACTS", // Angaben fehlen, siehe missingFacts
  "CAUSE_EXEMPT", // Ursache schließt Entschädigung aus { cause }
  "CAUSE_UNKNOWN", // Ursache unbekannt; das Unternehmen muss eine Ausnahme beweisen
  "DEADLINE_PASSED", // Frist abgelaufen { deadline }
  "BELOW_MINIMUM_PAYOUT", // Betrag unter Mindestbetrag { amountEur, minimumEur }

  // Bahn
  "DELAY_BELOW_THRESHOLD", // { delayMinutes, thresholdMinutes }
  "DELAY_TIER_REACHED", // { delayMinutes, percent }
  "RETURN_TICKET_LEG", // Hin- und Rückfahrt: Anteil des Preises { percent }
  "FULL_REFUND", // Reise abgebrochen/nicht angetreten { amountEur }
  "FLAT_RATE_JOURNEY", // Pauschale für eine Fahrt { amountEur, delayMinutes }
  "FLAT_RATE_SUMMED", // Pauschalen zusammengezählt { count, amountEur }
  "UNSUPPORTED_TICKET", // Ticketart ohne Pauschale in der Wissensbasis { ticketType }

  // Flug
  "OUT_OF_SCOPE", // Flug fällt nicht unter die Verordnung
  "UNKNOWN_AIRPORT", // Flughafen nicht in der Liste { code }
  "DISTANCE_BAND", // { distanceKm, amountEur }
  "FLIGHT_DELAY_REACHED", // { delayMinutes, thresholdMinutes }
  "CANCELLATION_NOTICE_IN_TIME", // { noticeDays, requiredDays }
  "CANCELLATION_LATE_NOTICE", // { noticeDays }
  "REROUTING_WITHIN_LIMITS", // Ersatzflug nah genug am Plan
  "REDUCED_FOR_REROUTING", // Kürzung { percent }
  "DENIED_BOARDING_INVOLUNTARY",
  "DENIED_BOARDING_VOLUNTARY",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export type ReasonParams = Record<string, string | number | boolean>;
export type TypedReason = { code: ReasonCode; params?: ReasonParams };

export function reason(code: ReasonCode, params?: ReasonParams): TypedReason {
  return params ? { code, params } : { code };
}
