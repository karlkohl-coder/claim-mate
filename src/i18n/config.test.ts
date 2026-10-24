import { describe, expect, it } from "vitest";
import { pickLocale } from "./config";

describe("pickLocale", () => {
  it("nimmt Deutsch, wenn kein Header da ist", () => {
    expect(pickLocale(null)).toBe("de");
    expect(pickLocale("")).toBe("de");
  });

  it("erkennt Englisch mit Region", () => {
    expect(pickLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("beachtet die Gewichtung", () => {
    expect(pickLocale("en;q=0.5,de;q=0.9")).toBe("de");
  });

  it("überspringt nicht unterstützte Sprachen", () => {
    expect(pickLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("en");
  });

  it("fällt bei unbekannten Sprachen auf Deutsch zurück", () => {
    expect(pickLocale("fr,it")).toBe("de");
  });
});
