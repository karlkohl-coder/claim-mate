"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Chat } from "@/components/chat/Chat";
import { ResultCard } from "@/components/chat/ResultCard";
import type { EvaluationResult } from "@/domain/result";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import type { PassInfo } from "@/lib/chat-protocol";
import { LETTER_CREDITS } from "@/lib/store/credits";
import { usePasses } from "@/lib/store/passes";
import { addTimeline, updateTicket, useTicket, useTicketsReady, type Ticket } from "@/lib/store/tickets";
import { DEMO_CASES, runDemoCase } from "@/lib/demo";
import { summarizeTicket } from "@/lib/ticket-summary";
import { useDeleteTicket } from "@/components/layout/TicketList";
import { AutoSubmit } from "./AutoSubmit";
import { SelfSubmit } from "./SelfSubmit";
import { StatusTimeline } from "./StatusTimeline";

type Props = { locale: Locale; dict: Dictionary; ai: { label: string; local: boolean } };
type Step = "chat" | "result" | "self" | "auto" | "status";

/** Unter diesem Betrag empfehlen wir, selbst einzureichen. */
const SMALL_AMOUNT_EUR = 5;

export function TicketView(props: Props) {
  const id = useSearchParams().get("id");
  const ready = useTicketsReady();
  const ticket = useTicket(id);

  if (!ready) return null;
  if (!ticket) {
    return (
      <div className="flex flex-col gap-3">
        <p>{props.dict.ticket.notFound}</p>
        <Link href={`/${props.locale}`} className="font-medium text-brand">
          {props.dict.ticket.back}
        </Link>
      </div>
    );
  }
  return <TicketInner key={ticket.id} ticket={ticket} {...props} />;
}

function initialStep(ticket: Ticket): Step {
  if (["submitted_self", "sent", "answered", "paid"].includes(ticket.status)) return "status";
  if (ticket.status === "evaluated") return "result";
  return "chat";
}

