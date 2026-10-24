import type { Ticket } from "@/lib/store/tickets";

/** Kurzinfos für Listen: Strecke, Datum, Verspätung, Betrag. */
export function summarizeTicket(ticket: Ticket) {
  const facts = ticket.facts;
  let route: string | undefined;
  let date: string | undefined;
  let delay: number | undefined;
  let label: string | undefined;

  if (facts?.mode === "rail") {
    const journey = facts.journeys[facts.journeys.length - 1];
    const withRoute = facts.journeys.find((j) => j.from && j.to);
    route = withRoute ? `${withRoute.from} → ${withRoute.to}` : undefined;
    label = journey?.trainNumber;
    date = journey?.date;
    delay = journey?.arrivalDelayMinutes;
    if (facts.journeys.length > 1) label = `${facts.journeys.length}×`;
  } else if (facts?.mode === "air") {
    route = facts.departureAirport && facts.arrivalAirport ? `${facts.departureAirport} → ${facts.arrivalAirport}` : undefined;
    label = facts.flightNumber;
    date = facts.flightDate;
    delay = facts.arrivalDelayMinutes;
  }

  return { route, date, delay, label, amount: ticket.result?.totalEur, outcome: ticket.result?.outcome };
}
