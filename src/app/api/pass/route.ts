import { z } from "zod";
import { GEMMA, OLLAMA, PROVIDER } from "@/lib/ai/config";
import { Attachment, PDF_TYPE } from "@/lib/chat-protocol";

/*
 * Liest eine hochgeladene Fahrkarte (Foto/PDF) aus: Art, Klasse, Gültigkeit, Preis.
 * Nur diese Felder kommen zurück; persönliche Daten werden ignoriert.
 */

const PassExtraction = z.object({
  type: z.enum(["deutschlandticket", "season_ticket", "season_ticket_long_distance", "bahncard100"]).nullable().catch(null),
  travelClass: z.union([z.literal(1), z.literal(2)]).nullable().catch(null),
  validFrom: z.iso.date().nullable().catch(null),
  validUntil: z.iso.date().nullable().catch(null),
  priceEur: z.number().nonnegative().nullable().catch(null),
});

const PROMPT = `Read this German rail ticket or pass (photo or PDF). Return ONLY a JSON object, no other text:
{"type": "deutschlandticket" | "season_ticket" | "season_ticket_long_distance" | "bahncard100" | null,
 "travelClass": 1 | 2 | null, "validFrom": "YYYY-MM-DD" | null, "validUntil": "YYYY-MM-DD" | null, "priceEur": number | null}
season_ticket = local/regional season ticket (Monatskarte, Abo im Verbund); season_ticket_long_distance = IC/ICE season ticket.
Use null for anything you cannot read with certainty. Ignore names, customer numbers and all other personal data.`;

function parseJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

export async function POST(request: Request) {
  const body = z.object({ attachment: Attachment }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { attachment } = body.data;

  try {
    let text = "";
    if (PROVIDER === "gemma") {
      const apiKey = GEMMA.apiKey();
      if (!apiKey) return Response.json({ error: "missing_api_key" }, { status: 503 });
      const response = await fetch(`${GEMMA.baseUrl}/models/${GEMMA.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ inlineData: { mimeType: attachment.mediaType, data: attachment.data } }, { text: PROMPT }] }],
          ...(GEMMA.thinking ? { generationConfig: { thinkingConfig: { thinkingLevel: GEMMA.thinking } } } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Gemma HTTP ${response.status}`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    } else if (PROVIDER === "ollama") {
      if (attachment.mediaType === PDF_TYPE) return Response.json({ error: "unsupported" }, { status: 415 });
      const response = await fetch(`${OLLAMA.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA.model,
          stream: false,
          format: "json",
          think: false,
          messages: [{ role: "user", content: PROMPT, images: [attachment.data] }],
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      text = ((await response.json()) as { message?: { content?: string } }).message?.content ?? "";
    } else {
      return Response.json({ error: "unsupported" }, { status: 501 });
    }
    return Response.json(PassExtraction.parse(parseJson(text)));
  } catch (error) {
    console.error("[pass]", error);
    return Response.json({ error: "api_error" }, { status: 502 });
  }
}
