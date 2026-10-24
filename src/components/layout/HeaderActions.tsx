"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { useCredits } from "@/lib/store/credits";
import { TicketList } from "./TicketList";

type Props = { locale: Locale; header: Dictionary["header"]; tickets: Dictionary["tickets"] };

/** Credit-Guthaben im Header und (auf dem Handy) der Knopf für die Ticket-Liste. Weiße Pillen auf Schwarz. */
export function HeaderActions({ locale, header, tickets }: Props) {
  const credits = useCredits();
  const [open, setOpen] = useState(false);
  const available = credits.balance - credits.reserved;

  return (
    <>
      <Link
        href={`/${locale}/credits`}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
        title={header.credits}
      >
        <span aria-hidden className="text-[#2d54e5]">◆</span>
        <span className="tabular-nums">{available}</span>
        <span className="hidden sm:inline">{header.credits}</span>
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={header.tickets}
        title={header.tickets}
        className="grid size-9 place-items-center rounded-full bg-white text-black transition-opacity hover:opacity-90 lg:hidden"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={header.tickets}>
            <button type="button" aria-label={tickets.close} className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col gap-4 overflow-y-auto bg-surface p-4 shadow-xl">
              <button type="button" onClick={() => setOpen(false)} className="self-end text-sm font-medium text-muted">
                {tickets.close} ×
              </button>
              <TicketList locale={locale} dict={tickets} onNavigate={() => setOpen(false)} />
              <Link href={`/${locale}/fahrkarten`} onClick={() => setOpen(false)} className="px-3 text-sm font-medium text-brand">
                {header.passes} →
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
