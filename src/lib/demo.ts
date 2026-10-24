import type { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";
import { evaluateCase } from "@/engine";
import type { Locale } from "@/i18n/config";
import { formatEur, renderReason } from "@/i18n/reasons";

/*
 * Demo-Fälle für Präsentationen: Fakten sind vorgegeben, ausgewertet wird
 * mit der echten Regel-Engine – ohne Wartezeit auf die KI.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type DemoCase = {
  id: string;
  mode: "rail" | "air";
  label: Record<Locale, string>;
  userText: Record<Locale, string>;
  facts: () => CaseFacts;
};

export const DEMO_CASES: DemoCase[] = [
  {
    id: "ice-delay",
    mode: "rail",
    label: { de: "ICE 75 Min. zu spät", en: "ICE 75 min late" },
    userText: {
      de: "Mein ICE 597 von München Hbf nach Berlin Hbf kam gestern 75 Minuten zu spät an. Einzelticket, 89,90 €.",
      en: "My ICE 597 from Munich Hbf to Berlin Hbf arrived 75 minutes late yesterday. Single ticket, €89.90.",
    },
    facts: () => ({
      mode: "rail",
      ticketType: "single",
      travelClass: 2,
      ticketPriceEur: 89.9,
      journeys: [{ date: daysAgo(1), from: "München Hbf", to: "Berlin Hbf", trainNumber: "ICE 597", operator: "DB Fernverkehr", country: "DE", incident: "delay", arrivalDelayMinutes: 75 }],
    }),
  },
  {
    id: "dticket",
    mode: "rail",
    label: { de: "Deutschlandticket, 3 Verspätungen", en: "Deutschlandticket, 3 delays" },
    userText: {
      de: "Mit meinem Deutschlandticket war der RE 1 Hamburg → Lübeck diese Woche dreimal über eine Stunde zu spät: 70, 95 und 61 Minuten.",
      en: "With my Deutschlandticket the RE 1 Hamburg → Lübeck was over an hour late three times this week: 70, 95 and 61 minutes.",
    },
    facts: () => ({
      mode: "rail",
      ticketType: "deutschlandticket",
      travelClass: 2,
      journeys: [70, 95, 61].map((minutes, i) => ({
        date: daysAgo(6 - i * 2),
        from: "Hamburg Hbf",
        to: "Lübeck Hbf",
        trainNumber: "RE 1",
        incident: "delay" as const,
        arrivalDelayMinutes: minutes,
      })),
    }),
  },
  {
    id: "flight-cancelled",
    mode: "air",
    label: { de: "Flug am Abflugtag annulliert", en: "Flight cancelled on the day" },
    userText: {
      de: "Mein Lufthansa-Flug LH 1172 von Frankfurt nach Lissabon wurde vorgestern am Abflugtag annulliert. Einen Ersatzflug gab es nicht.",
      en: "My Lufthansa flight LH 1172 from Frankfurt to Lisbon was cancelled on the day of departure two days ago. No replacement flight was offered.",
    },
    facts: () => ({
      mode: "air",
      flightNumber: "LH 1172",
      airline: "Lufthansa",
      airlineIsEuCarrier: true,
      flightDate: daysAgo(2),
      departureAirport: "FRA",
      arrivalAirport: "LIS",
      incident: "cancellation",
      cancellationNoticeDays: 0,
      reroutingOffered: false,
    }),
  },
];

/** Baut die Antwort für einen Demo-Fall aus dem echten Engine-Ergebnis. */
export function runDemoCase(demo: DemoCase, locale: Locale): { facts: CaseFacts; result: EvaluationResult; reply: string } {
  const facts = demo.facts();
  const result = evaluateCase(facts);
  const reasons = result.reasons.filter((r) => r.code !== "MISSING_FACTS").map((r) => `- ${renderReason(r, locale)}`);
  const head =
    result.outcome === "eligible" && result.totalEur !== undefined
      ? locale === "de"
        ? `Gute Nachricht: Du hast Anspruch auf **${formatEur(result.totalEur, locale)}**.`
        : `Good news: you are entitled to **${formatEur(result.totalEur, locale)}**.`
      : locale === "de"
        ? "Das habe ich geprüft:"
        : "Here is what I checked:";
  const tail = locale === "de" ? "Tippe auf „Auswerten“, um deine Optionen zu sehen." : "Tap “Evaluate” to see your options.";
  return { facts, result, reply: [head, ...reasons, tail].join("\n") };
}
