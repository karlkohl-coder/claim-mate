import type { IsoDate } from "@/domain/common";

type DeadlineRule = {
  amount: number;
  unit: "days" | "months" | "years";
  from: "journey_date" | "end_of_ticket_validity" | "end_of_year_of_journey";
};

function parse(date: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function format(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Addiert Monate. Gibt es den Tag im Zielmonat nicht, nimmt sie den Monatsletzten (31.01. + 1 Monat = 28./29.02.). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Letzter Tag der Frist. `undefined`, wenn der Startpunkt nicht bekannt ist
 * (z. B. Ende der Ticket-Gültigkeit, das wir nicht erfassen).
 */
export function computeDeadline(rule: DeadlineRule, journeyDate: IsoDate): IsoDate | undefined {
  if (rule.from === "end_of_ticket_validity") return undefined;

  const start = rule.from === "end_of_year_of_journey" ? format(parse(journeyDate).y, 12, 31) : journeyDate;
  switch (rule.unit) {
    case "days":
      return addDays(start, rule.amount);
    case "months":
      return addMonths(start, rule.amount);
    case "years":
      return addMonths(start, rule.amount * 12);
  }
}

/** Heutiges Datum (UTC) als YYYY-MM-DD. */
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