function TicketInner({ ticket, locale, dict, ai }: Props & { ticket: Ticket }) {
  const [step, setStep] = useState<Step>(() => initialStep(ticket));
  const removeTicket = useDeleteTicket(locale, dict.tickets);
  /** Erzwingt einen frischen Chat, nachdem ein Demo-Fall geladen wurde. */
  const [chatKey, setChatKey] = useState(0);
  const demos = DEMO_CASES.filter((d) => d.mode === ticket.mode);

  const loadDemo = (demo: (typeof DEMO_CASES)[number]) => {
    const { facts, result: r, reply } = runDemoCase(demo, locale);
    updateTicket(ticket.id, (t) => ({
      ...t,
      facts,
      result: r,
      history: [],
      provider: null,
      draft: undefined,
      messages: [
        { id: crypto.randomUUID(), role: "user", text: demo.userText[locale] },
        { id: crypto.randomUUID(), role: "assistant", text: reply, result: r },
      ],
    }));
    setChatKey((k) => k + 1);
  };
  const passes = usePasses();
  const passInfos: PassInfo[] = passes.map(({ type, travelClass, validFrom, validUntil, priceEur }) => ({ type, travelClass, validFrom, validUntil, priceEur }));
  const today = new Date().toISOString().slice(0, 10);
  const activePass = ticket.mode === "rail" ? passes.find((p) => p.validFrom <= today && today <= p.validUntil) : undefined;
  const summary = summarizeTicket(ticket);
  const result = ticket.result;
  const submitted = ["submitted_self", "sent", "answered", "paid"].includes(ticket.status);

  const suggestions = ({ result: r, hasUserMessage }: { result: EvaluationResult | null; hasUserMessage: boolean }) => {
    if (!hasUserMessage) return dict.chips.start[ticket.mode];
    const key = r?.missingFacts[0]?.split(".").pop();
    const chips = key ? (dict.chips as unknown as Record<string, string[] | undefined>)[key] : undefined;
    return Array.isArray(chips) ? chips : [];
  };

  const evaluate = () => {
    updateTicket(ticket.id, (t) => ({ ...t, status: t.status === "open" ? "evaluated" : t.status }));
    addTimeline(ticket.id, "evaluated");
    setStep("result");
  };

  const steps: { key: Step; label: string; enabled: boolean }[] = [
    { key: "chat", label: dict.ticket.steps.chat, enabled: true },
    { key: "result", label: dict.ticket.steps.result, enabled: Boolean(result) },
    { key: ticket.letter ? "status" : step === "auto" ? "auto" : "self", label: dict.ticket.steps.submit, enabled: result?.outcome === "eligible" && !submitted },
    { key: "status", label: dict.ticket.steps.status, enabled: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="display text-2xl sm:text-3xl">
            {ticket.mode === "rail" ? "🚆" : "✈️"} {summary.route ?? (ticket.mode === "rail" ? dict.tickets.railUntitled : dict.tickets.airUntitled)}
          </h1>
          <p className="text-sm text-muted">{dict.tickets.status[ticket.status]}</p>
        </div>
        <button
          type="button"
          onClick={() => removeTicket(ticket.id)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-bad hover:bg-bad-tint hover:text-bad"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
          <span className="hidden sm:inline">{dict.tickets.delete}</span>
        </button>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-full border border-line bg-card p-1 text-sm">
        {steps.map((s, i) => {
          const active = step === s.key || (s.key === "self" && step === "auto");
          return (
            <button
              key={i}
              type="button"
              disabled={!s.enabled}
              onClick={() => setStep(s.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-40 ${active ? "bg-ink text-surface" : "hover:bg-line"}`}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
      </nav>

      {step === "chat" && ticket.messages.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-brand p-3 text-sm">
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-surface">{dict.demo.badge}</span>
          <span className="text-muted">{dict.demo.loadCase}</span>
          {demos.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => loadDemo(demo)}
              className="rounded-full border border-brand px-3 py-1 font-medium text-brand hover:bg-brand/10"
            >
              {demo.label[locale]}
            </button>
          ))}
        </div>
      )}

      {step === "chat" && (
        <Chat
          key={chatKey}
          locale={locale}
          dict={dict.chat}
          resultDict={dict.result}
          ai={ai}
          purpose="case"
          mode={ticket.mode}
          passes={passInfos}
          initial={{ messages: ticket.messages, history: ticket.history, provider: ticket.provider, facts: ticket.facts }}
          greeting={
            (ticket.mode === "rail" ? dict.ticket.greetingRail : dict.ticket.greetingAir) +
            (activePass ? `\n\n${dict.ticket.passApplied.replace("{pass}", dict.passes.types[activePass.type])}` : "")
          }
          suggestions={suggestions}
          autoSend={ticket.draft}
          onCase={(facts, r) => updateTicket(ticket.id, (t) => ({ ...t, facts, result: r }))}
          onPersist={(state) =>
            updateTicket(ticket.id, (t) => ({
              ...t,
              draft: undefined,
              history: state.history,
              provider: state.provider,
              facts: state.facts ?? t.facts,
              // Vorschaubilder sind nur in dieser Sitzung gültig.
              messages: state.messages.map((m) => ({ ...m, attachments: m.attachments?.map((a) => ({ name: a.name })) })),
            }))
          }
          actions={
            result &&
            result.missingFacts.length === 0 && (
              <button type="button" onClick={evaluate} className="w-full rounded-full bg-ink py-3 text-sm font-semibold text-surface">
                {dict.ticket.evaluate} →
              </button>
            )
          }
        />
      )}

      {step === "result" && result && (
        <div className="flex flex-col gap-5">
          <ResultCard result={result} locale={locale} dict={dict.result} />
          {result.outcome === "unclear" && (
            <button type="button" onClick={() => setStep("chat")} className="self-start text-sm font-medium text-brand">
              ← {dict.ticket.resultFirst}
            </button>
          )}
          {result.outcome === "not_eligible" && <p className="text-sm text-muted">{dict.ticket.notEligibleHint}</p>}
          {result.outcome === "eligible" && !submitted && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold tracking-tight">{dict.ticket.optionsTitle}</h2>
              {result.totalEur !== undefined && result.totalEur < SMALL_AMOUNT_EUR && (
                <p className="rounded-lg border border-warn/60 bg-warn/15 px-3 py-2 text-sm">{dict.ticket.smallAmountHint}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setStep("self")} className="flex flex-col gap-1 rounded-3xl border-2 border-line bg-card p-5 text-left hover:border-ink">
                  <span className="font-semibold">{dict.ticket.selfTitle}</span>
                  <span className="text-sm leading-relaxed text-muted">{dict.ticket.selfText}</span>
                  <span className="mt-2 text-sm font-semibold text-brand">0 €</span>
                </button>
                <button type="button" onClick={() => setStep("auto")} className="flex flex-col gap-1 rounded-3xl border-2 border-brand-line bg-brand-tint p-5 text-left hover:border-brand">
                  <span className="font-semibold">{dict.ticket.autoTitle}</span>
                  <span className="text-sm leading-relaxed text-muted">{dict.ticket.autoText}</span>
                  <span className="mt-2 text-sm font-semibold text-brand">◆ {dict.ticket.autoCost.replace("{c}", String(LETTER_CREDITS))}</span>
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {step === "self" && (
        <SelfSubmit
          ticket={ticket}
          locale={locale}
          dict={dict}
          onDone={() => {
            updateTicket(ticket.id, (t) => ({ ...t, status: "submitted_self" }));
            addTimeline(ticket.id, "submitted_self");
            setStep("status");
          }}
        />
      )}

      {step === "auto" && <AutoSubmit ticket={ticket} locale={locale} dict={dict} onSent={() => setStep("status")} />}

      {step === "status" && <StatusTimeline ticket={ticket} locale={locale} dict={dict.status} demo={dict.demo} />}
    </div>
  );
}
