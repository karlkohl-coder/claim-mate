import type { AppliedRule, EvaluationResult } from "@/domain/result";
import type { RuleVersion } from "@/knowledge/schema";
import type { TypedReason } from "./reasons";

/**
 * Sammelt während einer Auswertung, welche Regeln verwendet wurden,
 * welche Angaben fehlen und welche Begründungen anfallen.
 */
export class Collector {
  readonly reasons: TypedReason[] = [];
  readonly missing: string[] = [];
  private readonly applied = new Map<string, AppliedRule>();

  use<V>(name: string, version: RuleVersion<V>): V {
    const key = `${name}@${version.validFrom}`;
    if (!this.applied.has(key)) {
      this.applied.set(key, {
        rule: name,
        validFrom: version.validFrom,
        status: version.status,
        sources: version.sources,
      });
    }
    return version.value;
  }

  add(r: TypedReason) {
    this.reasons.push(r);
  }

  need(path: string) {
    if (!this.missing.includes(path)) this.missing.push(path);
  }

  result(
    base: Pick<EvaluationResult, "mode" | "outcome"> & Partial<EvaluationResult>,
  ): EvaluationResult {
    const appliedRules = [...this.applied.values()];
    const outcome = base.outcome;
    return {
      lines: [],
      submission: [],
      ...base,
      totalEur: outcome === "eligible" ? base.totalEur : undefined,
      reasons: this.reasons,
      missingFacts: this.missing,
      appliedRules,
      usesPlaceholders: appliedRules.some((r) => r.status === "placeholder"),
    };
  }
}

export function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}
