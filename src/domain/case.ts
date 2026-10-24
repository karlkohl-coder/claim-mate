import { z } from "zod";
import { FactSource, IsoDate, Money } from "./common";

/*
 * Falldaten, die die KI aus dem Gespräch extrahiert und die Regel-Engine auswertet.
 *
 * Fast alles ist optional: Während des Gesprächs ist ein Fall unvollständig.
 * Die Engine meldet dann, welche Angaben fehlen ("missingFacts").
 *
 * Bewusst NICHT enthalten: Name, Adresse, IBAN, Buchungsnummer.
 * Diese persönlichen Daten erfasst ein Formular im Browser (Schritt 6),
 * damit sie nie an die KI-API gehen.
 */

const Minutes = z.number().int().nonnegative();
const Text = z.string().trim().min(1);

// ---------- Bahn ----------

/** Ursache der Störung. Wichtig für Ausnahmen (z. B. Unwetter). */
export const RailCause = z.enum([
  "unknown",
  "operator", // Technik, Personal, Baustelle, Überlastung
  "own_staff_strike", // Streik beim Bahnunternehmen selbst
  "extreme_weather",
  "natural_disaster",
  "public_health_crisis",
  "third_party", // z. B. Personen im Gleis, Kabeldiebstahl, Polizeieinsatz
  "passenger_fault",
]);
export type RailCause = z.infer<typeof RailCause>;

export const RailTicketType = z.enum([
  "single", // Einzelfahrt
  "return", // Hin- und Rückfahrt
  "deutschlandticket",
  "season_ticket", // Zeitkarte Nahverkehr (Monatskarte, Jahreskarte …)
  "season_ticket_long_distance", // Zeitkarte Fernverkehr
  "bahncard100",
]);
export type RailTicketType = z.infer<typeof RailTicketType>;

/** Eine einzelne Fahrt. Bei Zeitkarten kann ein Fall mehrere Fahrten enthalten. */
export const RailJourney = z.object({
  date: IsoDate.optional(),
  from: Text.optional(),
  to: Text.optional(),
  trainNumber: Text.optional(), // z. B. "ICE 597"
  operator: Text.optional(), // z. B. "DB Fernverkehr", "Metronom"
  country: z.string().length(2).toUpperCase().optional(), // ISO-Code, z. B. "DE"
  incident: z.enum(["delay", "cancellation", "missed_connection"]).optional(),
  /** Verspätung am Ziel der Fahrt in Minuten. */
  arrivalDelayMinutes: Minutes.optional(),
  /** Reise abgebrochen oder gar nicht angetreten. */
  journeyAbandoned: z.boolean().optional(),
  cause: RailCause.optional(),
});
export type RailJourney = z.infer<typeof RailJourney>;

export const RailCaseFacts = z.object({
  mode: z.literal("rail"),
  ticketType: RailTicketType.optional(),
  travelClass: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Fahrpreis in Euro (bei Einzel- und Rückfahrkarten). */
  ticketPriceEur: Money.optional(),
  journeys: z.array(RailJourney).default([]),
});
export type RailCaseFacts = z.infer<typeof RailCaseFacts>;

// ---------- Flug ----------

export const AirCause = z.enum([
  "unknown",
  "technical", // technischer Defekt
  "airline_staff_strike", // Streik bei der Airline selbst
  "weather",
  "air_traffic_control", // Fluglotsenstreik, Luftraumsperrung
  "security",
  "bird_strike",
  "other_extraordinary",
]);
export type AirCause = z.infer<typeof AirCause>;

const Iata = z.string().length(3).toUpperCase();

export const AirCaseFacts = z.object({
  mode: z.literal("air"),
  flightNumber: Text.optional(), // z. B. "LH 1234"
  airline: Text.optional(),
  /** Hat die Airline eine Betriebsgenehmigung in der EU? Wichtig bei Flügen in die EU. */
  airlineIsEuCarrier: z.boolean().optional(),
  flightDate: IsoDate.optional(),
  /** Erster Abflughafen der Buchung (IATA-Code). */
  departureAirport: Iata.optional(),
  /** Endziel der Buchung (IATA-Code), auch bei Umsteigeverbindungen. */
  arrivalAirport: Iata.optional(),
  incident: z.enum(["delay", "cancellation", "denied_boarding"]).optional(),
  /** Verspätung am Endziel in Minuten. */
  arrivalDelayMinutes: Minutes.optional(),
  /** Bei Annullierung: wie viele Tage vor Abflug informiert. */
  cancellationNoticeDays: z.number().int().nonnegative().optional(),
  /** Bei Annullierung: Ersatzflug angeboten? */
  reroutingOffered: z.boolean().optional(),
  /** Ersatzflug: wie viele Minuten früher als geplant abgeflogen. */
  reroutingEarlierDepartureMinutes: Minutes.optional(),
  /** Ersatzflug: wie viele Minuten später als geplant angekommen. */
  reroutingLaterArrivalMinutes: Minutes.optional(),
  /** Bei Nichtbeförderung: freiwillig auf den Platz verzichtet? */
  deniedBoardingVoluntary: z.boolean().optional(),
  cause: AirCause.optional(),
});
export type AirCaseFacts = z.infer<typeof AirCaseFacts>;

// ---------- Gemeinsam ----------

export const CaseFacts = z.discriminatedUnion("mode", [RailCaseFacts, AirCaseFacts]);
export type CaseFacts = z.infer<typeof CaseFacts>;
export type TransportMode = CaseFacts["mode"];

/**
 * Herkunft der Angaben, getrennt von den Falldaten, damit die Engine einfach bleibt.
 * Schlüssel ist der Pfad der Angabe, z. B. "ticketPriceEur" oder "journeys.0.arrivalDelayMinutes".
 */
export const FactProvenance = z.record(z.string(), FactSource);
export type FactProvenance = z.infer<typeof FactProvenance>;
