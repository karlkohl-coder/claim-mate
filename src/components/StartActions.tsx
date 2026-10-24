"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { createTicket } from "@/lib/store/tickets";

/** Startet ein neues Ticket (Zug oder Flug) und öffnet es. Als Text-Links mit Pfeil, wie im Stylesheet. */
export function StartActions({ locale, labels }: { locale: Locale; labels: { rail: string; air: string } }) {
  const router = useRouter();
  const start = (mode: "rail" | "air") => {
    const ticket = createTicket(mode);
    router.push(`/${locale}/ticket?id=${ticket.id}`);
  };

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {(["rail", "air"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => start(mode)}
          className="group flex items-center gap-2 text-lg font-medium text-brand"
        >
          <span aria-hidden>{mode === "rail" ? "🚆" : "✈️"}</span>
          {labels[mode]}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      ))}
    </div>
  );
}
