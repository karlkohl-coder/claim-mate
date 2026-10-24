import { z } from "zod";

/** Datum im Format YYYY-MM-DD. Lässt sich als String direkt vergleichen. */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

export const Money = z.number().nonnegative();

/** Quelle einer Regel (Gesetz, Verordnung, offizielle Seite). */
export const Source = z.object({
  title: z.string().min(1),
  url: z.url(),
  /** Optional: Artikel / Paragraf, z. B. "Art. 19 Abs. 1". */
  reference: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

/** Text in beiden App-Sprachen. Nur für Daten wie Einreichungswege, nicht für Begründungen. */
export const LocalizedText = z.object({ de: z.string().min(1), en: z.string().min(1) });
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Woher eine Angabe im Fall stammt. "api" ist für die spätere Bezahlversion. */
export const FactSource = z.enum(["user", "ai", "api"]);
export type FactSource = z.infer<typeof FactSource>;

/** Ein Weg, den Antrag einzureichen. */
export const SubmissionChannel = z.object({
  kind: z.enum(["online", "app", "email", "post"]),
  label: LocalizedText,
  url: z.url().optional(),
  email: z.email().optional(),
  postalAddress: z.array(z.string()).optional(),
});
export type SubmissionChannel = z.infer<typeof SubmissionChannel>;
