"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";

/*
 * Sprachfunktionen für den Chat (über ElevenLabs, Key bleibt auf dem Server):
 * - Aufnahme übers Mikrofon → Text
 * - Antworten vorlesen
 */

export type VoiceState = "idle" | "recording" | "transcribing";

/** Markdown-Zeichen entfernen, damit nichts Seltsames vorgelesen wird. */
function speakable(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 2400);
}

export function useVoice(locale: Locale) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [speakReplies, setSpeakReplies] = useState(false);
  const [error, setError] = useState<"mic_denied" | "failed" | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const onTextRef = useRef<((text: string) => void) | null>(null);
  // Als Ref zusätzlich, damit Callbacks aus früheren Renders den aktuellen Wert sehen.
  const speakRef = useRef(false);
  useEffect(() => {
    speakRef.current = speakReplies;
  }, [speakReplies]);

  useEffect(() => {
    fetch("/api/voice/status")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  function stopSpeaking() {
    audio.current?.pause();
    audio.current = null;
  }

  async function startRecording(onText: (text: string) => void) {
    setError(null);
    stopSpeaking();
    onTextRef.current = onText;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("mic_denied");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, "aufnahme.webm");
        form.append("locale", locale);
        const response = await fetch("/api/voice/stt", { method: "POST", body: form });
        const data = (await response.json()) as { text?: string };
        if (!response.ok) throw new Error(String(response.status));
        if (data.text) onTextRef.current?.(data.text);
      } catch {
        setError("failed");
      } finally {
        setState("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
    // Wer spricht, will meist auch zuhören.
    speakRef.current = true;
    setSpeakReplies(true);
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
  }

  async function speak(text: string) {
    const clean = speakable(text);
    if (!clean) return;
    stopSpeaking();
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const player = new Audio(url);
      player.onended = () => URL.revokeObjectURL(url);
      audio.current = player;
      await player.play();
    } catch {
      setError("failed");
    }
  }

  return {
    enabled,
    state,
    error,
    speakReplies,
    shouldSpeak: () => speakRef.current,
    setSpeakReplies: (on: boolean) => {
      if (!on) stopSpeaking();
      speakRef.current = on;
      setSpeakReplies(on);
    },
    startRecording,
    stopRecording,
    speak,
  };
}
