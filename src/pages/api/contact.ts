import type { APIRoute } from "astro";
import { Resend } from "resend";

export const prerender = false;

const TO_EMAIL = "haerle.luca@gmx.de";
const BCC_EMAILS = "prietzelventures@gmail.com";
const FROM_EMAIL = "PUX Automobile <info@pux-automobile.de>";

type FieldErrors = Record<string, string>;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validate(data: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  const anliegen = str(data.anliegen) || "Aufbereitung";

  if (!str(data.name)) errors.name = "Bitte gib deinen Namen an.";
  if (!str(data.telefon)) errors.telefon = "Bitte gib deine Telefonnummer an.";

  const email = str(data.email);
  if (email && !isValidEmail(email)) {
    errors.email = "Bitte gib eine gültige E-Mail-Adresse an.";
  }

  if (anliegen === "Aufbereitung") {
    const plz = str(data.plz);
    if (!plz) errors.plz = "Bitte gib deine Postleitzahl an.";
    else if (!/^\d{5}$/.test(plz)) errors.plz = "Bitte gib eine gültige 5-stellige Postleitzahl an.";

    if (!str(data.leistung)) errors.leistung = "Bitte wähle eine gewünschte Leistung aus.";
  } else if (anliegen === "Fahrzeug verkaufen") {
    if (!str(data.fahrzeug_ankauf)) errors.fahrzeug_ankauf = "Bitte gib Marke und Modell deines Fahrzeugs an.";
  } else if (anliegen === "Ratgeber-Anfrage") {
    if (data.dsgvo !== true) errors.dsgvo = "Bitte stimme der Datenschutzerklärung zu, damit wir dich kontaktieren dürfen.";
  }

  return errors;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEmailHtml(data: Record<string, unknown>): string {
  const anliegen = str(data.anliegen) || "Aufbereitung";
  const rows: [string, unknown][] = [
    ["Anliegen", anliegen],
    ["Name", data.name],
    ["Telefon", data.telefon],
    ["E-Mail", data.email],
  ];

  if (anliegen === "Aufbereitung") {
    rows.push(
      ["PLZ", data.plz],
      ["Fahrzeuggröße", data.fahrzeuggroesse],
      ["Gewünschte Leistung", data.leistung],
      ["Extra-Service", data.extra_service],
    );
  } else if (anliegen === "Fahrzeug verkaufen") {
    rows.push(
      ["Fahrzeug", data.fahrzeug_ankauf],
      ["Baujahr", data.baujahr_ankauf],
      ["Kilometerstand", data.km_ankauf],
      ["Zustand", data.zustand_ankauf],
    );
  } else if (anliegen === "Fahrzeug kaufen") {
    rows.push(
      ["Gewünschtes Fahrzeug", data.wunsch_fahrzeug],
      ["Budget", data.budget],
    );
  } else if (anliegen === "Ratgeber-Anfrage") {
    rows.push(
      ["Fahrzeug", data.fahrzeug],
      ["Quelle", data.quelle],
    );
  }

  rows.push(["Nachricht", data.nachricht]);

  const rowsHtml = rows
    .filter(([, value]) => str(value) !== "")
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 16px;font-weight:600;color:#1B2B6B;background:#EEF3FB;border-bottom:1px solid #e5e7eb;white-space:nowrap;font-size:13px;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #e5e7eb;font-size:14px;">${esc(value)}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#1B2B6B,#3A7BD5);padding:24px 28px;border-radius:16px 16px 0 0;">
      <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Neue Anfrage über die Website</p>
      <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;">${esc(anliegen)}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:none;">
      ${rowsHtml}
    </table>
    <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Gesendet über das Kontaktformular auf pux-automobile.de</p>
  </div>`;
}

export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, errors: { _general: "Ungültige Anfrage. Bitte lade die Seite neu und versuche es erneut." } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const errors = validate(data);
  if (Object.keys(errors).length > 0) {
    return new Response(JSON.stringify({ success: false, errors }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY ist nicht gesetzt.");
    return new Response(
      JSON.stringify({
        success: false,
        errors: { _general: "E-Mail-Versand ist derzeit nicht konfiguriert. Bitte kontaktiere uns telefonisch." },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const resend = new Resend(apiKey);
  const anliegen = str(data.anliegen) || "Aufbereitung";
  const name = str(data.name);
  const email = str(data.email);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      bcc: BCC_EMAILS,
      replyTo: email || undefined,
      subject: `Neue Anfrage: ${anliegen} – ${name}`,
      html: buildEmailHtml(data),
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          errors: { _general: "Die Anfrage konnte nicht versendet werden. Bitte versuche es erneut oder kontaktiere uns telefonisch." },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Contact form send error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        errors: { _general: "Es ist ein technischer Fehler aufgetreten. Bitte versuche es später erneut oder kontaktiere uns telefonisch." },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
