import "server-only";
import { extractText } from "unpdf";
import { MAX_TOOL_ROUNDS, OLLAMA } from "@/lib/ai/config";
import { RECORD_CASE_FACTS, RECORD_CASE_FACTS_DESCRIPTION, recordCaseFactsJsonSchema, runRecordCaseFacts } from "@/lib/ai/tools";
import { PDF_TYPE, type Attachment } from "@/lib/chat-protocol";
import { ChatError, type RunChat } from "./types";

/*
 * Lokales Modell über Ollama (http://localhost:11434, native /api/chat mit Streaming).
 * Zum Entwickeln und Testen ohne Limit. Bilder gehen direkt ans Modell,
 * PDFs werden vorher als Text ausgelesen, weil Ollama keine PDFs versteht.
 */

type ToolCall = { function: { name: string; arguments: unknown } };
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
};
type Chunk = {
  message?: { content?: string; thinking?: string; tool_calls?: ToolCall[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

const tools = [
  {
    type: "function",
    function: { name: RECORD_CASE_FACTS, description: RECORD_CASE_FACTS_DESCRIPTION, parameters: recordCaseFactsJsonSchema },
  },
];

async function pdfToText(attachment: Attachment): Promise<string> {
  try {
    const { text } = await extractText(Buffer.from(attachment.data, "base64"), { mergePages: true });
    return text.trim().slice(0, 6000) || "(Kein Text im PDF gefunden – vermutlich ein Scan.)";
  } catch {
    return "(PDF konnte nicht gelesen werden.)";
  }
}

export const runOllamaChat: RunChat = async ({ history, input, locale }, { system, today, useTools, passes }, send) => {
  // Neue Nutzernachricht: Bilder direkt, PDFs als Text.
  const images = input.attachments.filter((a) => a.mediaType !== PDF_TYPE).map((a) => a.data);
  const pdfTexts = await Promise.all(
    input.attachments.filter((a) => a.mediaType === PDF_TYPE).map(async (a) => `[PDF "${a.name}"]\n${await pdfToText(a)}`),
  );
  const text = input.text.trim() || (locale === "de" ? "(Siehe Anhang.)" : "(See attachment.)");
  const user: Message = { role: "user", content: [...pdfTexts, text].join("\n\n"), ...(images.length ? { images } : {}) };

  const appended: Message[] = [user];
  const conversation: Message[] = [...(history as unknown as Message[]), user];
  let wroteText = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch(`${OLLAMA.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA.model,
        messages: [{ role: "system", content: system }, ...conversation],
        ...(useTools ? { tools } : {}),
        stream: true,
        think: OLLAMA.think,
        options: { num_ctx: OLLAMA.numCtx },
      }),
    }).catch((error: unknown) => {
      console.error("[ollama] nicht erreichbar:", error);
      throw new ChatError("local_ai_unavailable");
    });

    if (!response.ok || !response.body) {
      console.error(`[ollama] HTTP ${response.status}`, (await response.text().catch(() => "")).slice(0, 300));
      throw new ChatError(response.status === 404 ? "local_ai_unavailable" : "api_error");
    }

    let content = "";
    const toolCalls: ToolCall[] = [];
    let separated = false;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    const handle = (line: string) => {
      const chunk = JSON.parse(line) as Chunk;
      if (chunk.error) throw new ChatError("api_error", chunk.error);
      const delta = chunk.message?.content;
      if (delta) {
        if (wroteText && !separated) send({ t: "text", d: "\n\n" });
        separated = true;
        content += delta;
        send({ t: "text", d: delta });
      }
      if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);
      if (chunk.done) console.info(`[ollama] ${OLLAMA.model}: ${chunk.prompt_eval_count ?? "?"} Tokens rein, ${chunk.eval_count ?? 0} raus`);
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) handle(line);
      }
    }
    if (buffer.trim()) handle(buffer.trim());
    if (content) wroteText = true;

    // Denktext wird nicht gespeichert, damit der Verlauf klein bleibt.
    const assistant: Message = { role: "assistant", content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
    conversation.push(assistant);
    appended.push(assistant);
    if (toolCalls.length === 0) break;

    for (const call of toolCalls) {
      const { name, arguments: args } = call.function;
      let result: unknown;
      if (name !== RECORD_CASE_FACTS) {
        result = { error: `Unknown tool: ${name}` };
      } else {
        const outcome = runRecordCaseFacts(args, locale, today, passes);
        if (outcome.ok) send({ t: "case", facts: outcome.facts, result: outcome.result });
        result = outcome.ok ? outcome.payload : { error: outcome.error };
      }
      const toolMessage: Message = { role: "tool", tool_name: name, content: JSON.stringify(result) };
      conversation.push(toolMessage);
      appended.push(toolMessage);
    }
  }

  send({ t: "done", appended });
};
