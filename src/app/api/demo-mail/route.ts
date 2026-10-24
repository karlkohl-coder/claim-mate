import nodemailer from "nodemailer";
import { z } from "zod";

/*
 * Demo-Versand: schickt den fertigen Antrag als PDF-Anhang an eine eingetragene E-Mail-Adresse.
 * Mit SMTP-Zugang in .env.local (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) wird echt verschickt.
 * Ohne Zugang geht die Mail an einen Test-Mailserver (Ethereal) und ist per Vorschau-Link sichtbar.
 *
 * Nur für die lokale Demo gedacht: Nicht öffentlich betreiben, sonst kann jeder darüber Mails versenden.
 */

const DemoMail = z.object({
  to: z.email(),
  subject: z.string().min(1).max(200),
  text: z.string().max(4000),
  pdfBase64: z.string().min(1).max(12 * 1024 * 1024),
  fileName: z.string().max(100).default("antrag.pdf"),
});

// Einfache Bremse: höchstens 10 Mails pro Minute.
const sentAt: number[] = [];

async function transport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 587;
    // Google zeigt App-Passwörter mit Leerzeichen an ("abcd efgh …"); für die Anmeldung zählen nur die Buchstaben.
    const pass = SMTP_HOST.includes("gmail") ? SMTP_PASS.replace(/\s+/g, "") : SMTP_PASS;
    return {
      mode: "smtp" as const,
      from: process.env.SMTP_FROM || SMTP_USER,
      transporter: nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass } }),
    };
  }
  const account = await nodemailer.createTestAccount();
  return {
    mode: "preview" as const,
    from: `Claim Mate Demo <${account.user}>`,
    transporter: nodemailer.createTransport({ host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure, auth: { user: account.user, pass: account.pass } }),
  };
}

export async function POST(request: Request) {
  const body = DemoMail.safeParse(await request.json().catch(() => null));
  console.info(
    `[demo-mail] ${new Date().toISOString()} to=${body.success ? body.data.to : "?"} referer=${request.headers.get("referer") ?? "-"} ua=${(request.headers.get("user-agent") ?? "-").slice(0, 60)}`,
  );
  if (!body.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const now = Date.now();
  while (sentAt.length && now - sentAt[0] > 60_000) sentAt.shift();
  if (sentAt.length >= 10) return Response.json({ error: "rate_limit" }, { status: 429 });
  sentAt.push(now);

  try {
    const { mode, from, transporter } = await transport();
    const info = await transporter.sendMail({
      from,
      to: body.data.to,
      subject: `[Demo] ${body.data.subject}`,
      text: body.data.text,
      attachments: [{ filename: body.data.fileName, content: Buffer.from(body.data.pdfBase64, "base64"), contentType: "application/pdf" }],
    });
    const previewUrl = mode === "preview" ? nodemailer.getTestMessageUrl(info) || undefined : undefined;
    return Response.json({ ok: true, mode, previewUrl });
  } catch (error) {
    console.error("[demo-mail]", error);
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
}
