import { z } from "zod";
import { AirCause, RailCause } from "@/domain/case";
import { IsoDate, Money, Source, SubmissionChannel } from "@/domain/common";

/*
 * Aufbau der Wissensbasis.
 *
 * Jede Regel ist eine Liste von Versionen. Jede Version gilt ab "validFrom"
 * (und optional bis "validUntil") und hat mindestens eine Quelle.
 * Die Engine wählt die Version, die am REISEDATUM galt, nicht am heutigen Tag.
 *
 * "status" ist "placeholder", solange ein Wert nicht gegen die Quelle geprüft ist.
 */

export const RuleStatus = z.enum(["placeholder", "verified"]);
export type RuleStatus = z.infer<typeof RuleStatus>;

function ruleVersion<T extends z.ZodType>(value: T) {
  return z
    .object({
      validFrom: IsoDate,
      validUntil: IsoDate.optional(),
      status: RuleStatus,
      sources: z.array(Source).min(1),
      /** Interne Notiz, z. B. Auslegung oder offene Frage. Wird nicht angezeigt. */
      note: z.string().optional(),
      value,
    })
    .refine((v) => !v.validUntil || v.validUntil >= v.validFrom, {
      message: "validUntil liegt vor validFrom",
    });
}

/** Eine Regel mit mindestens einer Version. Versionen dürfen sich zeitlich nicht überschneiden. */
function rule<T extends z.ZodType>(value: T) {
  return z
    .array(ruleVersion(value))
    .min(1)
    .superRefine((versions, ctx) => {
      const sorted = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const next = sorted[i];
        if (!prev.validUntil || prev.validUntil >= next.validFrom) {
          ctx.addIssue({
            code: "custom",
            message: `Versionen überschneiden sich: ab ${prev.validFrom} und ab ${next.validFrom}. Die ältere braucht ein validUntil vor ${next.validFrom}.`,
          });
        }
      }
    });
}

export type RuleVersion<V> = {
  validFrom: string;
  validUntil?: string;
  status: RuleStatus;
  sources: Source[];
  note?: string;
  value: V;
};
export type Rule<V> = RuleVersion<V>[];

const Minutes = z.number().int().nonnegative();
const Percent = z.number().min(0).max(100);

const ClaimDeadline = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(["days", "months", "years"]),
  /** Ab wann die Frist läuft. */
  from: z.enum(["journey_date", "end_of_ticket_validity", "end_of_year_of_journey"]),
});

const Submission = z.object({ channels: z.array(SubmissionChannel).min(1) });

// ---------- Bahn ----------

const FlatRate = z.object({
  minDelayMinutes: Minutes,
  class2Eur: Money,
  class1Eur: Money.optional(),
});

export const RailRules = z.object({
  /** Prozent vom Fahrpreis je nach Verspätung am Ziel. */
  delayCompensation: rule(
    z.object({
      tiers: z
        .array(z.object({ minDelayMinutes: Minutes, percentOfPrice: Percent }))
        .min(1),
      /** Bei Hin- und Rückfahrkarten zählt dieser Anteil des Preises als Preis einer Fahrt. */
      returnTicketLegPercent: Percent,
    }),
  ),
  /** Beträge darunter werden nicht ausgezahlt. Bei Zeitkarten werden Fahrten zusammengezählt. */
  minimumPayout: rule(z.object({ amountEur: Money })),
  /** Pauschalen pro verspäteter Fahrt bei Zeitkarten. */
  flatRateCompensation: rule(
    z.object({
      deutschlandticket: FlatRate.optional(),
      season_ticket: FlatRate.optional(),
      season_ticket_long_distance: FlatRate.optional(),
      bahncard100: FlatRate.optional(),
    }),
  ),
  /** Ursachen, bei denen keine Entschädigung fällig ist. */
  exemptCauses: rule(z.object({ causes: z.array(RailCause) })),
  /** Erstattung des Fahrpreises, wenn die Reise abgebrochen oder nicht angetreten wird. */
  fullRefund: rule(z.object({ minExpectedDelayMinutes: Minutes })),
  claimDeadline: rule(ClaimDeadline),
  submission: rule(Submission),
});
export type RailRules = z.infer<typeof RailRules>;

// ---------- Flug ----------

export const AirRules = z.object({
  /** Länder, für die die Verordnung gilt (ISO-Codes). */
  coveredCountries: rule(z.object({ countries: z.array(z.string().length(2)).min(1) })),
  /** Pauschale nach Flugstrecke. upToKm = null heißt "darüber". */
  compensationBands: rule(
    z.object({
      bands: z
        .array(
          z.object({
            upToKm: z.number().positive().nullable(),
            amountEur: Money,
            /** Abweichender Betrag, wenn Start und Ziel im Geltungsbereich liegen. */
            withinCoveredAreaAmountEur: Money.optional(),
          }),
        )
        .min(1),
    }),
  ),
  /** Ab dieser Verspätung am Endziel gibt es eine Entschädigung. */
  delayThreshold: rule(z.object({ minDelayMinutes: Minutes })),
  /** Kürzung, wenn ein Ersatzflug nur wenig später ankommt. */
  reroutingReduction: rule(
    z.object({
      percent: Percent,
      bands: z
        .array(z.object({ upToKm: z.number().positive().nullable(), maxLaterArrivalMinutes: Minutes }))
        .min(1),
    }),
  ),
  /** Keine Entschädigung bei rechtzeitiger Information über eine Annullierung. */
  cancellationNotice: rule(
    z.object({
      noCompensationFromNoticeDays: z.number().int().positive(),
      windows: z.array(
        z.object({
          minNoticeDays: z.number().int().nonnegative(),
          maxNoticeDays: z.number().int().nonnegative(),
          maxEarlierDepartureMinutes: Minutes,
          maxLaterArrivalMinutes: Minutes,
        }),
      ),
    }),
  ),
  exemptCauses: rule(z.object({ causes: z.array(AirCause) })),
  claimDeadline: rule(ClaimDeadline),
  submission: rule(Submission),
});
export type AirRules = z.infer<typeof AirRules>;

// ---------- Dateien ----------

const KnowledgeBaseMeta = {
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  /** Wann die Datei zuletzt inhaltlich geändert wurde. */
  updatedAt: IsoDate,
};

export const RailKnowledgeBase = z.object({
  ...KnowledgeBaseMeta,
  mode: z.literal("rail"),
  rules: RailRules,
});
export type RailKnowledgeBase = z.infer<typeof RailKnowledgeBase>;

export const AirKnowledgeBase = z.object({
  ...KnowledgeBaseMeta,
  mode: z.literal("air"),
  rules: AirRules,
});
export type AirKnowledgeBase = z.infer<typeof AirKnowledgeBase>;
