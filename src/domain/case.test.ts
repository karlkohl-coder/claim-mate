import { describe, expect, it } from "vitest";
import { CaseFacts } from "./case";

describe("CaseFacts", () => {
  it("akzeptiert einen fast leeren Bahn-Fall (Gesprächsbeginn)", () => {
    const facts = CaseFacts.parse({ mode: "rail" });
    expect(facts).toEqual({ mode: "rail", journeys: [] });
  });

  it("akzeptiert einen Deutschlandticket-Fall mit mehreren Fahrten", () => {
    const facts = CaseFacts.parse({
      mode: "rail",
      ticketType: "deutschlandticket",
      travelClass: 2,
      journeys: [
        { date: "2026-10-01", arrivalDelayMinutes: 65, incident: "delay" },
        { date: "2026-10-08", arrivalDelayMinutes: 90, incident: "delay", country: "de" },
      ],
    });
    expect(facts.mode === "rail" && facts.journeys).toHaveLength(2);
    expect(facts.mode === "rail" && facts.journeys[1].country).toBe("DE");
  });

  it("schreibt Flughafen-Codes groß", () => {
    const facts = CaseFacts.parse({ mode: "air", departureAirport: "muc", arrivalAirport: "lis" });
    expect(facts.mode === "air" && facts.departureAirport).toBe("MUC");
  });

  it("lehnt ungültige Angaben ab", () => {
    expect(CaseFacts.safeParse({ mode: "bus" }).success).toBe(false);
    expect(CaseFacts.safeParse({ mode: "air", flightDate: "24.10.2026" }).success).toBe(false);
    expect(CaseFacts.safeParse({ mode: "air", arrivalDelayMinutes: -5 }).success).toBe(false);
    expect(CaseFacts.safeParse({ mode: "rail", travelClass: 3 }).success).toBe(false);
  });
});
