import "server-only";
import { z } from "zod";
import { AirCaseFacts, CaseFacts, RailCaseFacts, RailJourney } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";
import { evaluateCase } from "@/engine";
import type { Locale } from "@/i18n/config";
import { renderReason } from "@/i18n/reasons";
import type { PassInfo } from "@/lib/chat-protocol";

/*
 * Das eine Tool der KI: Falldaten speichern und von der Regel-Engine auswerten lassen.
 * Anbieterunabhängig; die Anbieter-Dateien übersetzen es nur in ihr Format.
 */

export const RECORD_CASE_FACTS = "record_case_facts";

export const RECORD_CASE_FACTS_DESCRIPTION = [
  "Save the complete, current facts of the passenger's case and get the deterministic evaluation from the rule engine.",
  "Call this every time you learn or correct a fact. Always send the FULL facts object (not just the changes): it replaces the previous one.",
  "The result contains: outcome (eligible / not_eligible / unclear), totalEur, reasonTexts, missingFacts (facts still needed), deadline, submission channels, usesPlaceholders.",
  "Only include facts you actually know. Never put names, addresses, IBANs, booking codes or e-mail addresses into the facts.",
].join(" ");

/*
 * Für die KI ein flaches Objekt statt einer Union aus Bahn- und Flugschema:
 * Modelle füllen das deutlich zuverlässiger aus. Danach wird streng geprüft.
 */
const DESCRIPTIONS: Record<string, string> = {
  ticketType: "Rail only. Type of ticket. season_ticket = local/regional season ticket, season_ticket_long_distance = long-distance (IC/ICE) season ticket.",
  travelClass: "Rail only. 1 or 2.",
  ticketPriceEur: "Rail only. Price of the ticket in EUR (single or return ticket).",
  journeys: [
    "Rail only. One entry per trip. For Deutschlandticket and other season tickets add every delayed trip as its own entry.",
    "Each entry: date (YYYY-MM-DD), from, to, trainNumber (e.g. 'ICE 597'), operator, country (ISO code, e.g. 'DE'),",
    "incident, arrivalDelayMinutes (delay at the destination of that trip, in minutes), journeyAbandoned, cause.",
  ].join(" "),
  flightNumber: "Air only. E.g. 'LH 1234'.",
  airline: "Air only. Name of the operating airline.",
  airlineIsEuCarrier: "Air only. Whether the airline is licensed in the EU. Needed for flights INTO the EU from outside.",
  flightDate: "Air only. Scheduled departure date, YYYY-MM-DD.",
  departureAirport: "Air only. IATA code of the first departure airport of the booking, e.g. 'MUC'.",
  arrivalAirport: "Air only. IATA code of the FINAL destination of the booking (also for connecting flights), e.g. 'LIS'.",
  incident: "Air only. What happened.",
  arrivalDelayMinutes: "Air only. Delay at the final destination in minutes.",
  cancellationNoticeDays: "Air only, cancellation. How many days before departure the passenger was informed.",
  reroutingOffered: "Air only. Whether a replacement flight was offered.",
  reroutingEarlierDepartureMinutes: "Air only. Replacement flight: how many minutes EARLIER than planned it departed.",
  reroutingLaterArrivalMinutes: "Air only. Replacement flight: how many minutes LATER than planned it arrived.",
  deniedBoardingVoluntary: "Air only. Whether the passenger gave up the seat voluntarily.",
  cause: "Air only. Cause of the problem, if known; 'unknown' otherwise.",
};

function describeShape(shape: z.ZodRawShape): z.ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, DESCRIPTIONS[key] ? (schema as z.ZodType).describe(DESCRIPTIONS[key]) : schema]),
  );
}

const FlatFacts = z.object({
  ...describeShape({ ...RailCaseFacts.shape, ...AirCaseFacts.shape }),
  mode: z.enum(["rail", "air"]).describe("'rail' for trains, 'air' for flights."),
  journeys: z.array(RailJourney).optional().describe(DESCRIPTIONS.journeys),
});

/** JSON-Schema der Tool-Eingabe (für alle Anbieter gleich). */
export const recordCaseFactsJsonSchema: Record<string, unknown> = (() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...facts } = z.toJSONSchema(FlatFacts, { io: "input" }) as Record<string, unknown>;
  return { type: "object", properties: { facts }, required: ["facts"] };
})();

// Kleine Toleranz für typische Modellfehler, bevor streng geprüft wird.
const MODE_ALIASES: Record<string, "rail" | "air"> = { train: "rail", bahn: "rail", flight: "air", plane: "air", flug: "air" };
function normalize(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  let facts = (input as { facts?: unknown }).facts;
  if (Array.isArray(facts) && facts.length === 1) facts = facts[0];
  if (facts && typeof facts === "object" && "mode" in facts) {
    const mode = String((facts as { mode: unknown }).mode).toLowerCase();
    facts = { ...facts, mode: MODE_ALIASES[mode] ?? mode };
  }
  return { facts };
}

export type ToolOutcome =
  | { ok: true; facts: CaseFacts; result: EvaluationResult; payload: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Gespeicherte Fahrkarte automatisch einsetzen: Bei Bahnfällen ohne Ticketart
 * nimmt sie die Fahrkarte, die am Reisetag gültig ist (deterministisch, nicht die KI).
 */
export function applyPass(facts: CaseFacts, passes: PassInfo[]): { facts: CaseFacts; applied?: PassInfo } {
  if (facts.mode !== "rail" || facts.ticketType || passes.length === 0) return { facts };
  const date = facts.journeys.find((j) => j.date)?.date;
  if (!date) return { facts };
  const pass = passes.find((p) => p.validFrom <= date && date <= p.validUntil);
  if (!pass) return { facts };
  return { facts: { ...facts, ticketType: pass.type, travelClass: facts.travelClass ?? pass.travelClass }, applied: pass };
}

/** Führt das Tool aus: prüfen, auswerten, Antwort für die KI bauen. */
export function runRecordCaseFacts(input: unknown, locale: Locale, today: string, passes: PassInfo[] = []): ToolOutcome {
  const parsed = z.object({ facts: CaseFacts }).safeParse(normalize(input));
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid facts, nothing was saved. Fix these fields and call the tool again:\n${z.prettifyError(parsed.error)}`,
    };
  }
  const facts = applyPass(parsed.data.facts, passes).facts;
  const result = evaluateCase(facts, { today });
  // Für die KI nur, was sie zum Erklären braucht (spart Tokens): keine Quellen, keine Regel-Versionen.
  const payload = {
    facts,
    result: {
      outcome: result.outcome,
      totalEur: result.totalEur,
      reasonTexts: result.reasons.filter((r) => r.code !== "MISSING_FACTS").map((r) => renderReason(r, locale)),
      missingFacts: result.missingFacts,
      deadline: result.deadline,
      submission: result.submission.map((c) => c.label[locale]),
      usesPlaceholders: result.usesPlaceholders,
    },
  };
  return { ok: true, facts, result, payload };
}
