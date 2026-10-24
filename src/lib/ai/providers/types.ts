import "server-only";
import type { ChatEvent, ChatRequest, PassInfo } from "@/lib/chat-protocol";

export type Send = (event: ChatEvent) => void;

export type ChatContext = {
  system: string;
  today: string;
  /** In der Soforthilfe gibt es kein Tool. */
  useTools: boolean;
  passes: PassInfo[];
};

/** Ein KI-Anbieter führt eine Nutzernachricht inklusive Tool-Runden aus und streamt Ereignisse. */
export type RunChat = (request: ChatRequest, context: ChatContext, send: Send) => Promise<void>;

/** Fehler mit einem Code, den die Oberfläche übersetzen kann. */
export class ChatError extends Error {
  constructor(readonly code: Extract<ChatEvent, { t: "error" }>["code"], message?: string) {
    super(message ?? code);
  }
}
