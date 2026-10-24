import type { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";

/*
 * Begleit-E-Mail zum Antrag (Demo-Zustellung statt Post).
 * Formuliert für Sachbearbeiter bei Bahn oder Airline: was im Anhang ist,
 * um welche Fahrt es geht, was beantragt wird. Immer auf Deutsch, weil die Empfänger deutsche Stellen sind.
 */

type Sender = { firstName: string; lastName: string; bookingRef?: string; recipient: string[] };

const de = (iso?: string) => {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const eur = (v?: number) => (v === undefined ? "–" : `${v.toFixed(2).replace(".", ",")} €`);

const TICKET_LABEL: Record<string, string> = {
  single: "Einzelfahrkarte",
  return: "Hin- und Rückfahrkarte",
  deutschlandticket: "Deutschlandticket (Zeitkarte)",
  season_ticket: "Zeitkarte Nahverkehr",
  season_ticket_long_distance: "Zeitkarte Fernverkehr",
  bahncard100: "BahnCard 100",
};

function demoFooter(recipient: string[]): string {
  return [
    "—",
    "Hinweis: Diese E-Mail ist eine Demonstration der App „Claim Mate“ (Hackathon-Prototyp) und enthält Testdaten.",
    `Im echten Betrieb wird der Antrag als unterschriebener Brief per Post verschickt an: ${recipient.join(", ")}.`,
  ].join("\n");
}

export function buildClaimEmail(facts: CaseFacts, result: EvaluationResult, sender: Sender): { subject: string; text: string } {
  const name = `${sender.firstName} ${sender.lastName}`.trim();

  if (facts.mode === "rail") {
    const first = facts.journeys[0] ?? {};
    const multiple = facts.journeys.length > 1;
    const subject = multiple
      ? `Antrag auf Entschädigung nach VO (EU) 2021/782 – ${facts.journeys.length} verspätete Fahrten (${TICKET_LABEL[facts.ticketType ?? ""] ?? "Zeitkarte"})`
      : `Antrag auf Entschädigung nach VO (EU) 2021/782 – ${first.trainNumber ?? "Zugfahrt"} am ${de(first.date)}`;

    const journeys = facts.journeys.map((j, i) =>
      [
        multiple ? `Fahrt ${i + 1}:` : null,
        `- Zug: ${j.trainNumber ?? "–"}`,
        `- Datum: ${de(j.date)}`,
        `- Strecke: ${j.from ?? "–"} – ${j.to ?? "–"}`,
        `- Verspätung am Zielbahnhof: ${j.arrivalDelayMinutes !== undefined ? `${j.arrivalDelayMinutes} Minuten` : "–"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const ticket = `${TICKET_LABEL[facts.ticketType ?? ""] ?? "–"}${facts.ticketPriceEur !== undefined ? `, Fahrpreis ${eur(facts.ticketPriceEur)}` : ""}`;
    const basis = multiple || facts.ticketType === "deutschlandticket" || facts.ticketType?.startsWith("season") || facts.ticketType === "bahncard100"
      ? "Pauschale für Zeitkarten je Fahrt mit mind. 60 Minuten Verspätung"
      : "Art. 19 VO (EU) 2021/782";

    const text = [
      "Sehr geehrte Damen und Herren,",
      "",
      `im Anhang (antrag.pdf) erhalten Sie meinen Antrag auf Fahrgastrechte-Entschädigung wegen ${multiple ? "mehrerer verspäteter Fahrten" : "einer verspäteten Ankunft"}.`,
      "Die PDF-Datei enthält:",
      "1. ein kurzes Anschreiben (Seite 1),",
      "2. das ausgefüllte und unterschriebene Fahrgastrechte-Formular (ab Seite 2), einschließlich Bankverbindung für die Überweisung.",
      "",
      `Angaben zur ${multiple ? "Reise" : "Fahrt"}:`,
      ...journeys,
      `- Fahrkarte: ${ticket}`,
      "",
      `Beantragte Entschädigung: ${eur(result.totalEur)} (${basis}).`,
      "",
      "Bitte überweisen Sie den Betrag auf das im Formular angegebene Konto. Die Fahrkarte reiche ich auf Anfrage gerne nach.",
      "",
      "Mit freundlichen Grüßen",
      name,
      "",
      demoFooter(sender.recipient),
    ].join("\n");
    return { subject, text };
  }

  const incident =
    facts.incident === "cancellation"
      ? `Annullierung${facts.cancellationNoticeDays === 0 ? ", mitgeteilt erst am Abflugtag" : facts.cancellationNoticeDays !== undefined ? `, mitgeteilt ${facts.cancellationNoticeDays} Tage vor Abflug` : ""}${facts.reroutingOffered === false ? ", kein Ersatzflug angeboten" : ""}`
      : facts.incident === "denied_boarding"
        ? "Nichtbeförderung gegen meinen Willen"
        : `Verspätung am Endziel: ${facts.arrivalDelayMinutes ?? "–"} Minuten`;
  const subject = `Ausgleichszahlung nach Art. 7 VO (EG) Nr. 261/2004 – Flug ${facts.flightNumber ?? ""} am ${de(facts.flightDate)}`;
  const text = [
    "Sehr geehrte Damen und Herren,",
    "",
    "im Anhang (antrag.pdf) erhalten Sie mein unterschriebenes Schreiben mit der Forderung einer Ausgleichszahlung nach der Verordnung (EG) Nr. 261/2004, einschließlich Bankverbindung für die Überweisung.",
    "",
    "Angaben zum Flug:",
    `- Flug: ${facts.flightNumber ?? "–"}${facts.airline ? ` (${facts.airline})` : ""}`,
    `- Datum: ${de(facts.flightDate)}`,
    `- Strecke: ${facts.departureAirport ?? "–"} – ${facts.arrivalAirport ?? "–"}`,
    `- Vorfall: ${incident}`,
    sender.bookingRef ? `- Buchungsnummer: ${sender.bookingRef}` : null,
    "",
    `Geforderte Ausgleichszahlung: ${eur(result.totalEur)} (Art. 7 VO (EG) Nr. 261/2004).`,
    "",
    "Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das im Schreiben angegebene Konto. Buchungsbestätigung bzw. Bordkarte reiche ich auf Anfrage gerne nach.",
    "",
    "Mit freundlichen Grüßen",
    name,
    "",
    demoFooter(sender.recipient),
  ]
    .filter((line) => line !== null)
    .join("\n");
  return { subject, text };
}
