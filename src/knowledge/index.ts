import airData from "./data/air.json";
import railData from "./data/rail.json";
import { AirKnowledgeBase, RailKnowledgeBase, type Rule, type RuleVersion } from "./schema";

/*
 * Lädt die Wissensbasis und prüft sie gegen das Schema.
 * Ist eine Datei fehlerhaft, bricht schon der Build bzw. der erste Test ab,
 * statt dass zur Laufzeit falsche Werte verwendet werden.
 */
export const railKnowledgeBase: RailKnowledgeBase = RailKnowledgeBase.parse(railData);
export const airKnowledgeBase: AirKnowledgeBase = AirKnowledgeBase.parse(airData);

/**
 * Wählt die Version einer Regel, die an `date` (YYYY-MM-DD, das Reisedatum) galt.
 * Gibt `undefined` zurück, wenn für dieses Datum keine Version existiert.
 */
export function selectRuleVersion<V>(rule: Rule<V>, date: string): RuleVersion<V> | undefined {
  return rule
    .filter((v) => v.validFrom <= date && (!v.validUntil || date <= v.validUntil))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
}

export * from "./schema";
