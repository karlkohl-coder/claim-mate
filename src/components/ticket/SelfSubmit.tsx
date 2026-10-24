"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { formatDate, formatEur } from "@/i18n/reasons";
import type { Ticket } from "@/lib/store/tickets";

type Props = { ticket: Ticket; locale: Locale; dict: Dictionary; onDone: () => void };

function CopyRow({ label, value, dict }: { label: string; value: string; dict: Dictionary["self"] }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{label}</span>
        <span className="truncate font-medium">{value}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-brand hover:text-brand"
      >
        {copied ? dict.copied : dict.copy}
      </button>
    </li>
  );
}

export function SelfSubmit({ ticket, locale, dict, onDone }: Props) {
  const d = dict.self;
  const facts = ticket.facts;
  const rows: [string, string | undefined][] = [];

  if (facts?.mode === "rail") {
    facts.journeys.forEach((j, i) => {
      const suffix = facts.journeys.length > 1 ? ` (${i + 1})` : "";
      rows.push([d.fields.train + suffix, j.trainNumber], [d.fields.date + suffix, j.date && formatDate(j.date, locale)]);
      rows.push([d.fields.from + suffix, j.from], [d.fields.to + suffix, j.to]);
      rows.push([d.fields.delay + suffix, j.arrivalDelayMinutes !== undefined ? `${j.arrivalDelayMinutes} Min.` : undefined]);
    });
    rows.push([d.fields.ticketType, facts.ticketType && dict.passes.types[facts.ticketType as keyof typeof dict.passes.types]]);
    rows.push([d.fields.price, facts.ticketPriceEur !== undefined ? formatEur(facts.ticketPriceEur, locale) : undefined]);
    rows.push([d.fields.legal, "VO (EU) 2021/782, Art. 19"]);
  } else if (facts?.mode === "air") {
    rows.push([d.fields.flight, facts.flightNumber], [d.fields.date, facts.flightDate && formatDate(facts.flightDate, locale)]);
    rows.push([d.fields.from, facts.departureAirport], [d.fields.to, facts.arrivalAirport]);
    rows.push([d.fields.delay, facts.arrivalDelayMinutes !== undefined ? `${facts.arrivalDelayMinutes} Min.` : undefined]);
    rows.push([d.fields.legal, "VO (EG) Nr. 261/2004, Art. 7"]);
  }
  if (ticket.result?.totalEur !== undefined) rows.push([d.fields.amount, formatEur(ticket.result.totalEur, locale)]);

  const steps = ticket.mode === "rail" ? d.railSteps : d.airSteps;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-bold tracking-tight">{d.title}</h2>

      <section className="rounded-3xl border border-line bg-card px-4 py-2">
        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{d.dataTitle}</h3>
        <ul>
          {rows
            .filter((r): r is [string, string] => Boolean(r[1]))
            .map(([label, value]) => (
              <CopyRow key={label} label={label} value={value} dict={d} />
            ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{d.stepsTitle}</h3>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <ul className="flex flex-col gap-1 text-sm">
          {ticket.result?.submission.map((c, i) => (
            <li key={i}>
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-brand underline underline-offset-2">
                  {c.label[locale]}
                </a>
              ) : (
                <span className="font-medium">{c.label[locale]}</span>
              )}
              {c.postalAddress && <span className="text-muted"> – {c.postalAddress.join(", ")}</span>}
            </li>
          ))}
          {ticket.mode === "rail" && (
            <li>
              <a href="/forms/db-fahrgastrechte-formular.pdf" target="_blank" className="font-medium text-brand underline underline-offset-2">
                {d.downloadForm}
              </a>
            </li>
          )}
          {ticket.mode === "air" && (
            <li>
              <a href="https://www.schlichtung-reise-und-verkehr.de/" target="_blank" rel="noreferrer" className="font-medium text-brand underline underline-offset-2">
                Schlichtungsstelle Reise &amp; Verkehr
              </a>
            </li>
          )}
        </ul>
      </section>

      <button type="button" onClick={onDone} className="self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface">
        {d.markDone}
      </button>
    </div>
  );
}
