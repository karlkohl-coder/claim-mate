"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { CaseFacts } from "@/domain/case";
import type { EvaluationResult } from "@/domain/result";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import type { ChatEvent, ChatRequest, PassInfo } from "@/lib/chat-protocol";
import type { DisplayMessage } from "@/lib/store/tickets";
import { AttachmentError, prepareAttachment, type PreparedAttachment } from "./attachments";
import { FormattedText } from "./FormattedText";
import { ResultCard } from "./ResultCard";
import { useVoice } from "./useVoice";

export type ChatState = { messages: DisplayMessage[]; history: unknown[]; provider: string | null; facts: CaseFacts | null };

type Props = {
  locale: Locale;
  dict: Dictionary["chat"];
  resultDict: Dictionary["result"];
  ai: { label: string; local: boolean };
  purpose: "case" | "help";
  mode: "rail" | "air" | null;
  passes?: PassInfo[];
  initial: ChatState;
  /** Begrüßung der KI (nur Anzeige, wird nicht an die KI geschickt). */
  greeting?: string;
  /** Vorschläge als Antwort-Chips, abhängig vom aktuellen Ergebnis. */
  suggestions?: (ctx: { result: EvaluationResult | null; hasUserMessage: boolean }) => string[];
  /** Wird beim Öffnen automatisch gesendet. */
  autoSend?: string;
  onPersist?: (state: ChatState) => void;
  onCase?: (facts: CaseFacts, result: EvaluationResult) => void;
  /** Zusätzlicher Inhalt über der Eingabe, z. B. der Auswerten-Button. */
  actions?: ReactNode;
  /** Ergebnis-Karten im Verlauf anzeigen. */
  showResultCards?: boolean;
};

const newId = () => crypto.randomUUID();

