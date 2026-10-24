import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC, MAX_TOOL_ROUNDS } from "@/lib/ai/config";
import { RECORD_CASE_FACTS, RECORD_CASE_FACTS_DESCRIPTION, recordCaseFactsJsonSchema, runRecordCaseFacts } from "@/lib/ai/tools";
import { PDF_TYPE } from "@/lib/chat-protocol";
import { ChatError, type RunChat } from "./types";

/*
 * Alternative: Claude über die Anthropic API. Aktiv mit AI_PROVIDER=anthropic in .env.local.
 * Der Verlauf wird nur angehängt, nie verändert (wichtig für die Denkblöcke des Modells).
 */

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: RECORD_CASE_FACTS,
    description: RECORD_CASE_FACTS_DESCRIPTION,
    eager_input_streaming: true,
    input_schema: recordCaseFactsJsonSchema as Anthropic.Beta.BetaTool["input_schema"],
  },
];

export const runAnthropicChat: RunChat = async ({ history, input, locale }, { system, today, useTools, passes }, send) => {
  if (!ANTHROPIC.apiKey()) throw new ChatError("missing_api_key");
  const client = new Anthropic();

  const content: ContentBlockParam[] = input.attachments.map((a) =>
    a.mediaType === PDF_TYPE
      ? { type: "document", source: { type: "base64", media_type: PDF_TYPE, data: a.data }, title: a.name }
      : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } },
  );
  content.push({ type: "text", text: input.text.trim() || (locale === "de" ? "(Siehe Anhang.)" : "(See attachment.)") });

  const appended: MessageParam[] = [{ role: "user", content }];
  const messages: MessageParam[] = [...(history as unknown as MessageParam[]), ...appended];
  let wroteText = false;
  let jsonRetries = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      model: ANTHROPIC.model,
      max_tokens: ANTHROPIC.maxTokens,
      // Ersatzmodell bei Ablehnung gibt es nicht für Haiku.
      ...(ANTHROPIC.model.includes("haiku") ? {} : { betas: [ANTHROPIC.fallbackBeta], fallbacks: "default" as const }),
      output_config: { effort: ANTHROPIC.effort },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(useTools ? { tools } : {}),
      messages,
    });

    let separated = false;
    stream.on("text", (delta) => {
      if (wroteText && !separated) send({ t: "text", d: "\n\n" });
      separated = true;
      wroteText = true;
      send({ t: "text", d: delta });
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (error) {
      // Nur eine nicht lesbare Tool-Eingabe wird wiederholt, API-Fehler nicht.
      if (error instanceof Anthropic.APIError) throw toChatError(error);
      if (jsonRetries++ >= 2) throw error;
      continue;
    }

    if (message.stop_reason === "refusal") throw new ChatError("refusal");

    const assistant: MessageParam = { role: "assistant", content: message.content };
    messages.push(assistant);
    appended.push(assistant);

    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tool) => {
      if (tool.name !== RECORD_CASE_FACTS) {
        return { type: "tool_result", tool_use_id: tool.id, is_error: true, content: `Unknown tool: ${tool.name}` };
      }
      const outcome = runRecordCaseFacts(tool.input, locale, today, passes);
      if (!outcome.ok) return { type: "tool_result", tool_use_id: tool.id, is_error: true, content: outcome.error };
      send({ t: "case", facts: outcome.facts, result: outcome.result });
      return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(outcome.payload) };
    });

    const toolMessage: MessageParam = { role: "user", content: results };
    messages.push(toolMessage);
    appended.push(toolMessage);
  }

  send({ t: "done", appended });
};

function toChatError(error: InstanceType<typeof Anthropic.APIError>): ChatError {
  if (error instanceof Anthropic.RateLimitError) return new ChatError("rate_limit");
  if (error instanceof Anthropic.AuthenticationError) return new ChatError("missing_api_key");
  if (error instanceof Anthropic.BadRequestError) return new ChatError("bad_request");
  return new ChatError("api_error");
}
