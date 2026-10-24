import { describe, expect, it } from "vitest";
import { RailCaseFacts, type RailJourney } from "@/domain/case";
import { EvaluationResult } from "@/domain/result";
import { evaluateCase } from "./index";
import { testRailKb } from "./test-fixtures";

const today = "2026-10-24";

function evaluate(input: Partial<RailCaseFacts> & { journeys?: RailJourney[] }, opts: { today?: string } = {}) {
  const facts = RailCaseFacts.parse({ mode: "rail", ...input });
  const result = evaluateCase(facts, { rail: testRailKb, today: opts.today ?? today });
  EvaluationResult.parse(result); // Ergebnis passt immer zum Schema
  return result;
}
const codes = (r: { reasons: { code: string }[] }) => r.reasons.map((x) => x.code);

describe("Bahn: allgemeine Fälle", () => {
  it("meldet fehlende Angaben bei leerem Fall", () => {
    const r = evaluate({});
    expect(r.outcome).toBe("unclear");
    expect(r.missingFacts).toEqual(["ticketType", "journeys.0.date", "journeys.0.arrivalDelayMinutes"]);
  });

  it("ist unklar, wenn es für das Reisedatum keine Regel gibt", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 50, journeys: [{ date: "1999-01-01", arrivalDelayMinutes: 90 }] });
    expect(r.outcome).toBe("unclear");
    expect(codes(r)).toContain("NO_RULES_FOR_DATE");
  });

  it("markiert Ergebnisse mit Platzhalter-Regeln", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [{ date: "2026-10-01", arrivalDelayMinutes: 75 }] });
    expect(r.usesPlaceholders).toBe(true);
    expect(r.appliedRules.map((a) => a.rule)).toContain("rail.delayCompensation");
  });
});

describe("Bahn: Einzel- und Rückfahrkarte", () => {
  const journey = (minutes: number, extra: Partial<RailJourney> = {}): RailJourney => ({
    date: "2026-10-01",
    arrivalDelayMinutes: minutes,
    incident: "delay",
    ...extra,
  });

  it("25 % ab 60 Minuten", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [journey(75)] });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(20);
    expect(r.reasons).toContainEqual({ code: "DELAY_TIER_REACHED", params: { delayMinutes: 75, percent: 25 } });
    expect(codes(r)).toContain("CAUSE_UNKNOWN");
    expect(r.deadline).toBe("2027-01-01");
    expect(r.submission).toHaveLength(1);
  });

  it("50 % ab 120 Minuten", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [journey(130)] });
    expect(r.totalEur).toBe(40);
  });

  it("keine Entschädigung unter 60 Minuten", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [journey(59)] });
    expect(r.outcome).toBe("not_eligible");
    expect(r.reasons).toContainEqual({ code: "DELAY_BELOW_THRESHOLD", params: { delayMinutes: 59, thresholdMinutes: 60 } });
    expect(r.totalEur).toBeUndefined();
  });

  it("Rückfahrkarte: Basis ist der halbe Preis", () => {
    const r = evaluate({ ticketType: "return", ticketPriceEur: 100, journeys: [journey(65)] });
    expect(r.totalEur).toBe(12.5);
    expect(codes(r)).toContain("RETURN_TICKET_LEG");
  });

  it("kein Geld unter dem Mindestbetrag", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 12, journeys: [journey(70)] });
    expect(r.outcome).toBe("not_eligible");
    expect(r.reasons).toContainEqual({ code: "BELOW_MINIMUM_PAYOUT", params: { amountEur: 3, minimumEur: 4 } });
  });

  it("keine Entschädigung bei ausgenommener Ursache", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [journey(130, { cause: "extreme_weather" })] });
    expect(r.outcome).toBe("not_eligible");
    expect(codes(r)).toContain("CAUSE_EXEMPT");
  });

  it("Streik beim Bahnunternehmen ist keine Ausnahme", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [journey(130, { cause: "own_staff_strike" })] });
    expect(r.outcome).toBe("eligible");
    expect(codes(r)).not.toContain("CAUSE_UNKNOWN");
  });

  it("Abbruch der Reise: voller Fahrpreis, auch bei Unwetter", () => {
    const r = evaluate({
      ticketType: "single",
      ticketPriceEur: 50,
      journeys: [journey(60, { journeyAbandoned: true, cause: "extreme_weather" })],
    });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(50);
    expect(codes(r)).toContain("FULL_REFUND");
  });

  it("fragt nach dem Preis, kennt aber schon die Stufe", () => {
    const r = evaluate({ ticketType: "single", journeys: [journey(75)] });
    expect(r.outcome).toBe("unclear");
    expect(r.missingFacts).toEqual(["ticketPriceEur"]);
    expect(codes(r)).toContain("DELAY_TIER_REACHED");
  });

  it("fragt nach der Verspätung", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [{ date: "2026-10-01" }] });
    expect(r.missingFacts).toEqual(["journeys.0.arrivalDelayMinutes"]);
  });

  it("Frist abgelaufen: unklar statt Anspruch", () => {
    const r = evaluate({ ticketType: "single", ticketPriceEur: 80, journeys: [{ date: "2026-01-10", arrivalDelayMinutes: 75 }] });
    expect(r.outcome).toBe("unclear");
    expect(r.reasons).toContainEqual({ code: "DEADLINE_PASSED", params: { deadline: "2026-04-10" } });
  });

  it("nimmt die Regel-Version, die am Reisedatum galt", () => {
    const old = evaluate(
      { ticketType: "single", ticketPriceEur: 80, journeys: [{ date: "2023-01-15", arrivalDelayMinutes: 75 }] },
      { today: "2023-02-01" },
    );
    expect(old.totalEur).toBe(40); // alte Testversion: 50 % ab 60 Minuten
    expect(old.appliedRules.find((a) => a.rule === "rail.delayCompensation")?.validFrom).toBe("2000-01-01");
  });
});

