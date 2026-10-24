"use client";

import { useState } from "react";
import { prepareAttachment } from "@/components/chat/attachments";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/de";
import { formatDate, formatEur } from "@/i18n/reasons";
import { addPass, deletePass, usePasses, type Pass } from "@/lib/store/passes";
import { useToday } from "@/lib/use-today";

const input = "w-full rounded-xl border border-line bg-card px-3 py-2 text-[15px] outline-none focus:border-brand";

/** Standard: aktueller Kalendermonat (erst beim Speichern berechnet). */
function currentMonth(): { from: string; until: string } {
  const d = new Date();
  const from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
  const until = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
  return { from, until };
}

export function PassesView({ locale, dict, demoLabel }: { locale: Locale; dict: Dictionary["passes"]; demoLabel: string }) {
  const passes = usePasses();
  const today = useToday();
  const [form, setForm] = useState({
    type: "deutschlandticket" as Pass["type"],
    travelClass: "2",
    validFrom: "",
    validUntil: "",
    priceEur: "",
  });
  const [file, setFile] = useState<Pass["file"]>();
  const [reading, setReading] = useState<"idle" | "busy" | "done" | "failed">("idle");

  /** Lässt die KI Art, Klasse, Gültigkeit und Preis aus dem Foto/PDF lesen und füllt das Formular vor. */
  async function readWithAi(attachment: NonNullable<Pass["file"]>) {
    setReading("busy");
    try {
      const response = await fetch("/api/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachment }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as Partial<{ type: Pass["type"] | null; travelClass: 1 | 2 | null; validFrom: string | null; validUntil: string | null; priceEur: number | null }>;
      setForm((f) => ({
        ...f,
        type: data.type ?? f.type,
        travelClass: data.travelClass ? String(data.travelClass) : f.travelClass,
        validFrom: data.validFrom ?? f.validFrom,
        validUntil: data.validUntil ?? f.validUntil,
        priceEur: data.priceEur != null ? String(data.priceEur).replace(".", ",") : f.priceEur,
      }));
      setReading("done");
    } catch {
      setReading("failed");
    }
  }

  const save = () => {
    const month = currentMonth();
    addPass({
      type: form.type,
      travelClass: form.type === "deutschlandticket" ? 2 : (Number(form.travelClass) as 1 | 2),
      validFrom: form.validFrom || month.from,
      validUntil: form.validUntil || month.until,
      priceEur: form.priceEur ? Number(form.priceEur.replace(",", ".")) : undefined,
      file,
    });
    setFile(undefined);
    setReading("idle");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="display text-3xl sm:text-4xl">{dict.title}</h1>
        <p className="text-sm leading-relaxed text-muted">{dict.intro}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          const month = currentMonth();
          addPass({ type: "deutschlandticket", travelClass: 2, validFrom: month.from, validUntil: month.until, priceEur: 63 });
        }}
        className="self-start rounded-full border border-dashed border-brand px-4 py-1.5 text-sm font-medium text-brand hover:bg-brand/10"
      >
        ✨ {demoLabel}
      </button>

      <ul className="flex flex-col gap-2">
        {passes.length === 0 && <li className="text-sm text-muted">{dict.empty}</li>}
        {passes.map((p) => {
          const active = p.validFrom <= today && today <= p.validUntil;
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-card p-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">
                  🎫 {dict.types[p.type]} <span className="text-sm font-normal text-muted">· {p.travelClass}. Kl.</span>
                </span>
                <span className="text-sm text-muted">
                  {formatDate(p.validFrom, locale)} – {formatDate(p.validUntil, locale)}
                  {p.priceEur !== undefined ? ` · ${formatEur(p.priceEur, locale)}` : ""}
                  {p.file ? ` · 📎 ${p.file.name}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-ok-tint text-ok" : "bg-soft text-muted"}`}>
                  {active ? dict.active : dict.expired}
                </span>
                <button type="button" onClick={() => deletePass(p.id)} className="text-sm text-muted hover:text-bad" aria-label={dict.delete}>
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
        <h2 className="font-semibold">{dict.add}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="font-medium">{dict.type}</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Pass["type"] })} className={input}>
              {(Object.keys(dict.types) as Pass["type"][]).map((t) => (
                <option key={t} value={t}>
                  {dict.types[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="font-medium">{dict.travelClass}</span>
            <select
              value={form.type === "deutschlandticket" ? "2" : form.travelClass}
              disabled={form.type === "deutschlandticket"}
              onChange={(e) => setForm({ ...form, travelClass: e.target.value })}
              className={input}
            >
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{dict.validFrom}</span>
            <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{dict.validUntil}</span>
            <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={input} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="font-medium">{dict.price}</span>
            <input inputMode="decimal" value={form.priceEur} onChange={(e) => setForm({ ...form, priceEur: e.target.value })} className={input} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <span className="font-medium">{dict.file}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const prepared = await prepareAttachment(f).catch(() => undefined);
                if (!prepared) return;
                const attachment = { name: prepared.name, mediaType: prepared.mediaType, data: prepared.data };
                setFile(attachment);
                void readWithAi(attachment);
              }}
              className="text-sm"
            />
            <span className="text-xs text-muted">
              {reading === "busy" ? dict.reading : reading === "done" ? dict.readDone : reading === "failed" ? dict.readFailed : dict.readNotice}
            </span>
          </label>
        </div>
        <button type="button" onClick={save} className="self-start rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface">
          {dict.save}
        </button>
      </section>
    </div>
  );
}
