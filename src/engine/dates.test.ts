import { describe, expect, it } from "vitest";
import { addDays, addMonths, computeDeadline } from "./dates";

describe("Datumsrechnung", () => {
  it("addMonths nimmt den Monatsletzten, wenn der Tag fehlt", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("addDays über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("Frist ab Reisedatum", () => {
    expect(computeDeadline({ amount: 3, unit: "months", from: "journey_date" }, "2026-10-24")).toBe("2027-01-24");
  });

  it("Frist ab Jahresende", () => {
    expect(computeDeadline({ amount: 3, unit: "years", from: "end_of_year_of_journey" }, "2026-05-10")).toBe("2029-12-31");
  });

  it("unbekannter Startpunkt: keine Frist", () => {
    expect(computeDeadline({ amount: 1, unit: "years", from: "end_of_ticket_validity" }, "2026-05-10")).toBeUndefined();
  });
});
