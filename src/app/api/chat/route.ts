import { todayIso } from "@/engine/dates";
import { PROVIDER } from "@/lib/ai/config";
import { runAnthropicChat } from "@/lib/ai/providers/anthropic";
import { runGemmaChat } from "@/lib/ai/providers/gemma";
import { runOllamaChat } from "@/lib/ai/providers/ollama";
import { ChatError, type RunChat } from "@/lib/ai/providers/types";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { ChatRequest, type ChatEvent } from "@/lib/chat-protocol";

const PROVIDERS: Record<typeof PROVIDER, RunChat> = { gemma: runGemmaChat, anthropic: runAnthropicChat, ollama: runOllamaChat };

export async function POST(request: Request) {
  const parsed = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.input.text.trim() && parsed.data.input.attachments.length === 0)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // Verläufe verschiedener Anbieter sind nicht kompatibel. Bei Wechsel neu beginnen.
  const chat = parsed.data.provider === PROVIDER ? parsed.data : { ...parsed.data, history: [] };
  const today = todayIso();
  const context = {
    system: buildSystemPrompt(chat.locale, today, { purpose: chat.purpose, mode: chat.mode, passes: chat.passes, facts: chat.facts }),
    today,
    useTools: chat.purpose === "case",
    passes: chat.passes,
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        // Der Browser braucht den Anbieter, um ihn beim nächsten Mal mitzuschicken.
        const withProvider = event.t === "done" ? { ...event, provider: PROVIDER } : event;
        controller.enqueue(encoder.encode(JSON.stringify(withProvider) + "\n"));
      };
      try {
        await PROVIDERS[PROVIDER](chat, context, send);
      } catch (error) {
        console.error("[chat]", error);
        send({ t: "error", code: error instanceof ChatError ? error.code : "api_error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
