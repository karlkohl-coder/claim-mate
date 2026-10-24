import type { EvaluationResult } from "@/domain/result";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { formatDate, formatEur, renderFactLabel, renderReason } from "@/i18n/reasons";

type Props = { result: EvaluationResult; locale: Locale; dict: Dictionary["result"] };

const OUTCOME_STYLE: Record<EvaluationResult["outcome"], string> = {
  eligible: "bg-ok-tint text-ok",
  not_eligible: "bg-bad-tint text-bad",
  unclear: "bg-warn/20 text-ink",
};

// Hilfstexte ohne eigenen Informationswert in der Karte ausblenden.
const HIDDEN_REASONS = new Set(["MISSING_FACTS"]);

export function ResultCard({ result, locale, dict }: Props) {
  const reasons = result.reasons.filter((r) => !HIDDEN_REASONS.has(r.code));

  return (
    <section aria-label={dict.title} className="overflow-hidden rounded-3xl border border-line bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${OUTCOME_STYLE[result.outcome]}`}>
          {dict.outcome[result.outcome]}
        </span>
        {result.totalEur !== undefined && (
          <span className="display text-3xl tabular-nums">{formatEur(result.totalEur, locale)}</span>
        )}
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 text-sm">
        {result.usesPlaceholders && (
          <p className="rounded-lg border border-warn/60 bg-warn/15 px-3 py-2 text-xs leading-relaxed">
            {dict.placeholderWarning}
          </p>
        )}

        {reasons.length > 0 && (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
            {reasons.map((r, i) => (
              <li key={i}>{renderReason(r, locale)}</li>
            ))}
          </ul>
        )}

        {result.missingFacts.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{dict.missing}</h3>
            <ul className="flex flex-wrap gap-1.5">
              {result.missingFacts.map((path) => (
                <li key={path} className="rounded-full border border-line px-2.5 py-1 text-xs">
                  {renderFactLabel(path, locale)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.deadline && result.outcome !== "not_eligible" && (
          <p>
            <span className="text-muted">{dict.deadline}: </span>
            <span className="font-medium">{formatDate(result.deadline, locale)}</span>
          </p>
        )}

        {result.outcome === "eligible" && result.submission.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{dict.submission}</h3>
            <ul className="flex flex-col gap-2">
              {result.submission.map((channel, i) => (
                <li key={i} className="leading-relaxed">
                  {channel.url ? (
                    <a href={channel.url} target="_blank" rel="noreferrer" className="font-medium text-brand underline underline-offset-2">
                      {channel.label[locale]}
                    </a>
                  ) : (
                    <span className="font-medium">{channel.label[locale]}</span>
                  )}
                  {channel.postalAddress && (
                    <address className="mt-1 not-italic text-muted">{channel.postalAddress.join(", ")}</address>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
