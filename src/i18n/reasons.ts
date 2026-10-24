import type { ReasonCode, ReasonParams } from "@/engine/reasons";
import type { Locale } from "./config";

/*
 * Texte zu den Begründungs-Codes der Engine. Werden in der Ergebnis-Karte angezeigt
 * und der KI mitgegeben, damit sie dieselben Formulierungen verwendet.
 */

export function formatEur(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { style: "currency", currency: "EUR" }).format(value);
}

export function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const CAUSES: Record<Locale, Record<string, string>> = {
  de: {
    extreme_weather: "extremes Wetter",
    natural_disaster: "Naturkatastrophe",
    public_health_crisis: "Gesundheitskrise",
    third_party: "Einwirkung Dritter (z. B. Personen im Gleis)",
    passenger_fault: "eigenes Verschulden",
    weather: "Wetter",
    air_traffic_control: "Flugsicherung / Lotsenstreik",
    security: "Sicherheitsrisiko",
    bird_strike: "Vogelschlag",
    other_extraordinary: "außergewöhnlicher Umstand",
  },
  en: {
    extreme_weather: "extreme weather",
    natural_disaster: "natural disaster",
    public_health_crisis: "public health crisis",
    third_party: "third-party action (e.g. people on the tracks)",
    passenger_fault: "passenger's own fault",
    weather: "weather",
    air_traffic_control: "air traffic control / controllers' strike",
    security: "security risk",
    bird_strike: "bird strike",
    other_extraordinary: "extraordinary circumstance",
  },
};

type Render = (p: ReasonParams, locale: Locale) => string;
const n = (p: ReasonParams, key: string) => Number(p[key]);
const eur = (p: ReasonParams, key: string, l: Locale) => formatEur(n(p, key), l);
const trip = (p: ReasonParams, l: Locale) =>
  p.journeyIndex === undefined ? "" : l === "de" ? `Fahrt ${n(p, "journeyIndex") + 1}: ` : `Trip ${n(p, "journeyIndex") + 1}: `;

