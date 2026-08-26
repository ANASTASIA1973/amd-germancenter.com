// netlify/functions/leads.js
import { createHash } from "crypto";

/**
 * Glaettet Text fuer den Vergleich zweier Anfragen: mehrfache Leerzeichen
 * zu einem, Leerraum um Zeilenumbrueche weg, Raender getrimmt.
 * Aendert NICHT, was gespeichert wird.
 */
function normalizeForFingerprint_(text) {
  return String(text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function handler(event) {
  // CORS (so your browser can POST without hacks like no-cors)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  // Only POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const GAS_EXEC_URL = process.env.GAS_EXEC_URL; // https://script.google.com/macros/s/.../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // stored only in Netlify

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Missing server configuration",
          missing: {
            GAS_EXEC_URL: !GAS_EXEC_URL,
            WEBHOOK_SECRET: !WEBHOOK_SECRET,
          },
        }),
      };
    }

    // Parse incoming JSON body
    let incoming = {};
    try {
      incoming = JSON.parse(event.body || "{}") || {};
    } catch (_) {
      incoming = {};
    }

    // Normalize/sanitize
    const ALLOWED = new Set(["tours", "transfer", "packages", "services"]);

    const incomingServiceRaw = String(incoming.service || "").trim();
    const incomingPageRaw = String(incoming.page || "").trim();

    // category must be one of the allowed services for Apps Script
    let service = "services";
    if (ALLOWED.has(incomingServiceRaw)) service = incomingServiceRaw;
    else if (ALLOWED.has(incomingPageRaw)) service = incomingPageRaw;

    const page = incomingPageRaw || service;

    const locale =
      String(incoming.locale || incoming.lang || "")
        .trim()
        .toLowerCase() || "en";

    // IMPORTANT: keep lang = real lang, not forced to locale
    const lang =
      String(incoming.lang || incoming.language || locale || "")
        .trim()
        .toLowerCase() || locale;

    // if frontend sent a service detail like "Translations", keep it separately (optional)
    const serviceDetail =
      (!ALLOWED.has(incomingServiceRaw) && incomingServiceRaw) ? incomingServiceRaw : "";

    // partnerId sanitize + alt fallback (partner/pid)
    let partnerId = incoming.partnerId;
    if (partnerId != null) {
      partnerId = String(partnerId).trim().replace(/[^A-Za-z0-9_-]/g, "");
      if (!partnerId) partnerId = "";
    } else {
      partnerId = "";
    }

    const partnerAltRaw = incoming.partner ?? incoming.pid ?? "";
    let partnerAlt = String(partnerAltRaw || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
    if (!partnerId && partnerAlt) partnerId = partnerAlt;

    // Human readable request text (what customer typed)
    const fullText = String(
      incoming.fullText ||
        incoming.message ||
        incoming.requestText ||
        incoming.notes ||
        incoming.text ||
        ""
    ).trim();

    const sourceUrl = String(incoming.sourceUrl || incoming.pageUrl || incoming.url || "").trim();

    // ------------------------------------------------------------
    // Idempotency key: dedupe double-submit/retry within short window
    // ------------------------------------------------------------
    // Tagesfenster statt 30-Sekunden-Fenster.
    //
    // Vorher: Math.floor(Date.now() / 30000). Zwei identische Absendungen
    // galten damit nur dann als dieselbe Anfrage, wenn sie im GLEICHEN
    // 30-Sekunden-Block ankamen. Am 25.08.2026 hat ein Kunde beim
    // Behoerdenservice mehrfach abgeschickt; weil der Aufruf rund 45
    // Sekunden brauchte, fielen die Versuche in verschiedene Bloecke - und
    // jeder zaehlte als neue Anfrage (SRV-2026-00012 bis -00020).
    //
    // Ob zwei Anfragen dieselbe sind, soll am INHALT haengen, nicht an der
    // Uhr. Der Tag bleibt drin, damit derselbe Vorgang naechste Woche
    // wieder erlaubt ist.
    const bucket = new Date().toISOString().slice(0, 10);

    const idemCore = {
      bucket,
      service,
      name: String(incoming.name || "").trim(),
      email: String(incoming.email || "").trim().toLowerCase(),
      phone: String(incoming.phone || "").trim(),
      partnerId: String(partnerId || "").trim(),
      sourceUrl,
      // Nur fuer den Fingerabdruck geglaettet - GESPEICHERT wird weiter der
      // Originaltext. Ein Kunde, der beim zweiten Anlauf eine Leerzeile mehr
      // stehen laesst, stellt damit keine neue Anfrage.
      fullText: normalizeForFingerprint_(fullText),
      // optional: structured fields that strongly identify the request
      people: incoming.people ?? incoming.persons ?? "",
      date: incoming.date ?? incoming.travelDate ?? "",
    };

    const idemKey =
      "nf_" +
      createHash("sha256")
        .update(JSON.stringify(idemCore))
        .digest("hex")
        .slice(0, 32);

    // Build lead data for Apps Script (Router expects action + data)
    const leadData = {
      ...incoming,

      service, // keep for createLead()
      page, // keep for your own reference
      locale,
      lang,

      // optional detail (harmless, in case you want it later)
      ...(serviceDetail ? { serviceDetail } : {}),

      // Partner (Agent / Hotel QR)
      ...(partnerId ? { partnerId } : {}),

      // Ensure fullText exists (human readable)
      fullText,

      // Keep everything also structured for later offer building
      structuredJson: incoming,

      // Trace
      sourceUrl,

      // Idempotency for GAS
      idemKey,
    };

    // IMPORTANT: Apps Script Router (90_api_router.gs) requires payload.action
    const requestData = {
      action: "lead.create",
      secret: WEBHOOK_SECRET,
      data: leadData,
    };

    // ------------------------------------------------------------------
    // Ein Wiederholversuch, wenn die Antwort nicht brauchbar ist.
    //
    // Gemessen am 26.08.2026: Bei gleichzeitigen Anfragen liefert die
    // Apps-Script-Adresse manchen Aufrufen eine HTML-Seite statt der
    // JSON-Antwort - oder ihre eigene Meldung "GET requests not supported",
    // weil Googles Umleitung aus dem POST ein GET gemacht hat. Die Zeile im
    // Sheet entsteht dabei trotzdem; nur der Kunde bekommt seine
    // Referenznummer nicht und sieht einen Fehler.
    //
    // Der Wiederholversuch ist gefahrlos, weil oben ein idemKey gebaut wird:
    // Steht die Anfrage schon drin, gibt das Apps Script dieselbe Nummer
    // zurueck statt eine zweite Zeile anzulegen.
    //
    // Zeitwaechter: Netlify trennt nach etwa 26 Sekunden. Hat der erste
    // Versuch schon lange gedauert, wird nicht wiederholt.
    // ------------------------------------------------------------------
    const begonnen = Date.now();
    const verbraucht = () => Date.now() - begonnen;

    let antwort = await frageAppsScript_(GAS_EXEC_URL, requestData);

    // Schritt 2: NACHSEHEN, nicht raten.
    // Kam nichts Lesbares zurueck, heisst das nicht, dass nichts passiert
    // ist - die Zeile entsteht in diesen Faellen fast immer trotzdem. Also
    // fragen wir gezielt nach dem idemKey. Reine Lesefrage, ohne
    // Schreibsperre, entsprechend schnell.
    if (unbrauchbar_(antwort) && verbraucht() < 12000) {
      console.warn(`Antwort unbrauchbar nach ${verbraucht()} ms - nachsehen, ob die Anfrage angekommen ist`);

      const nachschau = await frageAppsScript_(GAS_EXEC_URL, {
        action: "lead.getByIdemKey",
        secret: WEBHOOK_SECRET,
        data: { idemKey },
      });

      const gefunden =
        nachschau.data && nachschau.data.data ? nachschau.data.data : null;

      if (gefunden && gefunden.refNr) {
        console.warn(`Anfrage war bereits gespeichert: ${gefunden.refNr}`);
        antwort = {
          ok: true,
          status: 200,
          data: { success: true, data: gefunden },
          text: nachschau.text,
        };
      }
    }

    // Schritt 3: wirklich nicht angekommen -> ein echter zweiter Versuch.
    // Gefahrlos dank idemKey: waere sie doch schon drin, gaebe das Apps
    // Script dieselbe Nummer zurueck statt eine zweite Zeile anzulegen.
    if (unbrauchbar_(antwort) && verbraucht() < 15000) {
      console.warn(`Nicht gefunden nach ${verbraucht()} ms - ein Wiederholversuch`);
      antwort = await frageAppsScript_(GAS_EXEC_URL, requestData);
    }

    const text = antwort.text;
    const data = unbrauchbar_(antwort) ? null : antwort.data;

    if (!antwort.ok || !data) {
      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Upstream error",
          status: antwort.status,
          upstream: data || text || null,
        }),
      };
    }

    // Flatten refNr / leadId for frontend reliability
    // Router returns: successResponse(result) => { success, message, data: result, timestamp }
    const refNr =
      data?.refNr ||
      data?.data?.refNr ||
      data?.data?.data?.refNr ||
      null;

    const leadId =
      data?.leadId ||
      data?.data?.leadId ||
      data?.data?.data?.leadId ||
      null;

    // Bestaetigung an den Kunden + Meldung ans Buero anstossen.
    // Kein Fehler in diesem Schritt darf die Anfrage kippen: sie steht zu
    // diesem Zeitpunkt bereits im Sheet und hat ihre Referenznummer.
    const mailQueued = await triggerLeadMails({
      refNr,
      service,
      locale,
      customer: {
        name: String(incoming.name || "").trim(),
        email: String(incoming.email || "").trim(),
        phone: String(incoming.phone || "").trim(),
      },
      summary: fullText,
      summaryCustomer: summaryForCustomer_(fullText),
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        refNr,
        leadId,
        idemKey,
        // Sagt der Seite, ob sie eine Bestaetigungsmail versprechen darf.
        // Fehlt das Geheimnis in Netlify oder antwortet der Maildienst nicht,
        // steht hier false - dann zeigt die Seite den neutralen Satz.
        mailQueued,
        upstream: data || text || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(e?.message || e || "Unknown error"),
      }),
    };
  }
}