export function Chat(props: Props) {
  const { locale, dict, resultDict, ai, purpose, mode, passes = [], initial, greeting, suggestions, autoSend, onPersist, onCase } = props;
  const [messages, setMessages] = useState<DisplayMessage[]>(initial.messages);
  const [history, setHistory] = useState<unknown[]>(initial.history);
  const [provider, setProvider] = useState<string | null>(initial.provider);
  const [facts, setFacts] = useState<CaseFacts | null>(initial.facts);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [persistTick, setPersistTick] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const voice = useVoice(locale);
  const textArea = useRef<HTMLTextAreaElement>(null);
  /** Nach der Spracheingabe: Hinweis, den erkannten Text vor dem Senden zu prüfen. */
  const [reviewVoiceText, setReviewVoiceText] = useState(false);
  /** Text der laufenden Antwort, zum Vorlesen am Ende. */
  const replyText = useRef("");

  // Nach jeder abgeschlossenen Runde speichern (nicht bei jedem Textstück).
  useEffect(() => {
    if (persistTick === 0) return;
    onPersist?.({ messages: messages.map((m) => ({ ...m, pending: false })), history, provider, facts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistTick]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (autoSend && !autoSent.current) {
      autoSent.current = true;
      void send(autoSend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend]);

  const updateMessage = (id: string, change: (m: DisplayMessage) => DisplayMessage) =>
    setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)));

  async function send(messageText: string) {
    const trimmed = messageText.trim();
    if (busy || (!trimmed && attachments.length === 0)) return;

    const sentAttachments = attachments;
    const assistantId = newId();
    setMessages((all) => [
      ...all,
      { id: newId(), role: "user", text: trimmed, attachments: sentAttachments.map((a) => ({ name: a.name, previewUrl: a.previewUrl })) },
      { id: assistantId, role: "assistant", text: "", pending: true },
    ]);
    setText("");
    setReviewVoiceText(false);
    setAttachments([]);
    setFileError(null);
    setBusy(true);
    replyText.current = "";

    const request: ChatRequest = {
      locale,
      purpose,
      mode,
      passes,
      provider,
      history: history as ChatRequest["history"],
      facts,
      input: { text: trimmed, attachments: sentAttachments.map(({ name, mediaType, data }) => ({ name, mediaType, data })) },
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line) handleEvent(JSON.parse(line) as ChatEvent, assistantId);
        }
      }
    } catch {
      updateMessage(assistantId, (m) => ({ ...m, error: dict.errors.network }));
    } finally {
      updateMessage(assistantId, (m) => ({ ...m, pending: false, status: undefined }));
      setBusy(false);
      setPersistTick((n) => n + 1);
      if (voice.shouldSpeak() && replyText.current.trim()) void voice.speak(replyText.current);
    }
  }

  function handleEvent(event: ChatEvent, assistantId: string) {
    switch (event.t) {
      case "text":
        replyText.current += event.d;
        updateMessage(assistantId, (m) => ({ ...m, text: m.text + event.d, status: undefined }));
        break;
      case "status":
        updateMessage(assistantId, (m) => ({ ...m, status: dict.waiting.replace("{s}", String(event.seconds)) }));
        break;
      case "case":
        setFacts(event.facts);
        updateMessage(assistantId, (m) => ({ ...m, result: event.result }));
        onCase?.(event.facts, event.result);
        break;
      case "done":
        setHistory((h) => (event.provider && event.provider !== provider ? event.appended : [...h, ...event.appended]));
        setProvider(event.provider ?? null);
        break;
      case "error":
        updateMessage(assistantId, (m) => ({ ...m, error: dict.errors[event.code] }));
        break;
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setFileError(null);
    for (const file of Array.from(files).slice(0, 4 - attachments.length)) {
      try {
        const prepared = await prepareAttachment(file);
        setAttachments((all) => [...all, prepared]);
      } catch (error) {
        setFileError(error instanceof AttachmentError && error.kind === "too_large" ? dict.fileTooLarge : dict.fileUnsupported);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }

  const latestResult = [...messages].reverse().find((m) => m.result)?.result ?? null;
  const chips = busy ? [] : (suggestions?.({ result: latestResult, hasUserMessage: messages.some((m) => m.role === "user") }) ?? []);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4" aria-live="polite">
        {greeting && (
          <li className="flex flex-col items-start gap-2">
            <div className="max-w-[85%] rounded-2xl bg-soft px-4 py-2.5 text-[15px] leading-relaxed">{greeting}</div>
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className="sr-only">{m.role === "user" ? dict.you : dict.assistant}</span>
            {m.attachments && m.attachments.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {m.attachments.map((a, i) =>
                  a.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={a.previewUrl} alt={a.name} className="h-24 rounded-xl border border-line object-cover" />
                  ) : (
                    <span key={i} className="rounded-xl border border-line bg-card px-3 py-2 text-xs">
                      📄 {a.name}
                    </span>
                  ),
                )}
              </div>
            )}
            {(m.text || m.pending) && (
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  m.role === "user" ? "whitespace-pre-wrap bg-ink text-surface" : "bg-soft"
                }`}
              >
                {m.text ? (
                  m.role === "assistant" ? <FormattedText text={m.text} /> : m.text
                ) : (
                  <span className="animate-pulse text-muted">{m.status ?? dict.thinking}</span>
                )}
              </div>
            )}
            {m.error && <p className="max-w-[85%] text-sm text-bad">{m.error}</p>}
            {props.showResultCards && m.result && (
              <div className="w-full">
                <ResultCard result={m.result} locale={locale} dict={resultDict} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <div ref={bottom} />

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface/95 px-4 pb-4 pt-3 backdrop-blur">
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void send(chip)}
                className="shrink-0 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        {props.actions}
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          {attachments.length > 0 && (
            <>
              <ul className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-3 pr-1 text-xs">
                    <span className="max-w-40 truncate">{a.name}</span>
                    <button
                      type="button"
                      aria-label={`${dict.remove}: ${a.name}`}
                      onClick={() => setAttachments((all) => all.filter((_, j) => j !== i))}
                      className="grid size-6 place-items-center rounded-full text-muted hover:bg-line hover:text-ink"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-muted">
                {(ai.local ? dict.uploadNoticeLocal : dict.uploadNoticeCloud).replace("{provider}", ai.label)}
              </p>
            </>
          )}
          {fileError && <p className="text-xs text-bad">{fileError}</p>}
          {reviewVoiceText && voice.state === "idle" && !voice.error && text.trim() && (
            <p className="text-xs font-medium text-brand">✓ {dict.voice.review}</p>
          )}
          {voice.enabled && (voice.state !== "idle" || voice.error) && (
            <p className={`text-xs ${voice.error ? "text-bad" : "text-muted"}`}>
              {voice.error === "mic_denied"
                ? dict.voice.micDenied
                : voice.error === "failed"
                  ? dict.voice.failed
                  : voice.state === "recording"
                    ? `🔴 ${dict.voice.listening} ${dict.voice.notice}`
                    : dict.voice.transcribing}
            </p>
          )}

          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
            {purpose === "case" && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy || attachments.length >= 4}
                aria-label={dict.attach}
                title={dict.attach}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            )}
            {voice.enabled && (
              <>
                <button
                  type="button"
                  disabled={busy || voice.state === "transcribing"}
                  onClick={() =>
                    voice.state === "recording"
                      ? voice.stopRecording()
                      : void voice.startRecording((t) => {
                          // Erst ins Eingabefeld, damit man z. B. Zahlen vor dem Senden korrigieren kann.
                          setText((current) => (current.trim() ? `${current.trim()} ${t}` : t));
                          setReviewVoiceText(true);
                          setTimeout(() => textArea.current?.focus(), 0);
                        })
                  }
                  aria-label={voice.state === "recording" ? dict.voice.stop : dict.voice.mic}
                  title={voice.state === "recording" ? dict.voice.stop : dict.voice.mic}
                  className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-50 ${
                    voice.state === "recording" ? "animate-pulse border-bad bg-bad text-white" : "border-line bg-card text-muted hover:text-ink"
                  }`}
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {voice.state === "recording" ? <rect x="7" y="7" width="10" height="10" rx="2" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => voice.setSpeakReplies(!voice.speakReplies)}
                  aria-pressed={voice.speakReplies}
                  aria-label={voice.speakReplies ? dict.voice.speakOn : dict.voice.speakOff}
                  title={voice.speakReplies ? dict.voice.speakOn : dict.voice.speakOff}
                  className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors ${
                    voice.speakReplies ? "border-ink bg-ink text-surface" : "border-line bg-card text-muted hover:text-ink"
                  }`}
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    {voice.speakReplies ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6M21 9l-5 6" />}
                  </svg>
                </button>
              </>
            )}
            <textarea
              ref={textArea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={dict.placeholder}
              aria-label={dict.placeholder}
              className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-card px-4 py-2.5 text-[15px] leading-relaxed outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy || (!text.trim() && attachments.length === 0)}
              className="h-11 shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-surface transition-opacity disabled:opacity-40"
            >
              {dict.send}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
