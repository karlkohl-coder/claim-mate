"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chat, type ChatState } from "@/components/chat/Chat";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { createTicket } from "@/lib/store/tickets";

/** Soforthilfe unterwegs: Fragen zu Rechten während der Fahrt. Daraus lässt sich ein Ticket machen. */
export function HelpView({ locale, dict, ai }: { locale: Locale; dict: Dictionary; ai: { label: string; local: boolean } }) {
  const router = useRouter();
  const [state, setState] = useState<ChatState>({ messages: [], history: [], provider: null, facts: null });
  const lastQuestion = [...state.messages].reverse().find((m) => m.role === "user")?.text;

  const toTicket = () => {
    const userTexts = state.messages.filter((m) => m.role === "user").map((m) => m.text);
    const draft =
      locale === "de"
        ? `Aus der Soforthilfe – das ist passiert: ${userTexts.join(" ")}`
        : `From live help – this happened: ${userTexts.join(" ")}`;
    const ticket = createTicket("rail", draft);
    router.push(`/${locale}/ticket?id=${ticket.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="display text-3xl sm:text-4xl">{dict.help.title}</h1>
        <p className="text-sm text-muted">{dict.help.intro}</p>
      </div>
      <Chat
        locale={locale}
        dict={dict.chat}
        resultDict={dict.result}
        ai={ai}
        purpose="help"
        mode="rail"
        initial={state}
        onPersist={setState}
        suggestions={({ hasUserMessage }) => (hasUserMessage ? [] : dict.help.quick.map((q) => q.prompt))}
        actions={
          lastQuestion && (
            <button type="button" onClick={toTicket} className="w-full rounded-full border border-ink py-3 text-sm font-semibold hover:bg-ink hover:text-surface">
              {dict.help.toTicket} →
            </button>
          )
        }
      />
    </div>
  );
}