// ============================================================================
// Mailversand
// ============================================================================
//
// Verschickt wird NICHT hier, sondern ueber den gemeinsamen Dienst auf der
// Transfer-Seite. Diese Seite ist statisch und hat keine package.json; ein
// eigenes nodemailer haette ihr einen npm-Lauf bei jedem Deploy verpasst und
// die Mailtexte ein zweites Mal in die Welt gesetzt. Eine Aenderung an den
// Texten soll an EINER Stelle wirken.
//
// Erforderliche Netlify-Variable dieser Seite:
//   MAIL_TRIGGER_SECRET   derselbe Wert wie bei der Transfer-Seite
//   MAIL_SERVICE_URL      optional, falls der Dienst spaeter umzieht
//
// Fehlt das Geheimnis, geht KEINE Mail raus. Die Anfrage steht dann trotzdem
// im Sheet und der Kunde sieht seine Referenznummer auf dem Bildschirm.

const MAIL_SERVICE_URL_FALLBACK =
  "https://transfer.amd-germancenter.com/.netlify/functions/send-mail-background";

/**
 * Einmal beim Apps Script anfragen. Gibt die geparste Antwort zurueck -
 * oder data: null, wenn zurueckkam, was sich nicht als JSON lesen laesst.
 */
async function frageAppsScript_(url, requestData) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });
    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } catch (e) {
    return { ok: false, status: 0, data: null, text: String(e?.message || e) };
  }
}

