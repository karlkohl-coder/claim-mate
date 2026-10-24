import { describe, expect, it } from "vitest";
import { AirCaseFacts } from "@/domain/case";
import { EvaluationResult } from "@/domain/result";
import { distanceKm, findAirport } from "./airports";
import { evaluateCase } from "./index";
import { testAirKb } from "./test-fixtures";

const today = "2026-10-24";

function evaluate(input: Partial<AirCaseFacts>) {
  const facts = AirCaseFacts.parse({ mode: "air", flightDate: "2026-10-01", ...input });
  const result = evaluateCase(facts, { air: testAirKb, today });
  EvaluationResult.parse(result);
  return result;
}
const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code);

describe("Flughäfen", () => {
  it("findet Flughäfen unabhängig von Groß-/Kleinschreibung", () => {
    expect(findAirport("muc")?.country).toBe("DE");
  });

  it("berechnet plausible Entfernungen", () => {
    const km = distanceKm(findAirport("MUC")!, findAirport("LIS")!);
    expect(km).toBeGreaterThan(1950);
    expect(km).toBeLessThan(2020);
  });
});

describe("Flug: allgemeine Fälle", () => {
  it("meldet fehlende Grundangaben", () => {
    const facts = AirCaseFacts.parse({ mode: "air" });
    const r = evaluateCase(facts, { air: testAirKb, today });
    expect(r.outcome).toBe("unclear");
    expect(r.missingFacts).toEqual(["flightDate", "departureAirport", "arrivalAirport", "incident"]);
  });

  it("unbekannter Flughafen: unklar statt Schätzung", () => {
    expect(findAirport("QQQ")).toBeUndefined();
    const r = evaluate({ departureAirport: "QQQ", arrivalAirport: "LIS", incident: "delay", arrivalDelayMinutes: 200 });
    expect(r.outcome).toBe("unclear");
    expect(r.reasons).toContainEqual({ code: "UNKNOWN_AIRPORT", params: { code: "QQQ" } });
  });

  it("Frist: drei Jahre zum Jahresende", () => {
    const r = evaluate({ departureAirport: "MUC", arrivalAirport: "LIS", incident: "delay", arrivalDelayMinutes: 200 });
    expect(r.deadline).toBe("2029-12-31");
  });
});

describe("Flug: Verspätung", () => {
  it("MUC → LIS, 3 h 20 min: 400 €", () => {
    const r = evaluate({ departureAirport: "MUC", arrivalAirport: "LIS", incident: "delay", arrivalDelayMinutes: 200 });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(400);
    expect(codes(r)).toEqual(expect.arrayContaining(["FLIGHT_DELAY_REACHED", "DISTANCE_BAND", "CAUSE_UNKNOWN"]));
    expect(r.usesPlaceholders).toBe(true);
  });

  it("MUC → BER, 2 h 50 min: nichts", () => {
    const r = evaluate({ departureAirport: "MUC", arrivalAirport: "BER", incident: "delay", arrivalDelayMinutes: 170 });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("DELAY_BELOW_THRESHOLD");
  });

  it("FRA → JFK, Langstrecke: 600 €", () => {
    const r = evaluate({ departureAirport: "FRA", arrivalAirport: "JFK", incident: "delay", arrivalDelayMinutes: 240 });
    expect(r.totalEur).toBe(600);
  });

  it("HAM → LPA, über 3500 km innerhalb des Geltungsbereichs: 400 €", () => {
    const r = evaluate({ departureAirport: "HAM", arrivalAirport: "LPA", incident: "delay", arrivalDelayMinutes: 240 });
    expect(r.totalEur).toBe(400);
  });

  it("Unwetter: keine Entschädigung", () => {
    const r = evaluate({ departureAirport: "MUC", arrivalAirport: "LIS", incident: "delay", arrivalDelayMinutes: 300, cause: "weather" });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("CAUSE_EXEMPT");
  });
});

describe("Flug: Geltungsbereich", () => {
  const base = { departureAirport: "JFK", arrivalAirport: "FRA", incident: "delay" as const, arrivalDelayMinutes: 240 };

  it("in die EU: fragt, ob die Airline aus der EU ist", () => {
    expect(evaluate(base).missingFacts).toEqual(["airlineIsEuCarrier"]);
  });

  it("in die EU mit Nicht-EU-Airline: nicht abgedeckt", () => {
    const r = evaluate({ ...base, airlineIsEuCarrier: false });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("OUT_OF_SCOPE");
  });

  it("in die EU mit EU-Airline: 600 €", () => {
    expect(evaluate({ ...base, airlineIsEuCarrier: true }).totalEur).toBe(600);
  });

  it("außerhalb der EU: nicht abgedeckt", () => {
    const r = evaluate({ ...base, arrivalAirport: "LAX" });
    expect(codes(r)).toContain("OUT_OF_SCOPE");
  });
});

describe("Flug: Annullierung", () => {
  const base = { departureAirport: "MUC", arrivalAirport: "LIS", incident: "cancellation" as const };

  it("rechtzeitig informiert (14+ Tage): nichts", () => {
    const r = evaluate({ ...base, cancellationNoticeDays: 20 });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("CANCELLATION_NOTICE_IN_TIME");
  });

  it("kurzfristig, fragt nach Ersatzflug", () => {
    expect(evaluate({ ...base, cancellationNoticeDays: 3 }).missingFacts).toEqual(["reroutingOffered"]);
  });

  it("kurzfristig, Ersatzflug fast pünktlich: nichts", () => {
    const r = evaluate({
      ...base,
      cancellationNoticeDays: 3,
      reroutingOffered: true,
      reroutingEarlierDepartureMinutes: 30,
      reroutingLaterArrivalMinutes: 90,
    });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("REROUTING_WITHIN_LIMITS");
  });

  it("kurzfristig, Ersatzflug 2,5 h später: 50 % Kürzung", () => {
    const r = evaluate({
      ...base,
      cancellationNoticeDays: 3,
      reroutingOffered: true,
      reroutingEarlierDepartureMinutes: 0,
      reroutingLaterArrivalMinutes: 150,
    });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(200);
    expect(codes(r)).toContain("REDUCED_FOR_REROUTING");
  });

  it("innerhalb der EU über 3500 km: Kürzung schon bis 3 Stunden später", () => {
    const r = evaluate({
      departureAirport: "HAM",
      arrivalAirport: "LPA",
      incident: "cancellation",
      cancellationNoticeDays: 1,
      reroutingOffered: true,
      reroutingEarlierDepartureMinutes: 0,
      reroutingLaterArrivalMinutes: 200,
    });
    // 200 min > 180 (3-h-Band): keine Kürzung, volle 400 €
    expect(r.totalEur).toBe(400);
  });

  it("kurzfristig, kein Ersatzflug: volle Summe", () => {
    const r = evaluate({ ...base, cancellationNoticeDays: 1, reroutingOffered: false });
    expect(r.totalEur).toBe(400);
  });
});

describe("Flug: Nichtbeförderung", () => {
  const base = { departureAirport: "MUC", arrivalAirport: "LIS", incident: "denied_boarding" as const };

  it("unfreiwillig: Entschädigung, Ursache spielt keine Rolle", () => {
    const r = evaluate({ ...base, deniedBoardingVoluntary: false, cause: "weather" });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(400);
    expect(codes(r)).toContain("DENIED_BOARDING_INVOLUNTARY");
  });

  it("freiwillig verzichtet: nichts", () => {
    const r = evaluate({ ...base, deniedBoardingVoluntary: true });
    expect(r.outcome).toBe("not_eligible");
  });
});
