import { selectRuleVersion } from "@/knowledge";
import type { Rule } from "@/knowledge/schema";

type Picked<R> = { [K in keyof R]: R[K] extends Array<infer E> ? E : never };

/**
 * Wählt für alle Regeln einer Wissensbasis die Version, die am Reisedatum galt.
 * Fehlt für eine Regel eine passende Version, gibt sie `undefined` zurück.
 */
export function pickRules<R extends Record<string, Rule<unknown>>>(rules: R, date: string): Picked<R> | undefined {
  const out: Partial<Picked<R>> = {};
  for (const key of Object.keys(rules) as (keyof R)[]) {
    const version = selectRuleVersion(rules[key], date);
    if (!version) return undefined;
    out[key] = version as Picked<R>[typeof key];
  }
  return out as Picked<R>;
}
