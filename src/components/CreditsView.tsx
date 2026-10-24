"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { formatEur } from "@/i18n/reasons";
import { CREDIT_PRICE_EUR, LETTER_COST_BREAKDOWN, PACKAGES, purchaseCredits, redeemFreeCredit, useCredits } from "@/lib/store/credits";

export function CreditsView({ locale, dict }: { locale: Locale; dict: Dictionary["credits"] }) {
  const credits = useCredits();
  const [notice, setNotice] = useState<string | null>(null);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display text-3xl sm:text-4xl">{dict.title}</h1>

      <section className="flex items-center justify-between rounded-3xl border border-line bg-card p-5">
        <div>
          <p className="text-sm text-muted">{dict.balance}</p>
          <p className="text-3xl font-semibold tabular-nums">
            {credits.balance - credits.reserved} <span className="text-base font-medium text-muted">{dict.unit}</span>
          </p>
        </div>
        <span aria-hidden className="text-4xl text-brand">◆</span>
      </section>
      <p className="-mt-3 text-xs text-muted">{dict.demo}</p>
      {notice && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{notice}</p>}

      <section className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-5">
        <h2 className="font-semibold">{dict.freeTitle}</h2>
        <p className="text-sm text-muted">{dict.freeText}</p>
        <button
          type="button"
          disabled={credits.freeCreditRedeemed}
          onClick={() => redeemFreeCredit() && setNotice(dict.bought.replace("{c}", "1"))}
          className="mt-1 self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface disabled:bg-line disabled:text-muted"
        >
          {credits.freeCreditRedeemed ? dict.freeUsed : dict.freeCta}
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{dict.costTitle}</h2>
        <p className="text-sm text-muted">{dict.costText}</p>
        <table className="w-full text-sm">
          <tbody>
            {LETTER_COST_BREAKDOWN.map((item) => (
              <tr key={item.key} className="border-b border-line">
                <td className="py-1.5">{dict.cost[item.key]}</td>
                <td className="py-1.5 text-right tabular-nums">{formatEur(item.eur, locale)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5">{dict.costTotal}</td>
              <td className="py-1.5 text-right tabular-nums">{formatEur(CREDIT_PRICE_EUR, locale)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs leading-relaxed text-muted">{dict.costNote}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{dict.packagesTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PACKAGES.map((p) => (
            <div key={p.credits} className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
              <p className="text-xl font-semibold">
                {p.credits} <span className="text-sm font-medium text-muted">{dict.unit}</span>
              </p>
              <p className="text-sm tabular-nums text-muted">{formatEur(p.priceEur, locale)}</p>
              <button
                type="button"
                onClick={() => {
                  purchaseCredits(p.credits);
                  setNotice(dict.bought.replace("{c}", String(p.credits)));
                }}
                className="rounded-full border border-ink px-3 py-1.5 text-sm font-semibold hover:bg-ink hover:text-surface"
              >
                {dict.buy}
              </button>
            </div>
          ))}
        </div>
      </section>

      {credits.ledger.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{dict.historyTitle}</h2>
          <ul className="text-sm">
            {credits.ledger.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-line py-1.5">
                <span>
                  {dict.ledger[e.type]} <span className="text-muted">· {fmtDate(e.at)}</span>
                </span>
                <span className="tabular-nums">
                  {e.type === "charge" ? "−" : e.type === "reserve" || e.type === "refund" ? "" : "+"}
                  {e.credits}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
