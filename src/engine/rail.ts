import type { RailCaseFacts, RailJourney } from "@/domain/case";
import type { IsoDate } from "@/domain/common";
import type { CompensationLine, EvaluationResult } from "@/domain/result";
import type { RailKnowledgeBase } from "@/knowledge/schema";
import { Collector, roundEur } from "./collect";
import { computeDeadline } from "./dates";
import { pickRules } from "./pick";
import { reason } from "./reasons";

type Options = { today: IsoDate };
type FlatRateTicket = "deutschlandticket" | "season_ticket" | "season_ticket_long_distance" | "bahncard100";

const FLAT_RATE_TICKETS: readonly string[] = ["deutschlandticket", "season_ticket", "season_ticket_long_distance", "bahncard100"];

/** Wertet einen Bahn-Fall gegen die Wissensbasis aus. Rechnet nur mit Werten aus der Wissensbasis. */
export function evaluateRail(facts: RailCaseFacts, kb: RailKnowledgeBase, options: Options): EvaluationResult {
  const c = new Collector();
  const first = facts.journeys[0];

  if (!facts.ticketType) c.need("ticketType");
  if (!first) {
    c.need("journeys.0.date");
    c.need("journeys.0.arrivalDelayMinutes");
  }
  if (!facts.ticketType || !first) {
    c.add(reason("MISSING_FACTS"));
    return c.result({ mode: "rail", outcome: "unclear" });
  }

  return FLAT_RATE_TICKETS.includes(facts.ticketType)
    ? evaluateFlatRate(facts, facts.ticketType as FlatRateTicket, kb, options, c)
    : evaluatePricedTicket(facts, first, kb, options, c);
}

// ---------- Einzel- und Rückfahrkarten: Prozent vom Fahrpreis ----------

function evaluatePricedTicket(
  facts: RailCaseFacts,
  journey: RailJourney,
  kb: RailKnowledgeBase,
  { today }: Options,
  c: Collector,
): EvaluationResult {
  if (!journey.date) {
    c.need("journeys.0.date");
    c.add(reason("MISSING_FACTS"));
    return c.result({ mode: "rail", outcome: "unclear" });
  }

  const rules = pickRules(kb.rules, journey.date);
  if (!rules) {
    c.add(reason("NO_RULES_FOR_DATE", { date: journey.date }));
    return c.result({ mode: "rail", outcome: "unclear" });
  }

  const submission = c.use("rail.submission", rules.submission).channels;
  const deadline = computeDeadline(c.use("rail.claimDeadline", rules.claimDeadline), journey.date);
  const out = (outcome: EvaluationResult["outcome"], extra: Partial<EvaluationResult> = {}) =>
    c.result({ mode: "rail", outcome, submission, deadline, ...extra });

  const delay = journey.arrivalDelayMinutes;
  if (delay === undefined) {
    c.need("journeys.0.arrivalDelayMinutes");
    c.add(reason("MISSING_FACTS"));
    return out("unclear");
  }

  const compensation = c.use("rail.delayCompensation", rules.delayCompensation);
  const legShare = (price: number) =>
    facts.ticketType === "return" ? (price * compensation.returnTicketLegPercent) / 100 : price;

  // Abbruch / Nichtantritt: Erstattung. Die Ausnahmen (z. B. Unwetter) gelten hier nicht.
  if (journey.journeyAbandoned) {
    const { minExpectedDelayMinutes } = c.use("rail.fullRefund", rules.fullRefund);
    if (delay >= minExpectedDelayMinutes || journey.incident === "cancellation") {
      if (facts.ticketPriceEur === undefined) {
        c.need("ticketPriceEur");
        c.add(reason("MISSING_FACTS"));
        return out("unclear");
      }
      const amount = roundEur(legShare(facts.ticketPriceEur));
      const r = reason("FULL_REFUND", { amountEur: amount });
      c.add(r);
      return finish(amount, [{ journeyIndex: 0, amountEur: amount, reason: r }]);
    }
  }

  const exempt = c.use("rail.exemptCauses", rules.exemptCauses).causes;
  if (journey.cause && exempt.includes(journey.cause)) {
    c.add(reason("CAUSE_EXEMPT", { cause: journey.cause }));
    return out("not_eligible");
  }

  const tiers = [...compensation.tiers].sort((a, b) => b.minDelayMinutes - a.minDelayMinutes);
  const tier = tiers.find((t) => delay >= t.minDelayMinutes);
  if (!tier) {
    const threshold = tiers[tiers.length - 1].minDelayMinutes;
    c.add(reason("DELAY_BELOW_THRESHOLD", { delayMinutes: delay, thresholdMinutes: threshold }));
    return out("not_eligible");
  }

  const tierReason = reason("DELAY_TIER_REACHED", { delayMinutes: delay, percent: tier.percentOfPrice });
  c.add(tierReason);
  if (!journey.cause || journey.cause === "unknown") c.add(reason("CAUSE_UNKNOWN"));

  if (facts.ticketPriceEur === undefined) {
    c.need("ticketPriceEur");
    c.add(reason("MISSING_FACTS"));
    return out("unclear");
  }
  if (facts.ticketType === "return") {
    c.add(reason("RETURN_TICKET_LEG", { percent: compensation.returnTicketLegPercent }));
  }

  const amount = roundEur((legShare(facts.ticketPriceEur) * tier.percentOfPrice) / 100);
  return finish(amount, [{ journeyIndex: 0, amountEur: amount, reason: tierReason }]);

  function finish(amount: number, lines: CompensationLine[]): EvaluationResult {
    const minimum = c.use("rail.minimumPayout", rules!.minimumPayout).amountEur;
    if (amount < minimum) {
      c.add(reason("BELOW_MINIMUM_PAYOUT", { amountEur: amount, minimumEur: minimum }));
      return out("not_eligible", { lines });
    }
    if (deadline && today > deadline) {
      c.add(reason("DEADLINE_PASSED", { deadline }));
      return out("unclear", { lines });
    }
    return out("eligible", { totalEur: amount, lines });
  }
}

