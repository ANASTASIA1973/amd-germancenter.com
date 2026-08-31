// netlify/functions/contact.js
//
// Nimmt das Kontaktformular von /de|/en|/ar/contact entgegen und laesst die
// Meldung ans Buero ueber den gemeinsamen Maildienst der Transfer-Seite
// verschicken.
//
// Warum nicht mehr ueber die Benachrichtigung von Netlify Forms: Die kam von
// formresponses@netlify.com, trug als Anzeigenamen aber "amd-germancenter.com"
// - die Domain des Empfaengers selbst. An info@amd-tarifcheck.de wurde sie
// zugestellt, an info@amd-germancenter.com am 31.08.2026 nicht, weder im
// Posteingang noch im Spam. Ueber den eigenen IONOS-Versand gehoeren Absender
// und Domain zusammen und sind per SPF und DKIM gedeckt.
//
// Die Einsendung wird PARALLEL weiterhin von Netlify Forms erfasst (die Seite
// meldet sie dorthin selbst). Diese Funktion ist nur fuer die Mail zustaendig -
// faellt sie aus, steht die Anfrage trotzdem im Netlify-Dashboard.
//
// Erforderliche Netlify-Variable dieser Seite:
//   MAIL_TRIGGER_SECRET   derselbe Wert wie bei der Transfer-Seite
//   MAIL_SERVICE_URL      optional, falls der Dienst spaeter umzieht

const MAIL_SERVICE_URL_FALLBACK =
  "https://transfer.amd-germancenter.com/.netlify/functions/send-mail-background";

// Grosszuegig bemessen, aber nicht unbegrenzt: Die Funktion ist oeffentlich
// erreichbar, und ohne Grenze koennte jemand beliebig lange Texte durch den
// Mailversand schicken.
const LIMITS = { name: 200, email: 200, phone: 80, topic: 80, message: 5000 };

const CODE_TAB = 9;
const CODE_NEWLINE = 10;
const CODE_DELETE = 127;

/**
 * Entfernt Steuerzeichen und kuerzt auf die erlaubte Laenge.
 *
 * Einzeilige Felder verlieren dabei auch Zeilenumbrueche: Name, E-Mail und
 * Anliegen landen in Kopfzeilen der Mail (Betreff, Antwort-an), und ein
 * Umbruch dort waere eine Einladung, eigene Kopfzeilen einzuschmuggeln.
 * Nur die Nachricht behaelt ihre Absaetze - sie steht ausschliesslich im
 * Textkoerper.
 */
function clean(value, max, { multiline = false } = {}) {
  let out = "";

  for (const zeichen of String(value ?? "")) {
    const code = zeichen.codePointAt(0);
    const steuerzeichen = code < 32 || code === CODE_DELETE;

    if (!steuerzeichen) {
      out += zeichen;
    } else if (multiline && (code === CODE_NEWLINE || code === CODE_TAB)) {
      out += zeichen;
    } else if (!multiline) {
      out += " ";
    }
  }

  return out.trim().slice(0, max);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let incoming = {};
  try {
    incoming = JSON.parse(event.body || "{}") || {};
  } catch {
    return json(400, { ok: false, error: "Bad request" });
  }

  // Honigtopf: Das Feld ist im Formular versteckt. Fuellt es jemand aus, war
  // es ein Automat. Wir antworten trotzdem freundlich, damit der Absender
  // nicht lernt, woran er gescheitert ist.
  if (clean(incoming["bot-field"], 100)) {
    console.warn("contact: Honigtopf ausgefuellt - Nachricht verworfen");
    return json(200, { ok: true, mailed: false });
  }

  const name = clean(incoming.name, LIMITS.name);
  const email = clean(incoming.email, LIMITS.email);
  const phone = clean(incoming.phone, LIMITS.phone);
  const topic = clean(incoming.topic, LIMITS.topic);
  const message = clean(incoming.message, LIMITS.message, { multiline: true });
  const sourceUrl = clean(incoming.sourceUrl, 300);

  const locale = clean(incoming.locale, 5).toLowerCase().slice(0, 2) || "de";

  // Dieselben Pflichtfelder wie im Formular. Der Browser prueft sie schon,
  // aber diese Adresse ist auch ohne Browser erreichbar.
  if (!name || !email || !message) {
    return json(400, { ok: false, error: "Pflichtfelder fehlen" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "E-Mail-Adresse unbrauchbar" });
  }

  const secret = process.env.MAIL_TRIGGER_SECRET || "";
  if (!secret) {
    // Kein Grund, dem Absender einen Fehler zu zeigen: Netlify Forms hat die
    // Nachricht bereits erfasst, sie ist also nicht verloren.
    console.error("contact: MAIL_TRIGGER_SECRET fehlt in Netlify - keine Mail verschickt");
    return json(200, { ok: true, mailed: false });
  }

  const url = process.env.MAIL_SERVICE_URL || MAIL_SERVICE_URL_FALLBACK;

  // Zeitwaechter: Der Maildienst ist eine Hintergrundfunktion und antwortet
  // sofort mit 202. Antwortet er wider Erwarten gar nicht, soll der Absender
  // nicht im Ladebalken haengen - die Nachricht liegt ohnehin bei Netlify Forms.
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), 2500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        kind: "contact",
        locale,
        customer: { name, email, phone },
        topic,
        message,
        sourceUrl,
      }),
      signal: abbruch.signal,
    });

    if (res.ok || res.status === 202) {
      return json(200, { ok: true, mailed: true });
    }
    console.error(`contact: Maildienst abgelehnt (HTTP ${res.status})`);
  } catch (e) {
    console.error("contact: Maildienst nicht erreichbar:", String(e?.message || e));
  } finally {
    clearTimeout(wecker);
  }

  return json(200, { ok: true, mailed: false });
}
