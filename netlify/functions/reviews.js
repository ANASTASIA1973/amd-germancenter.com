// netlify/functions/reviews.js
//
// Vermittelt zwischen der Website und der AMD System API (Google Apps Script).
//
//   GET  /.netlify/functions/reviews   -> review.list   (freigegebene Bewertungen)
//   POST /.netlify/functions/reviews   -> review.create (neue Bewertung)
//
// Warum ueber eine Function und nicht direkt aus dem Browser:
//   1. WEBHOOK_SECRET darf nie im Browser landen
//   2. Apps Script antwortet in 2 bis 30 Sekunden. Die Liste wird deshalb
//      am Netlify-CDN zwischengespeichert, sonst wartet jeder Besucher
//      der Startseite darauf.
//   3. Apps Script liefert IMMER HTTP 200, auch bei Fehlern. Deshalb wird
//      hier ausschliesslich "success" im Antwortkoerper geprueft.

const CDN_CACHE_SECONDS = 600; // 10 Minuten am CDN
const BROWSER_CACHE_SECONDS = 60; // 1 Minute im Browser
const MAX_TEXT_LENGTH = 1200;
const MAX_FIELD_LENGTH = 80;

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8" },
      extraHeaders || {}
    ),
    body: JSON.stringify(body),
  };
}

// Apps Script verpackt Erfolge als { success, message, data, timestamp },
// Fehler kommen flach als { success:false, error }.
async function callGas(payload) {
  const GAS_EXEC_URL = process.env.GAS_EXEC_URL;
  if (!GAS_EXEC_URL) {
    return { ok: false, error: "missing_configuration" };
  }

  // Bewusst OHNE eigenes Zeitlimit: Apps Script braucht regelmaessig
  // ueber 20 Sekunden. Ein knappes Limit wuerde die Lage verschlimmern.
  let res;
  try {
    res = await fetch(GAS_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return {
      ok: false,
      error: "upstream_unreachable",
      detail: String(e && e.message),
    };
  }

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    return {
      ok: false,
      error: "upstream_invalid_json",
      detail: text.slice(0, 300),
    };
  }

  if (!data || data.success !== true) {
    return {
      ok: false,
      error: (data && data.error) || "upstream_error",
      detail: (data && data.message) || null,
    };
  }

  return { ok: true, data: data.data || {} };
}

// Entfernt Steuerzeichen, kuerzt und trimmt.
// Bewusst ueber Zeichencodes statt Zeichenklasse im regulaeren Ausdruck.
function clean(value, maxLength) {
  const source = String(value == null ? "" : value);
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) {
      out += " ";
    } else if (code > 31 && code !== 127) {
      out += source[i];
    }
  }
  return out.trim().slice(0, maxLength);
}

// ---------------------------------------------------------------
// GET - freigegebene Bewertungen
// ---------------------------------------------------------------
async function listReviews() {
  const result = await callGas({ action: "review.list", data: { limit: 50 } });

  if (!result.ok) {
    // Fehler nicht zwischenspeichern, sonst haengt die Seite 10 Minuten daran fest
    return json(
      200,
      { ok: false, error: result.error, reviews: [] },
      { "Cache-Control": "no-store" }
    );
  }

  const reviews = Array.isArray(result.data.reviews) ? result.data.reviews : [];

  return json(
    200,
    { ok: true, reviews },
    {
      // Browser kurz, CDN lange. stale-while-revalidate sorgt dafuer, dass
      // Besucher die alte Liste sofort sehen, waehrend im Hintergrund die
      // neue geholt wird - auch wenn Apps Script gerade langsam ist.
      "Cache-Control": `public, max-age=${BROWSER_CACHE_SECONDS}`,
      "Netlify-CDN-Cache-Control": `public, s-maxage=${CDN_CACHE_SECONDS}, stale-while-revalidate=3600`,
    }
  );
}

// ---------------------------------------------------------------
// POST - neue Bewertung
// ---------------------------------------------------------------
async function createReview(event) {
  let incoming = {};
  try {
    incoming = JSON.parse(event.body || "{}") || {};
  } catch (_) {
    return json(400, { ok: false, error: "invalid_body" });
  }

  // Honigtopf: echte Menschen fuellen dieses Feld nie aus.
  // Wir melden trotzdem Erfolg, damit der Bot nichts daraus lernt.
  if (clean(incoming.botField, 100)) {
    return json(200, { ok: true, spam: true });
  }

  const rating = Number(incoming.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json(400, { ok: false, error: "invalid_rating" });
  }

  const text = clean(incoming.text, MAX_TEXT_LENGTH);
  if (text.length < 20) {
    return json(400, { ok: false, error: "text_too_short" });
  }

  const name = clean(incoming.name, MAX_FIELD_LENGTH);
  if (!name) {
    return json(400, { ok: false, error: "missing_name" });
  }

  if (incoming.consent !== true && incoming.consent !== "true") {
    return json(400, { ok: false, error: "missing_consent" });
  }

  const rawLocale = String(incoming.locale || "").toLowerCase();
  const locale = ["de", "en", "ar"].includes(rawLocale) ? rawLocale : "de";

  const result = await callGas({
    action: "review.create",
    secret: process.env.WEBHOOK_SECRET, // heute optional, spaeter Pflicht
    data: {
      // Referenznummer ist eine undurchsichtige Zeichenkette:
      // SRV-, PAC-, TRA-, TUR- oder INV-Praefix sind alle moeglich.
      // Deshalb keine Musterpruefung, nur Laengenbegrenzung.
      refNr: clean(incoming.refNr, 40),
      rating,
      service: clean(incoming.service, MAX_FIELD_LENGTH),
      text,
      name,
      country: clean(incoming.country, MAX_FIELD_LENGTH),
      locale,
      consent: true,
      sourceUrl: clean(incoming.sourceUrl, 300),
    },
  });

  if (!result.ok) {
    // already_reviewed ist kein Serverfehler, sondern eine erwartete Antwort
    const status = result.error === "already_reviewed" ? 409 : 502;
    return json(status, { ok: false, error: result.error });
  }

  return json(200, { ok: true, id: result.data.id || null });
}

// ---------------------------------------------------------------
export async function handler(event) {
  try {
    if (event.httpMethod === "GET") return await listReviews();
    if (event.httpMethod === "POST") return await createReview(event);

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    return json(500, { ok: false, error: String((e && e.message) || e) });
  }
}