// ---------- Zeitkarten: Pauschale pro verspäteter Fahrt, zusammengezählt ----------

function evaluateFlatRate(
  facts: RailCaseFacts,
  ticketType: FlatRateTicket,
  kb: RailKnowledgeBase,
  { today }: Options,
  c: Collector,
): EvaluationResult {
  // Das Deutschlandticket gilt nur in der 2. Klasse.
  const travelClass = facts.travelClass ?? (ticketType === "deutschlandticket" ? 2 : undefined);
  if (!travelClass) c.need("travelClass");

  const lines: CompensationLine[] = [];
  const evaluatedDates: IsoDate[] = [];
  let unsupported = false;

  facts.journeys.forEach((journey, index) => {
    if (!journey.date) c.need(`journeys.${index}.date`);
    if (journey.arrivalDelayMinutes === undefined) c.need(`journeys.${index}.arrivalDelayMinutes`);
    if (!journey.date || journey.arrivalDelayMinutes === undefined) return;

    const rules = pickRules(kb.rules, journey.date);
    if (!rules) {
      c.add(reason("NO_RULES_FOR_DATE", { date: journey.date, journeyIndex: index }));
      return;
    }
    evaluatedDates.push(journey.date);

    const rate = c.use("rail.flatRateCompensation", rules.flatRateCompensation)[ticketType];
    if (!rate) {
      unsupported = true;
      return;
    }

    const exempt = c.use("rail.exemptCauses", rules.exemptCauses).causes;
    if (journey.cause && exempt.includes(journey.cause)) {
      c.add(reason("CAUSE_EXEMPT", { cause: journey.cause, journeyIndex: index }));
      return;
    }

    if (journey.arrivalDelayMinutes < rate.minDelayMinutes) {
      c.add(
        reason("DELAY_BELOW_THRESHOLD", {
          delayMinutes: journey.arrivalDelayMinutes,
          thresholdMinutes: rate.minDelayMinutes,
          journeyIndex: index,
        }),
      );
      return;
    }

    if (!travelClass) return;
    const amount = travelClass === 1 ? (rate.class1Eur ?? rate.class2Eur) : rate.class2Eur;
    const r = reason("FLAT_RATE_JOURNEY", {
      amountEur: amount,
      delayMinutes: journey.arrivalDelayMinutes,
      journeyIndex: index,
    });
    c.add(r);
    lines.push({ journeyIndex: index, amountEur: amount, reason: r });
  });

  if (unsupported) c.add(reason("UNSUPPORTED_TICKET", { ticketType }));

  if (evaluatedDates.length === 0) {
    if (c.missing.length > 0) c.add(reason("MISSING_FACTS"));
    return c.result({ mode: "rail", outcome: "unclear" });
  }

  // Frist ab der frühesten Fahrt, Mindestbetrag und Einreichung nach der neuesten.
  const sorted = [...evaluatedDates].sort();
  const earliest = pickRules(kb.rules, sorted[0])!;
  const latest = pickRules(kb.rules, sorted[sorted.length - 1])!;
  const deadline = computeDeadline(c.use("rail.claimDeadline", earliest.claimDeadline), sorted[0]);
  const submission = c.use("rail.submission", latest.submission).channels;
  const minimum = c.use("rail.minimumPayout", latest.minimumPayout).amountEur;
  const out = (outcome: EvaluationResult["outcome"], extra: Partial<EvaluationResult> = {}) =>
    c.result({ mode: "rail", outcome, submission, deadline, lines, ...extra });

  const total = roundEur(lines.reduce((sum, line) => sum + line.amountEur, 0));
  if (lines.length > 1) c.add(reason("FLAT_RATE_SUMMED", { count: lines.length, amountEur: total }));
  if (c.missing.length > 0) c.add(reason("MISSING_FACTS"));

  if (total < minimum) {
    // Mit fehlenden Angaben könnte der Mindestbetrag noch erreicht werden.
    if (c.missing.length > 0) return out("unclear");
    if (total > 0) c.add(reason("BELOW_MINIMUM_PAYOUT", { amountEur: total, minimumEur: minimum }));
    return out("not_eligible");
  }
  if (deadline && today > deadline) {
    c.add(reason("DEADLINE_PASSED", { deadline }));
    return out("unclear");
  }
  return out("eligible", { totalEur: total });
}