const de: Record<ReasonCode, Render> = {
  NO_RULES_FOR_DATE: (p) => `Für das Reisedatum ${formatDate(String(p.date), "de")} liegen keine Regeln vor.`,
  MISSING_FACTS: () => "Es fehlen noch Angaben.",
  CAUSE_EXEMPT: (p) => `${trip(p, "de")}Bei dieser Ursache (${CAUSES.de[String(p.cause)] ?? p.cause}) gibt es keine Entschädigung.`,
  CAUSE_UNKNOWN: () => "Die Ursache ist unbekannt. Will das Unternehmen nicht zahlen, muss es einen Ausnahmegrund nachweisen.",
  DEADLINE_PASSED: (p) => `Die Frist ist am ${formatDate(String(p.deadline), "de")} abgelaufen.`,
  BELOW_MINIMUM_PAYOUT: (p) =>
    `${eur(p, "amountEur", "de")} liegen unter dem Mindestbetrag von ${eur(p, "minimumEur", "de")}. Bei Zeitkarten kannst du Verspätungen sammeln.`,
  DELAY_BELOW_THRESHOLD: (p) => `${trip(p, "de")}${n(p, "delayMinutes")} Minuten Verspätung liegen unter der Schwelle von ${n(p, "thresholdMinutes")} Minuten.`,
  DELAY_TIER_REACHED: (p) => `${n(p, "delayMinutes")} Minuten Verspätung: ${n(p, "percent")} % des Fahrpreises.`,
  RETURN_TICKET_LEG: (p) => `Bei Hin- und Rückfahrt zählen ${n(p, "percent")} % des Preises als Preis dieser Fahrt.`,
  FULL_REFUND: (p) => `Reise abgebrochen oder nicht angetreten: Erstattung von ${eur(p, "amountEur", "de")}.`,
  FLAT_RATE_JOURNEY: (p) => `${trip(p, "de")}${n(p, "delayMinutes")} Minuten Verspätung, Pauschale ${eur(p, "amountEur", "de")}.`,
  FLAT_RATE_SUMMED: (p) => `${n(p, "count")} Verspätungen zusammengezählt: ${eur(p, "amountEur", "de")}.`,
  UNSUPPORTED_TICKET: () => "Für diese Ticketart ist keine Pauschale hinterlegt.",
  OUT_OF_SCOPE: () => "Dieser Flug fällt nicht unter die EU-Fluggastrechte.",
  UNKNOWN_AIRPORT: (p) => `Den Flughafen ${p.code} kennen wir nicht. Bitte prüfe den Code.`,
  DISTANCE_BAND: (p) => `Flugstrecke rund ${n(p, "distanceKm").toLocaleString("de-DE")} km: ${eur(p, "amountEur", "de")}.`,
  FLIGHT_DELAY_REACHED: (p) => `${n(p, "delayMinutes")} Minuten Verspätung am Ziel, ab ${n(p, "thresholdMinutes")} Minuten gibt es Geld.`,
  CANCELLATION_NOTICE_IN_TIME: (p) => `Die Annullierung wurde ${n(p, "noticeDays")} Tage vorher mitgeteilt, also rechtzeitig (ab ${n(p, "requiredDays")} Tagen).`,
  CANCELLATION_LATE_NOTICE: (p) =>
    n(p, "noticeDays") === 0 ? "Die Annullierung wurde erst am Abflugtag mitgeteilt." : `Die Annullierung wurde erst ${n(p, "noticeDays")} Tage vorher mitgeteilt.`,
  REROUTING_WITHIN_LIMITS: () => "Der Ersatzflug lag zeitlich so nah am ursprünglichen Flug, dass keine Entschädigung fällig ist.",
  REDUCED_FOR_REROUTING: (p) => `Die Entschädigung wird um ${n(p, "percent")} % gekürzt, weil der Ersatzflug nur wenig später ankam.`,
  DENIED_BOARDING_INVOLUNTARY: () => "Du wurdest gegen deinen Willen nicht befördert.",
  DENIED_BOARDING_VOLUNTARY: () => "Du hast freiwillig auf deinen Platz verzichtet. Es gilt, was du mit der Airline vereinbart hast.",
};

const en: Record<ReasonCode, Render> = {
  NO_RULES_FOR_DATE: (p) => `There are no rules for the travel date ${formatDate(String(p.date), "en")}.`,
  MISSING_FACTS: () => "Some information is still missing.",
  CAUSE_EXEMPT: (p) => `${trip(p, "en")}No compensation is due for this cause (${CAUSES.en[String(p.cause)] ?? p.cause}).`,
  CAUSE_UNKNOWN: () => "The cause is unknown. If the company refuses to pay, it has to prove an exemption.",
  DEADLINE_PASSED: (p) => `The deadline expired on ${formatDate(String(p.deadline), "en")}.`,
  BELOW_MINIMUM_PAYOUT: (p) =>
    `${eur(p, "amountEur", "en")} is below the minimum payout of ${eur(p, "minimumEur", "en")}. With season tickets you can collect delays.`,
  DELAY_BELOW_THRESHOLD: (p) => `${trip(p, "en")}A delay of ${n(p, "delayMinutes")} minutes is below the threshold of ${n(p, "thresholdMinutes")} minutes.`,
  DELAY_TIER_REACHED: (p) => `${n(p, "delayMinutes")} minutes late: ${n(p, "percent")}% of the fare.`,
  RETURN_TICKET_LEG: (p) => `For a return ticket, ${n(p, "percent")}% of the price counts as the fare of this trip.`,
  FULL_REFUND: (p) => `Journey abandoned or not started: refund of ${eur(p, "amountEur", "en")}.`,
  FLAT_RATE_JOURNEY: (p) => `${trip(p, "en")}${n(p, "delayMinutes")} minutes late, flat rate ${eur(p, "amountEur", "en")}.`,
  FLAT_RATE_SUMMED: (p) => `${n(p, "count")} delays added up: ${eur(p, "amountEur", "en")}.`,
  UNSUPPORTED_TICKET: () => "No flat rate is defined for this ticket type.",
  OUT_OF_SCOPE: () => "This flight is not covered by EU air passenger rights.",
  UNKNOWN_AIRPORT: (p) => `We don't know the airport ${p.code}. Please check the code.`,
  DISTANCE_BAND: (p) => `Flight distance about ${n(p, "distanceKm").toLocaleString("en-GB")} km: ${eur(p, "amountEur", "en")}.`,
  FLIGHT_DELAY_REACHED: (p) => `${n(p, "delayMinutes")} minutes late at the destination; compensation starts at ${n(p, "thresholdMinutes")} minutes.`,
  CANCELLATION_NOTICE_IN_TIME: (p) => `The cancellation was announced ${n(p, "noticeDays")} days in advance, which is in time (${n(p, "requiredDays")}+ days).`,
  CANCELLATION_LATE_NOTICE: (p) =>
    n(p, "noticeDays") === 0 ? "The cancellation was announced only on the day of departure." : `The cancellation was announced only ${n(p, "noticeDays")} days in advance.`,
  REROUTING_WITHIN_LIMITS: () => "The replacement flight was close enough to the original schedule that no compensation is due.",
  REDUCED_FOR_REROUTING: (p) => `Compensation is reduced by ${n(p, "percent")}% because the replacement flight arrived only slightly later.`,
  DENIED_BOARDING_INVOLUNTARY: () => "You were denied boarding against your will.",
  DENIED_BOARDING_VOLUNTARY: () => "You gave up your seat voluntarily. What you agreed with the airline applies.",
};