describe("Bahn: Zeitkarten", () => {
  const delays = (...minutes: (number | undefined)[]): RailJourney[] =>
    minutes.map((m, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, arrivalDelayMinutes: m }));

  it("Deutschlandticket: zwei Verspätungen reichen nicht für den Mindestbetrag", () => {
    const r = evaluate({ ticketType: "deutschlandticket", journeys: delays(65, 90) });
    expect(r.outcome).toBe("not_eligible");
    expect(r.reasons).toContainEqual({ code: "BELOW_MINIMUM_PAYOUT", params: { amountEur: 3, minimumEur: 4 } });
    expect(r.lines).toHaveLength(2);
  });

  it("Deutschlandticket: drei Verspätungen werden zusammengezählt", () => {
    const r = evaluate({ ticketType: "deutschlandticket", journeys: delays(65, 30, 90, 120) });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(4.5);
    expect(r.lines.map((l) => l.journeyIndex)).toEqual([0, 2, 3]);
    expect(r.reasons).toContainEqual({ code: "FLAT_RATE_SUMMED", params: { count: 3, amountEur: 4.5 } });
  });

  it("Deutschlandticket: unklar, solange eine Angabe fehlt und der Mindestbetrag offen ist", () => {
    const r = evaluate({ ticketType: "deutschlandticket", journeys: delays(65, undefined, 90) });
    expect(r.outcome).toBe("unclear");
    expect(r.missingFacts).toEqual(["journeys.1.arrivalDelayMinutes"]);
  });

  it("andere Zeitkarte: fragt nach der Klasse", () => {
    const r = evaluate({ ticketType: "season_ticket", journeys: delays(65, 90, 70) });
    expect(r.missingFacts).toContain("travelClass");
  });

  it("BahnCard 100, 1. Klasse", () => {
    const r = evaluate({ ticketType: "bahncard100", travelClass: 1, journeys: delays(61) });
    expect(r.outcome).toBe("eligible");
    expect(r.totalEur).toBe(15);
  });

  it("Frist läuft ab der frühesten Fahrt", () => {
    const r = evaluate({ ticketType: "deutschlandticket", journeys: delays(65, 90, 70) });
    expect(r.deadline).toBe("2027-01-01");
  });
});
