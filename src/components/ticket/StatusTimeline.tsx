"use client";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { addTimeline, updateTicket, type Ticket } from "@/lib/store/tickets";

type Props = { ticket: Ticket; locale: Locale; dict: Dictionary["status"]; demo: Dictionary["demo"] };

function addWorkingDays(iso: string, days: number): Date {
  const date = new Date(iso);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  return date;
}

export function StatusTimeline({ ticket, locale, dict, demo }: Props) {
  const fmt = (d: Date | string) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(typeof d === "string" ? new Date(d) : d);
  const at = (type: string) => ticket.timeline.find((e) => e.type === type)?.at;
  const handed = at("handed_to_mail");

  const steps: { label: string; date?: string; note?: string; done: boolean }[] = [
    { label: dict.created, date: fmt(ticket.createdAt), done: true },
    { label: dict.evaluated, date: at("evaluated") && fmt(at("evaluated")!), done: Boolean(at("evaluated")) },
  ];
  if (ticket.status === "submitted_self" || at("submitted_self")) {
    steps.push({ label: dict.submitted_self, date: at("submitted_self") && fmt(at("submitted_self")!), done: true });
  } else {
    const handedNote = ticket.timeline.find((e) => e.type === "handed_to_mail")?.note ?? ticket.letter?.id;
    steps.push({ label: dict.handed_to_mail, date: handed ? fmt(handed) : undefined, note: handedNote, done: Boolean(handed) });
    steps.push({
      label: dict.expected_delivery,
      date: handed ? fmt(addWorkingDays(handed, 2)) : undefined,
      note: dict.expected_note,
      done: handed !== undefined && addWorkingDays(handed, 2) <= new Date(),
    });
  }
  steps.push({ label: dict.answer_uploaded, date: at("answer_uploaded") && fmt(at("answer_uploaded")!), note: ticket.answerFileName, done: Boolean(at("answer_uploaded")) });
  steps.push({ label: dict.paid, date: at("paid") && fmt(at("paid")!), done: ticket.status === "paid" });

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-bold tracking-tight">{dict.title}</h2>
      <ol className="relative flex flex-col gap-5 border-l-2 border-line pl-6">
        {steps.map((s) => (
          <li key={s.label} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[33px] top-0.5 grid size-4 place-items-center rounded-full border-2 ${
                s.done ? "border-ok bg-ok" : "border-line bg-surface"
              }`}
            />
            <p className={`font-medium ${s.done ? "" : "text-muted"}`}>{s.label}</p>
            <p className="text-sm text-muted">
              {s.date ?? dict.pending}
              {s.note ? ` · ${s.note}` : ""}
            </p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {ticket.letter && (
          <a
            href={`data:application/pdf;base64,${ticket.letter.pdfBase64}`}
            download="antrag.pdf"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-brand"
          >
            PDF
          </a>
        )}
        <label className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-brand">
          {dict.uploadAnswer}
          <input
            type="file"
            hidden
            accept="image/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              updateTicket(ticket.id, (t) => ({ ...t, status: t.status === "paid" ? t.status : "answered", answerFileName: file.name }));
              addTimeline(ticket.id, "answer_uploaded");
            }}
          />
        </label>
        {ticket.letter?.demoPreviewUrl && (
          <a
            href={ticket.letter.demoPreviewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-dashed border-brand px-4 py-2 text-sm font-medium text-brand"
          >
            ✉️ {demo.mailPreview}
          </a>
        )}
        {!ticket.answerFileName && (
          <button
            type="button"
            onClick={() => {
              updateTicket(ticket.id, (t) => ({ ...t, status: t.status === "paid" ? t.status : "answered", answerFileName: demo.answerName }));
              addTimeline(ticket.id, "answer_uploaded");
            }}
            className="rounded-full border border-dashed border-brand px-4 py-2 text-sm font-medium text-brand"
          >
            ✨ {demo.simulateAnswer}
          </button>
        )}
        {ticket.status !== "paid" && (
          <button
            type="button"
            onClick={() => {
              updateTicket(ticket.id, (t) => ({ ...t, status: "paid" }));
              addTimeline(ticket.id, "paid");
            }}
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface"
          >
            {dict.markPaid}
          </button>
        )}
      </div>
    </div>
  );
}
