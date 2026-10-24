import type { AirCaseFacts } from "@/domain/case";
import type { IsoDate } from "@/domain/common";
import type { EvaluationResult } from "@/domain/result";
import type { AirKnowledgeBase } from "@/knowledge/schema";
import { distanceKm, findAirport } from "./airports";
import { Collector, roundEur } from "./collect";
import { computeDeadline } from "./dates";
import { pickRules } from "./pick";
import { reason } from "./reasons";

type Options = { today: IsoDate };

/** Bänder aufsteigend sortieren, "darüber" (null) zuletzt, und das passende finden. */
function findBand<B extends { upToKm: number | null }>(bands: B[], km: number): B {
  const sorted = [...bands].sort((a, b) => (a.upToKm ?? Infinity) - (b.upToKm ?? Infinity));
  return sorted.find((b) => b.upToKm === null || km <= b.upToKm) ?? sorted[sorted.length - 1];
}

/** Wertet einen Flug-Fall gegen die Wissensbasis aus. Rechnet nur mit Werten aus der Wissensbasis. */
export function evaluateAir(facts: AirCaseFacts, kb: AirKnowledgeBase, { today }: Options): EvaluationResult {
  const c = new Collector();
  const { flightDate, departureAirport, arrivalAirport, incident } = facts;

  if (!flightDate) c.need("flightDate");
  if (!departureAirport) c.need("departureAirport");
  if (!arrivalAirport) c.need("arrivalAirport");
  if (!incident) c.need("incident");
  if (!flightDate || !departureAirport || !arrivalAirport || !incident) {
    c.add(reason("MISSING_FACTS"));
    return c.result({ mode: "air", outcome: "unclear" });
  }

  const rules = pickRules(kb.rules, flightDate);
  if (!rules) {
    c.add(reason("NO_RULES_FOR_DATE", { date: flightDate }));
    return c.result({ mode: "air", outcome: "unclear" });
  }

  const submission = c.use("air.submission", rules.submission).channels;
  const deadline = computeDeadline(c.use("air.claimDeadline", rules.claimDeadline), flightDate);
  const out = (outcome: EvaluationResult["outcome"], extra: Partial<EvaluationResult> = {}) =>
    c.result({ mode: "air", outcome, submission, deadline, ...extra });
  const missing = (path: string) => {
    c.need(path);
    c.add(reason("MISSING_FACTS"));
    return out("unclear");
  };

  // Flughäfen und Geltungsbereich
  const dep = findAirport(departureAirport);
  const arr = findAirport(arrivalAirport);
  for (const [code, airport] of [[departureAirport, dep], [arrivalAirport, arr]] as const) {
    if (!airport) c.add(reason("UNKNOWN_AIRPORT", { code }));
  }
  if (!dep || !arr) return out("unclear");

  const covered = c.use("air.coveredCountries", rules.coveredCountries).countries;
  const depCovered = covered.includes(dep.country);
  const arrCovered = covered.includes(arr.country);
  if (!depCovered) {
    // Flüge in den Geltungsbereich zählen nur mit einer EU-Airline.
    if (!arrCovered) {
      c.add(reason("OUT_OF_SCOPE"));
      return out("not_eligible");
    }
    if (facts.airlineIsEuCarrier === undefined) return missing("airlineIsEuCarrier");
    if (!facts.airlineIsEuCarrier) {
      c.add(reason("OUT_OF_SCOPE"));
      return out("not_eligible");
    }
  }

  const km = distanceKm(dep, arr);
  const band = findBand(c.use("air.compensationBands", rules.compensationBands).bands, km);
  let amount =
    depCovered && arrCovered && band.withinCoveredAreaAmountEur !== undefined
      ? band.withinCoveredAreaAmountEur
      : band.amountEur;

  // Ausnahmen gelten für Verspätung und Annullierung, nicht für Nichtbeförderung.
  if (incident !== "denied_boarding") {
    const exempt = c.use("air.exemptCauses", rules.exemptCauses).causes;
    if (facts.cause && exempt.includes(facts.cause)) {
      c.add(reason("CAUSE_EXEMPT", { cause: facts.cause }));
      return out("not_eligible");
    }
  }

  if (incident === "delay") {
    const delay = facts.arrivalDelayMinutes;
    if (delay === undefined) return missing("arrivalDelayMinutes");
    const threshold = c.use("air.delayThreshold", rules.delayThreshold).minDelayMinutes;
    if (delay < threshold) {
      c.add(reason("DELAY_BELOW_THRESHOLD", { delayMinutes: delay, thresholdMinutes: threshold }));
      return out("not_eligible");
    }
    c.add(reason("FLIGHT_DELAY_REACHED", { delayMinutes: delay, thresholdMinutes: threshold }));
    // Hinweis für Schritt 8: Ob die 50-%-Kürzung auch bei reiner Verspätung gilt, prüfen.
  }

  if (incident === "cancellation") {
    const notice = facts.cancellationNoticeDays;
    if (notice === undefined) return missing("cancellationNoticeDays");
    const rule = c.use("air.cancellationNotice", rules.cancellationNotice);
    if (notice >= rule.noCompensationFromNoticeDays) {
      c.add(reason("CANCELLATION_NOTICE_IN_TIME", { noticeDays: notice, requiredDays: rule.noCompensationFromNoticeDays }));
      return out("not_eligible");
    }
    c.add(reason("CANCELLATION_LATE_NOTICE", { noticeDays: notice }));

    if (facts.reroutingOffered === undefined) return missing("reroutingOffered");
    if (facts.reroutingOffered) {
      const window = rule.windows.find((w) => notice >= w.minNoticeDays && notice <= w.maxNoticeDays);
      if (window) {
        if (facts.reroutingEarlierDepartureMinutes === undefined) return missing("reroutingEarlierDepartureMinutes");
        if (facts.reroutingLaterArrivalMinutes === undefined) return missing("reroutingLaterArrivalMinutes");
        if (
          facts.reroutingEarlierDepartureMinutes <= window.maxEarlierDepartureMinutes &&
          facts.reroutingLaterArrivalMinutes <= window.maxLaterArrivalMinutes
        ) {
          c.add(reason("REROUTING_WITHIN_LIMITS"));
          return out("not_eligible");
        }
      }
    }
  }

  if (incident === "denied_boarding") {
    if (facts.deniedBoardingVoluntary === undefined) return missing("deniedBoardingVoluntary");
    if (facts.deniedBoardingVoluntary) {
      c.add(reason("DENIED_BOARDING_VOLUNTARY"));
      return out("not_eligible");
    }
    c.add(reason("DENIED_BOARDING_INVOLUNTARY"));
  }

  const bandReason = reason("DISTANCE_BAND", { distanceKm: km, amountEur: amount });
  c.add(bandReason);

  // Kürzung, wenn ein Ersatzflug nur wenig später ankommt (Annullierung, Nichtbeförderung).
  if (incident !== "delay" && facts.reroutingOffered && facts.reroutingLaterArrivalMinutes !== undefined) {
    const reduction = c.use("air.reroutingReduction", rules.reroutingReduction);
    // Innergemeinschaftliche Flüge über 3500 km nutzen das 3500-km-Band (Art. 7 Abs. 2 b).
    const reductionKm = depCovered && arrCovered ? Math.min(km, 3500) : km;
    if (facts.reroutingLaterArrivalMinutes <= findBand(reduction.bands, reductionKm).maxLaterArrivalMinutes) {
      amount = roundEur((amount * (100 - reduction.percent)) / 100);
      c.add(reason("REDUCED_FOR_REROUTING", { percent: reduction.percent }));
    }
  }

  if (incident !== "denied_boarding" && (!facts.cause || facts.cause === "unknown")) {
    c.add(reason("CAUSE_UNKNOWN"));
  }

  const lines = [{ amountEur: amount, reason: bandReason }];
  if (deadline && today > deadline) {
    c.add(reason("DEADLINE_PASSED", { deadline }));
    return out("unclear", { lines });
  }
  return out("eligible", { totalEur: amount, lines });
}