const RENDER: Record<Locale, Record<ReasonCode, Render>> = { de, en };

export function renderReason(reason: { code: string; params?: ReasonParams }, locale: Locale): string {
  const render = RENDER[locale][reason.code as ReasonCode];
  return render ? render(reason.params ?? {}, locale) : reason.code;
}

// ---------- Bezeichnungen fehlender Angaben ----------

const FACT_LABELS: Record<Locale, Record<string, string>> = {
  de: {
    ticketType: "Ticketart",
    travelClass: "Klasse",
    ticketPriceEur: "Fahrpreis",
    date: "Reisedatum",
    arrivalDelayMinutes: "Verspätung am Ziel",
    flightDate: "Flugdatum",
    departureAirport: "Abflughafen",
    arrivalAirport: "Zielflughafen",
    incident: "Art des Problems",
    airlineIsEuCarrier: "Airline aus der EU?",
    cancellationNoticeDays: "Wann informiert?",
    reroutingOffered: "Ersatzflug angeboten?",
    reroutingEarlierDepartureMinutes: "Ersatzflug: früherer Abflug",
    reroutingLaterArrivalMinutes: "Ersatzflug: spätere Ankunft",
    deniedBoardingVoluntary: "Freiwillig verzichtet?",
  },
  en: {
    ticketType: "Ticket type",
    travelClass: "Class",
    ticketPriceEur: "Fare",
    date: "Travel date",
    arrivalDelayMinutes: "Delay at destination",
    flightDate: "Flight date",
    departureAirport: "Departure airport",
    arrivalAirport: "Arrival airport",
    incident: "Type of problem",
    airlineIsEuCarrier: "EU airline?",
    cancellationNoticeDays: "When informed?",
    reroutingOffered: "Replacement flight offered?",
    reroutingEarlierDepartureMinutes: "Replacement: earlier departure",
    reroutingLaterArrivalMinutes: "Replacement: later arrival",
    deniedBoardingVoluntary: "Gave up seat voluntarily?",
  },
};

/** "journeys.1.arrivalDelayMinutes" -> "Verspätung am Ziel (Fahrt 2)" */
export function renderFactLabel(path: string, locale: Locale): string {
  const parts = path.split(".");
  const key = parts[parts.length - 1];
  const label = FACT_LABELS[locale][key] ?? key;
  if (parts[0] === "journeys" && parts.length === 3) {
    const index = Number(parts[1]) + 1;
    return `${label} (${locale === "de" ? "Fahrt" : "trip"} ${index})`;
  }
  return label;
}
