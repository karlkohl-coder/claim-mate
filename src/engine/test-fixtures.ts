import type { AirKnowledgeBase, RailKnowledgeBase, RuleStatus } from "@/knowledge/schema";

/*
 * Feste Test-Wissensbasis für die Engine-Tests.
 * Unabhängig von den JSON-Dateien, damit die Tests stabil bleiben,
 * wenn die echten Regeln (Schritt 8) eingetragen werden.
 */

const sources = [{ title: "Test-Quelle", url: "https://example.invalid/test" }];

function v<T>(value: T, validFrom = "2000-01-01", status: RuleStatus = "placeholder") {
  return [{ validFrom, status, sources, value }];
}

export const testRailKb: RailKnowledgeBase = {
  schemaVersion: 1,
  mode: "rail",
  title: "Test",
  updatedAt: "2026-01-01",
  rules: {
    delayCompensation: [
      // Ältere Version mit anderen Werten, um die Auswahl nach Reisedatum zu testen.
      {
        validFrom: "2000-01-01",
        validUntil: "2023-06-06",
        status: "placeholder",
        sources,
        value: { tiers: [{ minDelayMinutes: 60, percentOfPrice: 50 }], returnTicketLegPercent: 50 },
      },
      {
        validFrom: "2023-06-07",
        status: "placeholder",
        sources,
        value: {
          tiers: [
            { minDelayMinutes: 60, percentOfPrice: 25 },
            { minDelayMinutes: 120, percentOfPrice: 50 },
          ],
          returnTicketLegPercent: 50,
        },
      },
    ],
    minimumPayout: v({ amountEur: 4 }),
    flatRateCompensation: v({
      deutschlandticket: { minDelayMinutes: 60, class2Eur: 1.5 },
      season_ticket: { minDelayMinutes: 60, class2Eur: 1.5, class1Eur: 2.25 },
      bahncard100: { minDelayMinutes: 60, class2Eur: 10, class1Eur: 15 },
    }),
    exemptCauses: v({ causes: ["extreme_weather", "natural_disaster", "public_health_crisis", "third_party", "passenger_fault"] }),
    fullRefund: v({ minExpectedDelayMinutes: 60 }),
    claimDeadline: v({ amount: 3, unit: "months", from: "journey_date" }),
    submission: v({
      channels: [{ kind: "online", label: { de: "Online", en: "Online" }, url: "https://example.invalid/rail" }],
    }),
  },
};

export const testAirKb: AirKnowledgeBase = {
  schemaVersion: 1,
  mode: "air",
  title: "Test",
  updatedAt: "2026-01-01",
  rules: {
    coveredCountries: v({
      countries: ["AT", "BE", "DE", "ES", "FR", "IT", "NL", "PT", "IS", "NO", "CH"],
    }),
    compensationBands: v({
      bands: [
        { upToKm: 1500, amountEur: 250 },
        { upToKm: 3500, amountEur: 400 },
        { upToKm: null, amountEur: 600, withinCoveredAreaAmountEur: 400 },
      ],
    }),
    delayThreshold: v({ minDelayMinutes: 180 }),
    reroutingReduction: v({
      percent: 50,
      bands: [
        { upToKm: 1500, maxLaterArrivalMinutes: 120 },
        { upToKm: 3500, maxLaterArrivalMinutes: 180 },
        { upToKm: null, maxLaterArrivalMinutes: 240 },
      ],
    }),
    cancellationNotice: v({
      noCompensationFromNoticeDays: 14,
      windows: [
        { minNoticeDays: 7, maxNoticeDays: 13, maxEarlierDepartureMinutes: 120, maxLaterArrivalMinutes: 240 },
        { minNoticeDays: 0, maxNoticeDays: 6, maxEarlierDepartureMinutes: 60, maxLaterArrivalMinutes: 120 },
      ],
    }),
    exemptCauses: v({ causes: ["weather", "air_traffic_control", "security", "bird_strike", "other_extraordinary"] }),
    claimDeadline: v({ amount: 3, unit: "years", from: "end_of_year_of_journey" }),
    submission: v({
      channels: [{ kind: "online", label: { de: "Airline", en: "Airline" }, url: "https://example.invalid/air" }],
    }),
  },
};
