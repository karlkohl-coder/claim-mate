"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { LETTER_CREDITS, chargeReserved, purchaseCredits, redeemFreeCredit, refundReserved, reserveCredits, useCredits } from "@/lib/store/credits";
import { addTimeline, updateTicket, type Ticket } from "@/lib/store/tickets";
import { buildClaimEmail } from "@/lib/claim-email";
import { buildAirLetter, buildRailLetter, toBase64, type LetterData } from "@/lib/pdf/letters";
import { SignaturePad, makeDemoSignature } from "./SignaturePad";

type Props = { ticket: Ticket; locale: Locale; dict: Dictionary; onSent: () => void };

const DB_RECIPIENT = ["DB Fernverkehr AG", "Servicecenter Fahrgastrechte", "60647 Frankfurt am Main"];

const input = "w-full rounded-xl border border-line bg-card px-3 py-2 text-[15px] outline-none focus:border-brand";

export function AutoSubmit({ ticket, dict, onSent }: Props) {
  const d = dict.auto;
  const credits = useCredits();
  const [form, setForm] = useState({
    salutation: "neutral" as LetterData["salutation"],
    firstName: "",
    lastName: "",
    street: "",
    houseNumber: "",
    postcode: "",
    city: "",
    email: "",
    iban: "",
    accountHolder: "",
    bookingRef: "",
    plannedArrival: "",
    actualArrival: "",
    recipient: ticket.mode === "rail" ? DB_RECIPIENT.join("\n") : "",
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [demoSignature, setDemoSignature] = useState<string | null>(null);
  /** Demo: Statt per Post geht der Antrag per E-Mail an diese Adresse. Leer = Versand nur simuliert. */
  const [demoTo, setDemoTo] = useState("");

  function fillDemo() {
    setForm((f) => ({
      ...f,
      salutation: "male",
      firstName: "Max",
      lastName: "Mustermann",
      street: "Musterstraße",
      houseNumber: "12",
      postcode: "80331",
      city: "München",
      iban: "DE02120300000000202051",
      accountHolder: "Max Mustermann",
      bookingRef: ticket.mode === "air" ? "DEMO42" : f.bookingRef,
      plannedArrival: ticket.mode === "rail" ? "14:05" : f.plannedArrival,
      actualArrival: ticket.mode === "rail" ? "15:20" : f.actualArrival,
      recipient: ticket.mode === "air" ? dict.demo.airRecipient : f.recipient,
    }));
    const sig = makeDemoSignature("Max Mustermann");
    setDemoSignature(sig);
    setSignature(sig);
    setPdf(null);
  }

  const [pdf, setPdf] = useState<{ bytes: Uint8Array; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => () => (pdf ? URL.revokeObjectURL(pdf.url) : undefined), [pdf]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setPdf(null);
  };

  const required = [form.firstName, form.lastName, form.street, form.houseNumber, form.postcode, form.city, form.iban, form.accountHolder, form.recipient];
  const valid = required.every((v) => v.trim()) && signature;

  async function preview() {
    if (!valid || !ticket.facts || !ticket.result) {
      setError(d.invalid);
      return;
    }
    setError(null);
    const data: LetterData = {
      ...form,
      email: form.email || undefined,
      bookingRef: form.bookingRef || undefined,
      plannedArrival: form.plannedArrival || undefined,
      actualArrival: form.actualArrival || undefined,
      signaturePng: signature!,
      recipient: form.recipient.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    const bytes =
      ticket.facts.mode === "rail" ? await buildRailLetter(ticket.facts, ticket.result, data) : await buildAirLetter(ticket.facts, ticket.result, data);
    setPdf({ bytes, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })) });
  }

  /**
   * Versand wie im echten Betrieb: Credit reservieren → Zustellung → erst bei Erfolg abbuchen, sonst zurückbuchen.
   * In der Demo ersetzt eine E-Mail an `demoTo` den Briefdienst; ohne Adresse wird die Annahme nur simuliert.
   */
  async function send() {
    if (!pdf || !ticket.facts || !ticket.result) return;
    const to = demoTo.trim();
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError(d.demoInvalid);
      return;
    }
    if (!reserveCredits(LETTER_CREDITS, ticket.id)) {
      setError(d.noCredits);
      return;
    }
    setError(null);
    setSending(true);
    const recipient = form.recipient.split("\n").map((l) => l.trim()).filter(Boolean);
    const pdfBase64 = toBase64(pdf.bytes);
    try {
      let previewUrl: string | undefined;
      if (to) {
        const email = buildClaimEmail(ticket.facts, ticket.result, {
          firstName: form.firstName,
          lastName: form.lastName,
          bookingRef: form.bookingRef || undefined,
          recipient,
        });
        const response = await fetch("/api/demo-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject: email.subject, text: email.text, pdfBase64, fileName: "antrag.pdf" }),
        });
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; previewUrl?: string };
        if (!response.ok || !data.ok) throw new Error(`demo-mail ${response.status}`);
        previewUrl = data.previewUrl;
      } else {
        // Simulierter Briefdienst (Testmodus): Auftrag wird angenommen.
        await new Promise((r) => setTimeout(r, 1500));
      }
      chargeReserved(LETTER_CREDITS, ticket.id);
      updateTicket(ticket.id, (t) => ({
        ...t,
        status: "sent",
        letter: {
          id: `${to ? "DEMO-MAIL" : "LX-DEMO"}-${Date.now().toString(36).toUpperCase()}`,
          createdAt: new Date().toISOString(),
          pdfBase64,
          recipient,
          service: to ? "demo-mail" : "letterxpress-demo",
          demoMailTo: to || undefined,
          demoPreviewUrl: previewUrl,
          creditsCharged: LETTER_CREDITS,
        },
      }));
      addTimeline(ticket.id, "handed_to_mail", to ? dict.demo.mailTimeline.replace("{to}", to) : undefined);
      onSent();
    } catch {
      refundReserved(LETTER_CREDITS, ticket.id);
      setError(to ? dict.demo.mailFailed : dict.chat.errors.api_error);
    } finally {
      setSending(false);
    }
  }

  const available = credits.balance - credits.reserved;

  const errorNode = error && (
        <p className="text-sm text-bad">
      {error}{" "}
      {error === d.noCredits &&
        (credits.freeCreditRedeemed ? (
        <button
          type="button"
          onClick={() => {
            purchaseCredits(LETTER_CREDITS);
            setError(null);
          }}
          className="font-medium underline"
        >
          {d.buyInline.replace("{c}", String(LETTER_CREDITS))}
        </button>
      ) : (
          <button
            type="button"
            onClick={() => {
              redeemFreeCredit();
              setError(null);
            }}
            className="font-medium underline"
          >
            {dict.credits.freeCta}
          </button>
        ))}
    </p>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight">{d.title}</h2>
        <p className="text-sm leading-relaxed text-muted">{d.intro}</p>
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed">🔒 {d.privacy}</p>
      </div>

      <button
        type="button"
        onClick={fillDemo}
        className="self-start rounded-full border border-dashed border-brand px-4 py-1.5 text-sm font-medium text-brand hover:bg-brand/10"
      >
        ✨ {dict.demo.fillForm}
      </button>

      <form className="grid grid-cols-6 gap-3 text-sm" onSubmit={(e) => e.preventDefault()}>
        <label className="col-span-6 flex flex-col gap-1">
          <span className="font-medium">{d.recipient}</span>
          <textarea rows={3} value={form.recipient} onChange={set("recipient")} placeholder={ticket.mode === "air" ? d.recipientAirHint : ""} className={input} />
        </label>
        <label className="col-span-6 flex flex-col gap-1 sm:col-span-2">
          <span className="font-medium">{d.salutation}</span>
          <select value={form.salutation} onChange={set("salutation")} className={input}>
            {(["female", "male", "neutral"] as const).map((s) => (
              <option key={s} value={s}>
                {d.salutations[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-3 flex flex-col gap-1 sm:col-span-2">
          <span className="font-medium">{d.firstName}</span>
          <input value={form.firstName} onChange={set("firstName")} autoComplete="given-name" className={input} />
        </label>
        <label className="col-span-3 flex flex-col gap-1 sm:col-span-2">
          <span className="font-medium">{d.lastName}</span>
          <input value={form.lastName} onChange={set("lastName")} autoComplete="family-name" className={input} />
        </label>
        <label className="col-span-4 flex flex-col gap-1">
          <span className="font-medium">{d.street}</span>
          <input value={form.street} onChange={set("street")} autoComplete="address-line1" className={input} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-medium">{d.houseNumber}</span>
          <input value={form.houseNumber} onChange={set("houseNumber")} className={input} />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="font-medium">{d.postcode}</span>
          <input value={form.postcode} onChange={set("postcode")} autoComplete="postal-code" inputMode="numeric" className={input} />
        </label>
        <label className="col-span-4 flex flex-col gap-1">
          <span className="font-medium">{d.city}</span>
          <input value={form.city} onChange={set("city")} autoComplete="address-level2" className={input} />
        </label>
        <label className="col-span-6 flex flex-col gap-1">
          <span className="font-medium">{d.email}</span>
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" className={input} />
        </label>
        <label className="col-span-6 flex flex-col gap-1 sm:col-span-4">
          <span className="font-medium">{d.iban}</span>
          <input value={form.iban} onChange={set("iban")} autoComplete="off" spellCheck={false} placeholder="DE00 0000 0000 0000 0000 00" className={input} />
        </label>
        <label className="col-span-6 flex flex-col gap-1 sm:col-span-2">
          <span className="font-medium">{d.accountHolder}</span>
          <input value={form.accountHolder} onChange={set("accountHolder")} className={input} />
        </label>
        <label className="col-span-6 flex flex-col gap-1">
          <span className="font-medium">{d.bookingRef}</span>
          <input value={form.bookingRef} onChange={set("bookingRef")} className={input} />
        </label>
        {ticket.mode === "rail" && (
          <>
            <label className="col-span-3 flex flex-col gap-1">
              <span className="font-medium">{d.plannedArrival}</span>
              <input type="time" value={form.plannedArrival} onChange={set("plannedArrival")} className={input} />
            </label>
            <label className="col-span-3 flex flex-col gap-1">
              <span className="font-medium">{d.actualArrival}</span>
              <input type="time" value={form.actualArrival} onChange={set("actualArrival")} className={input} />
            </label>
          </>
        )}
        <div className="col-span-6">
          <SignaturePad
            value={demoSignature}
            label={d.signature}
            clearLabel={d.clear}
            onChange={(s) => {
              setSignature(s);
              setPdf(null);
            }}
          />
          <p className="mt-1 text-xs text-muted">{d.signHere}</p>
        </div>
      </form>

      {!pdf && errorNode}

      <button type="button" onClick={() => void preview()} className="self-start rounded-full border border-ink px-5 py-2.5 text-sm font-semibold hover:bg-ink hover:text-surface">
        {d.preview}
      </button>

      {pdf && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{d.previewTitle}</h3>
          <iframe src={pdf.url} title={d.previewTitle} className="h-[70vh] w-full rounded-xl border border-line bg-white" />
          <a href={pdf.url} download="antrag.pdf" className="text-sm font-medium text-brand underline">
            {d.downloadPdf}
          </a>
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{d.shippingTitle}</h3>
              <p className="text-sm leading-relaxed">
                <span className="text-muted">{d.shippingTo}: </span>
                {form.recipient.split("\n").filter(Boolean).join(", ")}
              </p>
              <p className="text-xs leading-relaxed text-muted">{d.explain}</p>
            </div>

            <label className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-surface">{dict.demo.badge}</span>
                {d.demoRecipient}
              </span>
              <input
                type="email"
                value={demoTo}
                onChange={(e) => setDemoTo(e.target.value)}
                placeholder={dict.demo.mailPlaceholder}
                className={`${input} max-w-sm`}
              />
              <span className="text-xs leading-relaxed text-muted">{d.demoRecipientHint}</span>
            </label>

            {errorNode}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={sending}
                onClick={() => void send()}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
              >
                {sending ? (demoTo.trim() ? d.sendingDemo : d.sending) : d.send.replace("{c}", String(LETTER_CREDITS))}
              </button>
              <span className="text-xs text-muted">
                {dict.credits.balance}: {available} {dict.credits.unit}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
