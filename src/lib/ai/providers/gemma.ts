import "server-only";
import { GEMMA, MAX_TOOL_ROUNDS } from "@/lib/ai/config";
import { RECORD_CASE_FACTS, RECORD_CASE_FACTS_DESCRIPTION, recordCaseFactsJsonSchema, runRecordCaseFacts } from "@/lib/ai/tools";
import { ChatError, type RunChat, type Send } from "./types";

/*
 * Gemma über die Google Gemini API (REST, Streaming per Server-Sent Events).
 * Verlaufsformat: Gemini "contents" (role "user" / "model"). Antworten des Modells
 * werden unverändert in den Verlauf übernommen, inklusive "thoughtSignature".
 */

type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: unknown; id?: string };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };
type StreamChunk = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

export const runGemmaChat: RunChat = async ({ history, input, locale }, { system, today, useTools, passes }, send) => {
  const apiKey = GEMMA.apiKey();
  if (!apiKey) throw new ChatError("missing_api_key");

  const userParts: Part[] = input.attachments.map((a) => ({ inlineData: { mimeType: a.mediaType, data: a.data } }));
  userParts.push({ text: input.text.trim() || (locale === "de" ? "(Siehe Anhang.)" : "(See attachment.)") });

  const appended: Content[] = [{ role: "user", parts: userParts }];
  const contents: Content[] = [...(history as unknown as Content[]), ...appended];
  const models = [GEMMA.model, GEMMA.fallbackModel].filter((m, i, all) => m && all.indexOf(m) === i);
  let wroteText = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(GEMMA.thinking ? { generationConfig: { thinkingConfig: { thinkingLevel: GEMMA.thinking } } } : {}),
      ...(useTools
        ? {
            tools: [
              {
                functionDeclarations: [
                  { name: RECORD_CASE_FACTS, description: RECORD_CASE_FACTS_DESCRIPTION, parametersJsonSchema: recordCaseFactsJsonSchema },
                ],
              },
            ],
          }
        : {}),
    };

    const separator = () => {
      if (wroteText) send({ t: "text", d: "\n\n" });
    };
    const { parts, finishReason } = await streamWithFallback(models, apiKey, body, send, separator);
    if (parts.some((p) => p.text && !p.thought)) wroteText = true;

    if (finishReason && BLOCKED.has(finishReason)) throw new ChatError("refusal");

    const modelTurn: Content = { role: "model", parts };
    contents.push(modelTurn);
    appended.push(modelTurn);

    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (calls.length === 0) break;

    const responses: Part[] = calls.map((call) => {
      if (call.name !== RECORD_CASE_FACTS) {
        return { functionResponse: { name: call.name, id: call.id, response: { error: `Unknown tool: ${call.name}` } } };
      }
      const outcome = runRecordCaseFacts(call.args, locale, today, passes);
      if (!outcome.ok) return { functionResponse: { name: call.name, id: call.id, response: { error: outcome.error } } };
      send({ t: "case", facts: outcome.facts, result: outcome.result });
      return { functionResponse: { name: call.name, id: call.id, response: outcome.payload } };
    });

    const toolTurn: Content = { role: "user", parts: responses };
    contents.push(toolTurn);
    appended.push(toolTurn);
  }

  send({ t: "done", appended });
};

/**
 * Bei Überlastung (429/5xx): erst das Ersatzmodell, dann nach der von Google
 * genannten Wartezeit nochmal das Hauptmodell. Wiederholt nur, solange noch
 * kein Text beim Nutzer angekommen ist.
 */
async function streamWithFallback(
  models: string[],
  apiKey: string,
  body: unknown,
  send: Send,
  beforeFirstText: () => void,
): Promise<{ parts: Part[]; finishReason?: string }> {
  const [primary, fallback] = models;
  const plan: { model: string; wait?: boolean }[] = [{ model: primary }, ...(fallback ? [{ model: fallback }] : []), { model: primary, wait: true }];
  let rateLimited = false;
  let retryDelay = 5;

  for (const step of plan) {
    if (step.wait) {
      const seconds = Math.min(Math.max(retryDelay, 2), MAX_WAIT_SECONDS);
      send({ t: "status", code: "waiting", seconds });
      await new Promise((r) => setTimeout(r, seconds * 1000));
    }
    try {
      return await streamOnce(step.model, apiKey, body, send, beforeFirstText);
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      if (error.status === 429) {
        rateLimited = true;
        retryDelay = error.retryAfterSeconds ?? retryDelay;
      }
    }
  }
  throw new ChatError(rateLimited ? "rate_limit" : "api_error");
}

/** Länger als das lassen wir den Nutzer nicht warten. */
const MAX_WAIT_SECONDS = 45;

class RetryableError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Liest die Wartezeit aus einer 429-Antwort von Google (RetryInfo, z. B. "31s"). */
function parseRetryDelay(detail: string): number | undefined {
  const match = detail.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.ceil(Number(match[1])) : undefined;
}

async function streamOnce(
  model: string,
  apiKey: string,
  body: unknown,
  send: Send,
  beforeFirstText: () => void,
): Promise<{ parts: Part[]; finishReason?: string }> {
  const response = await fetch(`${GEMMA.baseUrl}/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error(`[gemma] ${model} HTTP ${response.status}`, detail.slice(0, 500));
    if (RETRYABLE.has(response.status)) throw new RetryableError(response.status, parseRetryDelay(detail));
    // Ersatzmodell kennt die Denk-Einstellung evtl. nicht: wie Überlastung behandeln, nächstes Modell probieren.
    if (response.status === 400 && /thinking/i.test(detail)) throw new RetryableError(400);
    if (response.status === 401 || response.status === 403) throw new ChatError("missing_api_key");
    throw new ChatError("bad_request");
  }

  const parts: Part[] = [];
  let finishReason: string | undefined;
  let usage: StreamChunk["usageMetadata"];
  let sentText = false;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const chunk = JSON.parse(line.slice(5)) as StreamChunk;
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
    if (chunk.promptFeedback?.blockReason) finishReason = "SAFETY";
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    for (const part of candidate?.content?.parts ?? []) {
      parts.push(part);
      if (part.text && !part.thought) {
        if (!sentText) beforeFirstText();
        sentText = true;
        send({ t: "text", d: part.text });
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handleLine(line);
    }
  }
  if (buffer.trim()) handleLine(buffer.trim());

  if (usage) console.info(`[gemma] ${model}: ${usage.promptTokenCount ?? "?"} Tokens rein, ${usage.candidatesTokenCount ?? 0} raus`);
  return { parts: compactParts(parts), finishReason };
}

/**
 * Hält den Verlauf klein (das Gratis-Kontingent zählt Eingabe-Tokens pro Minute):
 * - Denktexte ohne Signatur fliegen raus; sie würden bei jeder Anfrage erneut gezählt.
 * - Gestreamte Textstücke werden zusammengefasst.
 * Teile mit Signatur und Tool-Aufrufe bleiben unverändert.
 */
function compactParts(parts: Part[]): Part[] {
  const merged: Part[] = [];
  for (const part of parts.filter((p) => !(p.thought && !p.thoughtSignature))) {
    const last = merged[merged.length - 1];
    const plainText = (p: Part) => typeof p.text === "string" && !p.functionCall && !p.thoughtSignature;
    if (last && plainText(last) && typeof part.text === "string" && !part.functionCall && Boolean(last.thought) === Boolean(part.thought)) {
      merged[merged.length - 1] = { ...part, text: (last.text ?? "") + part.text };
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}
