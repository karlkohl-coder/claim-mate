import { z } from "zod";
import { ELEVENLABS, resolveVoiceId } from "@/lib/voice/elevenlabs";

const Body = z.object({ text: z.string().min(1).max(2500) });

/** Antworttext → gesprochene Sprache (ElevenLabs Text-to-Speech, gestreamt als MP3). */
export async function POST(request: Request) {
  const apiKey = ELEVENLABS.apiKey();
  if (!apiKey) return Response.json({ error: "missing_api_key" }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const voiceId = await resolveVoiceId();
    const response = await fetch(
      `${ELEVENLABS.baseUrl}/v1/text-to-speech/${voiceId}/stream?output_format=${ELEVENLABS.outputFormat}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text: body.data.text, model_id: ELEVENLABS.ttsModel }),
      },
    );
    if (!response.ok || !response.body) {
      console.error(`[voice] TTS HTTP ${response.status}`, (await response.text().catch(() => "")).slice(0, 300));
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[voice] TTS", error);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