/**
 * Ist mit dieser Antwort nichts anzufangen?
 *
 * Zwei Faelle: gar keine lesbare JSON (Google hat eine HTML-Seite
 * geschickt), oder lesbare JSON mit der Router-Meldung "GET requests not
 * supported" - dann hat Googles Umleitung aus dem POST ein GET gemacht.
 */
function unbrauchbar_(antwort) {
  if (!antwort || !antwort.data) return true;
  const fehler = String(antwort.data.error || "");
  return /GET requests not supported/i.test(fehler);
}

/**
 * Putzt die Zusammenfassung fuer die Mail an den KUNDEN.
 *
 * Die sechs Formularseiten bauen diesen Text noch so, wie er frueher in das
 * Mailfenster des Kunden geschrieben wurde: mit einem Rahmen aus
 * Gleichheitszeichen, einer internen Partner-ID und einer Fusszeile
 * "Gesendet ueber amd-germancenter.com". Auf den Pauschalreise-Seiten steht
 * ausserdem "Referenz: (pending)" - das widerspricht dem Kasten mit der
 * echten Nummer direkt darueber.
 *
 * Was ins Sheet geschrieben wird, was das Buero per Mail bekommt und was der
 * WhatsApp-Knopf verschickt, bleibt unveraendert. Geputzt wird nur die Kopie
 * fuer die Kundenmail.
 */
