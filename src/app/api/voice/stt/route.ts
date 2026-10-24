import { ELEVENLABS } from "@/lib/voice/elevenlabs";

const MAX_BYTES = 15 * 1024 * 1024;

/** Sprachaufnahme aus dem Browser → Text (ElevenLabs Speech-to-Text). */
export async function POST(request: Request) {
  const apiKey = ELEVENLABS.apiKey();
  if (!apiKey) return Response.json({ error: "missing_api_key" }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("file");
  const locale = form?.get("locale") === "en" ? "en" : "de";
  if (!(audio instanceof Blob) || audio.size < 1000 || audio.size > MAX_BYTES) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "aufnahme.webm");
  upstream.append("model_id", ELEVENLABS.sttModel);
  upstream.append("language_code", locale);
  upstream.append("tag_audio_events", "false");

  const response = await fetch(`${ELEVENLABS.baseUrl}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstream,
  });
  if (!response.ok) {
    console.error(`[voice] STT HTTP ${response.status}`, (await response.text().catch(() => "")).slice(0, 300));
    return Response.json({ error: response.status === 401 ? "missing_api_key" : "stt_failed" }, { status: 502 });
  }
  const data = (await response.json()) as { text?: string };
  return Response.json({ text: (data.text ?? "").trim() });
}
