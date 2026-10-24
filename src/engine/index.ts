import type { CaseFacts } from "@/domain/case";
import type { IsoDate } from "@/domain/common";
import type { EvaluationResult } from "@/domain/result";
import { airKnowledgeBase, railKnowledgeBase } from "@/knowledge";
import type { AirKnowledgeBase, RailKnowledgeBase } from "@/knowledge/schema";
import { evaluateAir } from "./air";
import { todayIso } from "./dates";
import { evaluateRail } from "./rail";

export type EvaluateOptions = {
  /** Für die Fristprüfung. Standard: heute. */
  today?: IsoDate;
  /** Für Tests: eigene Wissensbasis statt der Dateien. */
  rail?: RailKnowledgeBase;
  air?: AirKnowledgeBase;
};

/**
 * Einstiegspunkt der Regel-Engine. Deterministisch: gleiche Eingabe, gleiches Ergebnis.
 * Die KI ruft diese Funktion auf, sie rechnet nie selbst.
 */
export function evaluateCase(facts: CaseFacts, options: EvaluateOptions = {}): EvaluationResult {
  const today = options.today ?? todayIso();
  return facts.mode === "rail"
    ? evaluateRail(facts, options.rail ?? railKnowledgeBase, { today })
    : evaluateAir(facts, options.air ?? airKnowledgeBase, { today });
}

export { REASON_CODES, type ReasonCode } from "./reasons";
