import { describe, expect, it } from "vitest";
import { airKnowledgeBase, railKnowledgeBase, RailRules, selectRuleVersion, type Rule } from "./index";

const source = [{ title: "Test", url: "https://example.invalid/test" }];

describe("Wissensbasis-Dateien", () => {
  it("rail.json und air.json passen zum Schema", () => {
    // Das Laden in index.ts wirft bereits bei Fehlern; hier nur Stichproben.
    expect(railKnowledgeBase.mode).toBe("rail");
    expect(airKnowledgeBase.mode).toBe("air");
  });

  it("jede Platzhalter-Regel ist als solche erkennbar", () => {
    const all = [...Object.values(railKnowledgeBase.rules), ...Object.values(airKnowledgeBase.rules)];
    for (const rule of all) {
      for (const version of rule) {
        if (version.status === "placeholder") {
          expect(version.sources.some((s) => s.url.includes("example.invalid"))).toBe(true);
        }
      }
    }
  });
});

describe("Schema-Prüfung der Regeln", () => {
  const validRules = structuredClone(railKnowledgeBase.rules);

  it("lehnt sich überschneidende Versionen ab", () => {
    const broken = structuredClone(validRules);
    broken.minimumPayout = [
      { validFrom: "2020-01-01", status: "placeholder", sources: source, value: { amountEur: 4 } },
      { validFrom: "2023-01-01", status: "placeholder", sources: source, value: { amountEur: 5 } },
    ];
    expect(RailRules.safeParse(broken).success).toBe(false);
  });

  it("akzeptiert aufeinanderfolgende Versionen", () => {
    const ok = structuredClone(validRules);
    ok.minimumPayout = [
      { validFrom: "2020-01-01", validUntil: "2022-12-31", status: "placeholder", sources: source, value: { amountEur: 4 } },
      { validFrom: "2023-01-01", status: "placeholder", sources: source, value: { amountEur: 5 } },
    ];
    expect(RailRules.safeParse(ok).success).toBe(true);
  });

  it("verlangt mindestens eine Quelle", () => {
    const broken = structuredClone(validRules);
    broken.minimumPayout = [{ validFrom: "2020-01-01", status: "placeholder", sources: [], value: { amountEur: 4 } }];
    expect(RailRules.safeParse(broken).success).toBe(false);
  });
});

describe("selectRuleVersion", () => {
  const rule: Rule<number> = [
    { validFrom: "2020-01-01", validUntil: "2023-06-06", status: "verified", sources: source, value: 1 },
    { validFrom: "2023-06-07", status: "verified", sources: source, value: 2 },
  ];

  it("wählt die Version, die am Reisedatum galt", () => {
    expect(selectRuleVersion(rule, "2022-05-01")?.value).toBe(1);
    expect(selectRuleVersion(rule, "2026-10-24")?.value).toBe(2);
  });

  it("beachtet die Grenztage", () => {
    expect(selectRuleVersion(rule, "2023-06-06")?.value).toBe(1);
    expect(selectRuleVersion(rule, "2023-06-07")?.value).toBe(2);
  });

  it("gibt undefined zurück, wenn das Datum vor allen Versionen liegt", () => {
    expect(selectRuleVersion(rule, "2019-12-31")).toBeUndefined();
  });
});
