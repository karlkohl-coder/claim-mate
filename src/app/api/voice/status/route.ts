import { voiceEnabled } from "@/lib/voice/elevenlabs";

/** Sagt dem Browser, ob Spracheingabe/Vorlesen eingerichtet ist (ohne den Key preiszugeben). */
export async function GET() {
  return Response.json({ enabled: voiceEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
