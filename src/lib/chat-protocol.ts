import { z } from "zod";
import { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";

/*
 * Protokoll zwischen Browser und /api/chat.
 *
 * Der Browser schickt den bisherigen Gesprächsverlauf (so wie die API ihn geliefert hat)
 * plus die neue Nachricht. Der Server antwortet als Stream mit einer JSON-Zeile pro Ereignis.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const PDF_TYPE = "application/pdf";
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const Attachment = z.object({
  name: z.string().max(200),
  mediaType: z.enum([...IMAGE_TYPES, PDF_TYPE]),
  /** Base64 ohne "data:"-Präfix. */
  data: z.string().min(1).max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 16),
});
export type Attachment = z.infer<typeof Attachment>;

/** Gespeicherte Fahrkarte (Deutschlandticket usw.), wird automatisch berücksichtigt. */
export const PassInfo = z.object({
  type: z.enum(["deutschlandticket", "season_ticket", "season_ticket_long_distance", "bahncard100"]),
  travelClass: z.union([z.literal(1), z.literal(2)]),
  validFrom: z.iso.date(),
  validUntil: z.iso.date(),
  priceEur: z.number().nonnegative().optional(),
});
export type PassInfo = z.infer<typeof PassInfo>;

export const ChatRequest = z.object({
  locale: z.enum(["de", "en"]),
  /** "case" = Ticket prüfen (mit Regel-Engine), "help" = Soforthilfe unterwegs. */
  purpose: z.enum(["case", "help"]),
  /** Vom Nutzer gewählt: Zug oder Flug. */
  mode: z.enum(["rail", "air"]).nullable(),
  passes: z.array(PassInfo).max(10),
  /** Anbieter, von dem der Verlauf stammt (aus dem letzten "done"-Ereignis). */
  provider: z.string().nullable(),
  /** Bisheriger Verlauf im Format des Anbieters. Wird unverändert weitergereicht. */
  history: z.array(z.looseObject({ role: z.string() })).max(200),
  facts: CaseFacts.nullable(),
  input: z.object({
    text: z.string().max(8000),
    attachments: z.array(Attachment).max(4),
  }),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export type ChatEvent =
  /** Textstück der Antwort. */
  | { t: "text"; d: string }
  /** Die KI hat die Falldaten aktualisiert und die Engine hat ausgewertet. */
  | { t: "case"; facts: CaseFacts; result: EvaluationResult }
  /** Der KI-Dienst ist ausgelastet; der Server wartet und versucht es erneut. */
  | { t: "status"; code: "waiting"; seconds: number }
  /** Fertig. `appended` wird an den Verlauf angehängt. */
  | { t: "done"; appended: unknown[]; provider?: string }
  | {
      t: "error";
      code: "missing_api_key" | "refusal" | "rate_limit" | "api_error" | "bad_request" | "local_ai_unavailable";
    };
