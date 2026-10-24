import "server-only";

/*
 * KI-Einstellungen. Anbieter und Modelle lassen sich über .env.local ändern,
 * ohne Code anzufassen.
 */

export type Provider = "gemma" | "anthropic" | "ollama";

/**
 * Welcher KI-Anbieter verwendet wird. Standard: Gemma über die Google-API (Hackathon-Key).
 * "ollama" = lokal auf diesem Rechner, gedacht zum Entwickeln und Testen ohne Limit.
 */
export const PROVIDER: Provider = (["anthropic", "ollama"] as const).find((p) => p === process.env.AI_PROVIDER) ?? "gemma";

/** Name für den Datenschutzhinweis in der Oberfläche. */
export const PROVIDER_LABEL: Record<Provider, string> = {
  gemma: "Google Gemma",
  anthropic: "Anthropic Claude",
  ollama: "Ollama",
};

/** Höchstzahl an Tool-Runden pro Nutzernachricht (Schutz vor Endlosschleifen). */
export const MAX_TOOL_ROUNDS = 6;

// ---------- Gemma (Google Gemini API) ----------

export const GEMMA = {
  /** Getestet: kann Tool-Aufrufe, Systemanweisung, Fotos und PDFs. */
  model: process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it",
  /** Wird verwendet, wenn das Hauptmodell überlastet ist. */
  fallbackModel: process.env.GEMMA_FALLBACK_MODEL || "gemma-4-31b-it",
  apiKey: () => process.env.GEMMA_API_KEY,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  /** "minimal" = kaum Nachdenken, etwa doppelt so schnell (gemessen 7 s statt 16 s). "default" = Modell entscheidet. */
  thinking: process.env.GEMMA_THINKING === "default" ? undefined : "minimal",
};

// ---------- Ollama (lokal) ----------

export const OLLAMA = {
  baseUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  /** Passt auf einen Mac mit 16 GB. Größere Modelle (26b, 31b) brauchen mehr Arbeitsspeicher. */
  model: process.env.OLLAMA_MODEL || "gemma4:12b",
  /** Denkmodus: genauer, aber langsamer. */
  think: process.env.OLLAMA_THINK === "true",
  /** Kontextlänge in Tokens. Ollama nimmt sonst einen kleinen Standard, der für Systemprompt + Tool nicht reicht. */
  numCtx: Number(process.env.OLLAMA_NUM_CTX) || 16384,
};

// ---------- Anthropic (Alternative) ----------

export const ANTHROPIC = {
  /** Für schnelle Antworten z. B. ANTHROPIC_MODEL=claude-haiku-5-5 oder claude-sonnet-5-5 setzen. */
  model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  /** Denktiefe: "low" ist für einen Chat schnell und reicht meist. */
  effort: (["low", "medium", "high"] as const).find((e) => e === process.env.ANTHROPIC_EFFORT) ?? "low",
  maxTokens: 32000,
  /** Lehnt die Sicherheitsprüfung ab, antwortet Anthropic automatisch mit einem Ersatzmodell. */
  fallbackBeta: "server-side-fallback-2026-07-01",
  apiKey: () => process.env.ANTHROPIC_API_KEY,
};
