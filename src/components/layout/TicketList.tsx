"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { formatEur } from "@/i18n/reasons";
import { deleteTicket, useTickets, useTicketsReady, type Ticket } from "@/lib/store/tickets";
import { summarizeTicket } from "@/lib/ticket-summary";
import { useToday } from "@/lib/use-today";

type Props = { locale: Locale; dict: Dictionary["tickets"]; onNavigate?: () => void };

const SUBMITTED: Ticket["status"][] = ["submitted_self", "sent", "answered"];

/** Tage bis zur Frist, wenn das Ticket noch nicht eingereicht ist und die Frist naht (≤ 14 Tage). */
function daysLeft(ticket: Ticket, today: string): number | undefined {
  const deadline = ticket.result?.deadline;
  if (!deadline || !today || SUBMITTED.includes(ticket.status) || ticket.status === "paid") return undefined;
  if (ticket.result?.outcome !== "eligible") return undefined;
  const days = Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000);
  return days >= 0 && days <= 14 ? days : undefined;
}

/** Status-Punkt wie im Stylesheet: blau eingereicht, rot Frist naht, grün ausgezahlt, grau offen. */
function Dot({ ticket, urgent }: { ticket: Ticket; urgent: boolean }) {
  const style = urgent
    ? "bg-bad"
    : ticket.status === "paid"
      ? "bg-ok"
      : SUBMITTED.includes(ticket.status)
        ? "bg-brand"
        : ticket.status === "evaluated"
          ? "bg-muted"
          : "border-2 border-muted bg-transparent";
  return <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${style}`} />;
}

/** Ticket nach Rückfrage löschen. Ist es gerade geöffnet, geht es zur Startseite. */
export function useDeleteTicket(locale: Locale, dict: Dictionary["tickets"]) {
  const router = useRouter();
  return (id: string) => {
    if (!window.confirm(dict.deleteConfirm)) return false;
    const open = new URLSearchParams(window.location.search).get("id") === id;
    deleteTicket(id);
    if (open) router.push(`/${locale}`);
    return true;
  };
}

export function TicketList({ locale, dict, onNavigate }: Props) {
  const tickets = useTickets();
  const ready = useTicketsReady();
  const today = useToday();
  const remove = useDeleteTicket(locale, dict);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/${locale}`}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-base font-semibold text-surface transition-opacity hover:opacity-90"
      >
        <span aria-hidden className="text-xl leading-none">+</span>
        {dict.new}
      </Link>

      <div className="flex flex-col gap-1">
        <h2 className="px-3 text-sm text-muted">{dict.title}</h2>
        {ready && tickets.length === 0 && <p className="px-3 py-2 text-sm leading-relaxed text-muted">{dict.empty}</p>}
        <ul className="flex flex-col">
          {tickets.map((ticket) => {
            const s = summarizeTicket(ticket);
            const left = daysLeft(ticket, today);
            const urgent = left !== undefined;
            const showAmount = s.amount !== undefined && s.outcome === "eligible";
            const subline = [s.label, urgent ? dict.deadlineIn.replace("{d}", String(left)) : dict.status[ticket.status]].filter(Boolean).join(" · ");
            return (
              <li key={ticket.id} className="group relative">
                <Link
                  href={`/${locale}/ticket?id=${ticket.id}`}
                  onClick={onNavigate}
                  className="flex items-start gap-3 rounded-2xl py-3 pl-3 pr-11 transition-colors hover:bg-soft"
                >
                  <Dot ticket={ticket} urgent={urgent} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-medium leading-snug">
                      {s.route ?? (ticket.mode === "rail" ? dict.railUntitled : dict.airUntitled)}
                    </span>
                    <span className={`text-sm leading-snug ${urgent ? "text-bad" : "text-muted"}`}>{subline}</span>
                  </span>
                  <span className={`shrink-0 pt-0.5 text-[15px] tabular-nums ${ticket.status === "paid" ? "text-ok" : ""} ${showAmount ? "" : "text-muted"}`}>
                    {showAmount ? formatEur(s.amount!, locale) : "–"}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(ticket.id)}
                  aria-label={dict.delete}
                  title={dict.delete}
                  className="absolute right-2 top-2.5 grid size-8 place-items-center rounded-full text-muted transition hover:bg-bad-tint hover:text-bad focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
