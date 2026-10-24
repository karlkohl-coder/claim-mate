import { describe, expect, it } from "vitest";
import { evaluateCase } from "@/engine";
import type { CaseFacts } from "@/domain/case";
import { buildClaimEmail } from "./claim-email";

const sender = { firstName: "Max", lastName: "Mustermann", recipient: ["DB Fernverkehr AG", "Servicecenter Fahrgastrechte", "60647 Frankfurt am Main"] };

describe("Begleit-E-Mail zum Antrag", () => {
  it("Bahn: nennt Anhang, Fahrt und beantragten Betrag", () => {
    const facts: CaseFacts = {
      mode: "rail",
      ticketType: "single",
      ticketPriceEur: 89.9,
      journeys: [{ date: "2026-10-23", from: "München Hbf", to: "Berlin Hbf", trainNumber: "ICE 597", arrivalDelayMinutes: 75 }],
    };
    const { subject, text } = buildClaimEmail(facts, evaluateCase(facts, { today: "2026-10-24" }), sender);
    expect(subject).toBe("Antrag auf Entschädigung nach VO (EU) 2021/782 – ICE 597 am 23.10.2026");
    expect(text).toContain("ausgefüllte und unterschriebene Fahrgastrechte-Formular");
    expect(text).toContain("- Strecke: München Hbf – Berlin Hbf");
    expect(text).toContain("- Verspätung am Zielbahnhof: 75 Minuten");
    expect(text).toContain("Beantragte Entschädigung: 22,48 €");
    expect(text).toContain("Demonstration");
  });

  it("Flug: nennt Vorfall und Ausgleichszahlung", () => {
    const facts: CaseFacts = {
      mode: "air",
      flightNumber: "LH 1172",
      airline: "Lufthansa",
      airlineIsEuCarrier: true,
      flightDate: "2026-10-22",
      departureAirport: "FRA",
      arrivalAirport: "LIS",
      incident: "cancellation",
      cancellationNoticeDays: 0,
      reroutingOffered: false,
    };
    const { subject, text } = buildClaimEmail(facts, evaluateCase(facts, { today: "2026-10-24" }), { ...sender, bookingRef: "DEMO42" });
    expect(subject).toBe("Ausgleichszahlung nach Art. 7 VO (EG) Nr. 261/2004 – Flug LH 1172 am 22.10.2026");
    expect(text).toContain("Annullierung, mitgeteilt erst am Abflugtag, kein Ersatzflug angeboten");
    expect(text).toContain("- Buchungsnummer: DEMO42");
    expect(text).toContain("Geforderte Ausgleichszahlung: 400,00 €");
  });
});