function summaryForCustomer_(text) {
  const behalten = [];

  for (const roh of String(text || "").split("\n")) {
    const zeile = roh.replace(/\s+$/, "");
    const geprueft = zeile.trim();

    // interne Partner-Kennung (de / en / ar)
    if (/^(partner-?\s?id|رقم الشريك)\s*:/i.test(geprueft)) continue;

    // Platzhalter-Referenz - die echte Nummer steht im Kasten darueber
    if (/^(referenz|reference|المرجع)\s*:\s*\(?pending\)?$/i.test(geprueft)) continue;

    // Fusszeile aus der mailto-Zeit
    if (/^(gesendet über|gesendet ueber|sent via|أُرسل عبر)\b/i.test(geprueft)) continue;

    // der Trennstrich, der nur zu dieser Fusszeile gehoerte
    if (/^-{3,}$/.test(geprueft)) continue;

    // Rahmen aus Gleichheitszeichen: Inhalt behalten, Zierrat weg
    const rahmen = geprueft.match(/^=+\s*(.+?)\s*=+$/);
    if (rahmen) {
      behalten.push(rahmen[1]);
      continue;
    }

    behalten.push(zeile);
  }

  return behalten.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Stoesst den Versand an. Gibt true zurueck, wenn der Dienst den Auftrag
 * angenommen hat - nur dann darf die Seite eine Mail versprechen.
 */
async function triggerLeadMails({ refNr, service, locale, customer, summary, summaryCustomer }) {
  if (!refNr) {
    console.error("Mailversand uebersprungen: keine Referenznummer vom Apps Script");
    return false;
  }

  const secret = process.env.MAIL_TRIGGER_SECRET || "";
  if (!secret) {
    console.error("Mailversand uebersprungen: MAIL_TRIGGER_SECRET fehlt in Netlify");
    return false;
  }

  const url = process.env.MAIL_SERVICE_URL || MAIL_SERVICE_URL_FALLBACK;

  // Zeitlimit: Ohne Abbruch wartet diese Funktion so lange auf den Maildienst,
  // bis Netlify SIE abbricht. Der Kunde bekaeme dann einen Fehler zu sehen,
  // obwohl seine Anfrage laengst im Sheet steht - und schickt sie nochmal.
  // Genau die Kette, die zu den Doppelanfragen vom 25.08. gefuehrt hat.
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), 1500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, refNr, service, locale, customer, summary, summaryCustomer }),
      signal: abbruch.signal,
    });
    // 202 = angenommen, wird im Hintergrund verschickt.
    if (res.ok || res.status === 202) return true;
    console.error(`Mailversand abgelehnt (HTTP ${res.status}) fuer ${refNr}`);
  } catch (e) {
    console.error(`Mailversand nicht erreichbar fuer ${refNr}:`, String(e?.message || e));
  } finally {
    clearTimeout(wecker);
  }

  return false;
}
