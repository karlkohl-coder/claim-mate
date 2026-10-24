"use client";

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";

/*
 * Versandfertige Briefe als A4-PDF, erzeugt im Browser.
 * Bankdaten und Unterschrift gehen nie an die KI, nur in dieses PDF.
 * Adressfeld nach DIN 5008 (Form B) für Fensterumschläge.
 */

export type LetterData = {
  salutation: "female" | "male" | "neutral";
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  email?: string;
  iban: string;
  accountHolder: string;
  bookingRef?: string;
  plannedArrival?: string;
  actualArrival?: string;
  /** PNG als Data-URL. */
  signaturePng: string;
  recipient: string[];
};

const MM = 72 / 25.4;
const A4 = { w: 595.28, h: 841.89 };
const LEFT = 25 * MM;
const RIGHT = A4.w - 20 * MM;

const de = (iso?: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const todayDe = () => de(new Date().toISOString().slice(0, 10));
const eur = (v?: number) => (v === undefined ? "" : `${v.toFixed(2).replace(".", ",")} €`);
const formatIban = (iban: string) => iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Schreibt Absatz-Text ab y (von oben gemessen in pt) und gibt das neue y zurück. */
function paragraph(page: PDFPage, text: string, font: PDFFont, size: number, yTop: number, gap = 1.45): number {
  let y = yTop;
  for (const line of wrap(text, font, size, RIGHT - LEFT)) {
    page.drawText(line, { x: LEFT, y: A4.h - y, size, font, color: rgb(0.1, 0.1, 0.12) });
    y += size * gap;
  }
  return y;
}

/** Briefkopf: Rücksendeangabe, Empfänger im Fensterbereich, Datum. */
async function letterHead(doc: PDFDocument, data: LetterData, subject: string) {
  const page = doc.addPage([A4.w, A4.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sender = `${data.firstName} ${data.lastName}, ${data.street} ${data.houseNumber}, ${data.postcode} ${data.city}`;

  // Absender oben rechts
  [`${data.firstName} ${data.lastName}`, `${data.street} ${data.houseNumber}`, `${data.postcode} ${data.city}`, data.email ?? ""]
    .filter(Boolean)
    .forEach((line, i) => page.drawText(line, { x: 125 * MM, y: A4.h - (20 * MM + i * 12), size: 9.5, font }));

  // Rücksendeangabe + Empfänger (Fenster: 45 mm von oben, 85 mm breit)
  page.drawText(sender, { x: LEFT, y: A4.h - 50 * MM, size: 7, font, color: rgb(0.35, 0.35, 0.4) });
  page.drawLine({ start: { x: LEFT, y: A4.h - 51.5 * MM }, end: { x: LEFT + 85 * MM, y: A4.h - 51.5 * MM }, thickness: 0.4, color: rgb(0.6, 0.6, 0.6) });
  data.recipient.filter(Boolean).forEach((line, i) => page.drawText(line, { x: LEFT, y: A4.h - (58 * MM + i * 13), size: 11, font }));

  page.drawText(todayDe(), { x: RIGHT - font.widthOfTextAtSize(todayDe(), 10), y: A4.h - 98 * MM, size: 10, font });
  let y = paragraph(page, subject, bold, 11, 108 * MM);
  y += 8;
  return { page, font, bold, y };
}

async function signOff(doc: PDFDocument, page: PDFPage, font: PDFFont, data: LetterData, yTop: number) {
  let y = paragraph(page, "Mit freundlichen Grüßen", font, 10.5, yTop + 6);
  const png = await doc.embedPng(data.signaturePng);
  const height = 32;
  const width = (png.width / png.height) * height;
  page.drawImage(png, { x: LEFT, y: A4.h - y - height, width: Math.min(width, 170), height });
  y += height + 6;
  paragraph(page, `${data.firstName} ${data.lastName}`, font, 10.5, y);
}

// ---------- Flug: Anschreiben nach VO (EG) 261/2004 ----------

export async function buildAirLetter(facts: Extract<CaseFacts, { mode: "air" }>, result: EvaluationResult, data: LetterData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const flight = facts.flightNumber ?? "";
  const subject = `Ausgleichszahlung nach Art. 7 Verordnung (EG) Nr. 261/2004 – Flug ${flight} am ${de(facts.flightDate)}`;
  const { page, font, y: start } = await letterHead(doc, data, subject);

  const incident =
    facts.incident === "cancellation"
      ? `wurde annulliert${
          facts.cancellationNoticeDays === 0
            ? " (Mitteilung erst am Abflugtag)"
            : facts.cancellationNoticeDays !== undefined
              ? ` (Mitteilung ${facts.cancellationNoticeDays} Tage vor Abflug)`
              : ""
        }`
      : facts.incident === "denied_boarding"
        ? "wurde mir gegen meinen Willen die Beförderung verweigert"
        : `erreichte das Endziel mit einer Verspätung von ${facts.arrivalDelayMinutes ?? "?"} Minuten`;
  const salutation = data.salutation === "neutral" ? "Sehr geehrte Damen und Herren," : "Sehr geehrte Damen und Herren,";

  let y = paragraph(page, salutation, font, 10.5, start);
  y = paragraph(
    page,
    `ich war Fluggast auf dem Flug ${flight} von ${facts.departureAirport ?? "?"} nach ${facts.arrivalAirport ?? "?"} am ${de(facts.flightDate)}${data.bookingRef ? ` (Buchungsnummer ${data.bookingRef})` : ""}. Der Flug ${incident}.`,
    font,
    10.5,
    y + 6,
  );
  y = paragraph(
    page,
    `Nach Art. 7 der Verordnung (EG) Nr. 261/2004 steht mir eine Ausgleichszahlung in Höhe von ${eur(result.totalEur)} zu. Außergewöhnliche Umstände, die Sie von der Zahlung befreien würden, sind mir nicht bekannt; die Beweislast hierfür liegt bei Ihnen.`,
    font,
    10.5,
    y + 6,
  );
  y = paragraph(
    page,
    `Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf folgendes Konto:\nKontoinhaber: ${data.accountHolder}\nIBAN: ${formatIban(data.iban)}`,
    font,
    10.5,
    y + 6,
  );
  y = paragraph(page, "Eine Kopie der Buchungsbestätigung bzw. Bordkarte liegt bei oder kann nachgereicht werden.", font, 10.5, y + 6);
  await signOff(doc, page, font, data, y + 6);
  return doc.save();
}

// ---------- Bahn: Anschreiben + ausgefülltes DB-Fahrgastrechte-Formular ----------

export async function buildRailLetter(facts: Extract<CaseFacts, { mode: "rail" }>, result: EvaluationResult, data: LetterData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const journey = facts.journeys[0] ?? {};
  const subject = `Antrag auf Entschädigung (Fahrgastrechte) – ${journey.trainNumber ?? "Zugfahrt"} am ${de(journey.date)}`;
  const { page, font, y: start } = await letterHead(doc, data, subject);

  let y = paragraph(page, "Sehr geehrte Damen und Herren,", font, 10.5, start);
  y = paragraph(
    page,
    `anbei erhalten Sie mein ausgefülltes Fahrgastrechte-Formular für die Fahrt ${journey.from ? `von ${journey.from} nach ${journey.to ?? "?"} ` : ""}am ${de(journey.date)}${journey.arrivalDelayMinutes !== undefined ? ` mit einer Verspätung von ${journey.arrivalDelayMinutes} Minuten am Ziel` : ""}.`,
    font,
    10.5,
    y + 6,
  );
  if (result.totalEur !== undefined) {
    y = paragraph(page, `Ich bitte um Überweisung der Entschädigung (${eur(result.totalEur)}) auf das im Formular angegebene Konto.`, font, 10.5, y + 6);
  }
  y = paragraph(page, "Die Fahrkarte bzw. eine Kopie liegt bei oder kann nachgereicht werden.", font, 10.5, y + 6);
  await signOff(doc, page, font, data, y + 6);

  // Offizielles Formular laden und ausfüllen
  const formBytes = await fetch("/forms/db-fahrgastrechte-formular.pdf").then((r) => r.arrayBuffer());
  const formDoc = await PDFDocument.load(formBytes);
  const form = formDoc.getForm();
  const setText = (name: string, value?: string) => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      /* Feld fehlt in dieser Formularversion */
    }
  };
  const check = (name: string) => {
    try {
      form.getCheckBox(name).check();
    } catch {
      /* ignorieren */
    }
  };
  const radio = (name: string, option: string) => {
    try {
      form.getRadioGroup(name).select(option);
    } catch {
      /* ignorieren */
    }
  };
  const [yy, mm, dd] = (journey.date ?? "").split("-");
  const [ph, pm] = (data.plannedArrival ?? "").split(":");
  const [ah, am] = (data.actualArrival ?? "").split(":");

  radio(
    "journey",
    journey.journeyAbandoned
      ? "Reise nicht angetreten (Zugausfall oder erwartete Verspätung am Ziel von mind. 60 Minuten)"
      : "Verspätung am Ziel (mind. 60 Minuten)",
  );
  setText("planned_day", dd);
  setText("planned_month", mm);
  setText("planned_year", yy?.slice(2));
  radio("planned_direction", "Hinfahrt");
  setText("planned_departure_station", journey.from);
  setText("planned_destination_station", journey.to);
  setText("planned_destination_hours", ph);
  setText("planned_destination_minutes", pm);
  setText("arrived_day", dd);
  setText("arrived_month", mm);
  setText("arrived_year", yy?.slice(2));
  setText("arrived_hours", ah);
  setText("arrived_minutes", am);

  if (facts.ticketType === "bahncard100") check("ticket_bahncard100");
  else if (facts.ticketType === "deutschlandticket" || facts.ticketType?.startsWith("season_ticket")) check("ticket_season");
  else if (data.bookingRef) {
    check("ticket_digital");
    setText("ticket_digital_number", data.bookingRef);
  } else check("ticket_other");

  radio("compensation", "Geldauszahlung/Überweisung");
  setText("compensation_accountholder", data.accountHolder);
  setText("compensation_iban", formatIban(data.iban));
  radio("personal", data.salutation === "female" ? "Frau" : data.salutation === "male" ? "Herr" : "Neutrale Anrede");
  setText("personal_firstname", data.firstName);
  setText("personal_lastname", data.lastName);
  setText("personal_street", data.street);
  setText("personal_housenumber", data.houseNumber);
  setText("personal_country", "D");
  setText("personal_postcode", data.postcode);
  setText("personal_city", data.city);
  if (data.email) {
    check("personal_email");
    setText("personal_emailaddress", data.email);
  }
  setText("date", todayDe());

  // Unterschrift über das Signaturfeld legen (Seite 2: x 120, y 72, 213 × 27 pt)
  const png = await formDoc.embedPng(data.signaturePng);
  const sigHeight = 26;
  const sigWidth = Math.min((png.width / png.height) * sigHeight, 210);
  formDoc.getPages()[1].drawImage(png, { x: 122, y: 72, width: sigWidth, height: sigHeight });

  try {
    form.flatten();
  } catch {
    /* Formular bleibt ausfüllbar, falls Abflachen nicht klappt */
  }

  const pages = await doc.copyPages(formDoc, formDoc.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
  return doc.save();
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
