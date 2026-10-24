import "server-only";

/*
 * ElevenLabs: Spracheingabe (Speech-to-Text) und Vorlesen (Text-to-Speech).
 * Die KI-Logik bleibt unverändert: ElevenLabs ist nur Ohr und Stimme der App.
 * Key nur auf dem Server (.env.local), nie im Browser.
 */

export const ELEVENLABS = {
  apiKey: () => process.env.ELEVENLABS_API_KEY,
  baseUrl: "https://api.elevenlabs.io",
  /** Aktuelles Transkriptionsmodell laut Doku (scribe_v1 ist abgekündigt). */
  sttModel: process.env.ELEVENLABS_STT_MODEL || "scribe_v2",
  /** Schnelles mehrsprachiges Modell mit Deutsch (~75 ms laut Doku). */
  ttsModel: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
  voiceId: () => process.env.ELEVENLABS_VOICE_ID,
  outputFormat: "mp3_44100_128",
};

export const voiceEnabled = () => Boolean(ELEVENLABS.apiKey());

type Voice = { voice_id: string; name: string; verified_languages?: { language?: string }[]; labels?: Record<string, string> };

let cachedVoiceId: string | undefined;

/** Stimme aus .env.local, sonst eine deutschsprachige Stimme aus dem Konto, sonst die erste. */
export async function resolveVoiceId(): Promise<string> {
  const configured = ELEVENLABS.voiceId();
  if (configured) return configured;
  if (cachedVoiceId) return cachedVoiceId;

  const response = await fetch(`${ELEVENLABS.baseUrl}/v2/voices?page_size=100`, {
    headers: { "xi-api-key": ELEVENLABS.apiKey()! },
  });
  if (!response.ok) throw new Error(`voices HTTP ${response.status}`);
  const { voices = [] } = (await response.json()) as { voices?: Voice[] };
  const german = voices.find(
    (v) => v.verified_languages?.some((l) => l.language === "de") || /german|deutsch/i.test(Object.values(v.labels ?? {}).join(" ")),
  );
  const voice = german ?? voices[0];
  if (!voice) throw new Error("no voices in account");
  cachedVoiceId = voice.voice_id;
  console.info(`[voice] Stimme: ${voice.name} (${voice.voice_id})`);
  return cachedVoiceId;
}
