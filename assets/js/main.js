/* ================================
   AMD Leads – Packages + Services (MAIN)
   - Partner + Token Session (URL → sessionStorage/localStorage)
   - Link-Patching nur für erlaubte Hosts
   - OPTIONAL Lead-Hooks (nur wenn Seite nicht selbst Leads sendet)
   - RefNr muss IM ausgehenden WhatsApp/Mail-Text enthalten sein
   ================================ */

const AMD_LEADS_URL = "/.netlify/functions/leads";

/* ================================
   Partner/Token: Session-Logik
   ================================ */

const PARTNER_KEY = "amd_partner";
const TOKEN_KEY = "amd_token";
const TOKEN_TS_KEY = "amd_token_ts";
const QR_ACTIVE_KEY = "amd_qr_active";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde

/**
 * Nur diese externen Domains bekommen automatisch partner+token:
 * - Transfer
 * - Tours
 * (alte Netlify Hosts als Fallback)
 */
const PASS_HOSTS = new Set([
  "transfer.amd-germancenter.com",
  "tours.amd-germancenter.com",
  "amdtransfer.netlify.app",
  "amdtourbooking.netlify.app",
]);

/**
 * Hauptseite (inkl. Preview Hosts)
 */
const MAIN_HOSTS = new Set([
  "neuewebsite.netlify.app",
  "www.amd-germancenter.com",
  "amd-germancenter.com",
]);

function getUrlParam_(key) {
  try {
    const sp = new URLSearchParams(window.location.search);
    return (sp.get(key) || "").trim();
  } catch (_) {
    return "";
  }
}

function _readWithTtl_(key) {
  const ts = Number(localStorage.getItem(TOKEN_TS_KEY) || "0");
  if (!ts || Date.now() - ts > TOKEN_TTL_MS) return "";
  return (localStorage.getItem(key) || "").trim();
}

function getSession_(key) {
  const s = (sessionStorage.getItem(key) || "").trim();
  if (s) return s;
  return _readWithTtl_(key);
}

function setSession_(key, val) {
  const v = String(val || "").trim();
  if (!v) return;

  sessionStorage.setItem(key, v);
  localStorage.setItem(key, v);

  if (key === TOKEN_KEY) {
    localStorage.setItem(TOKEN_TS_KEY, String(Date.now()));
  }
}

function clearPartnerSession_() {
  sessionStorage.removeItem(PARTNER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(QR_ACTIVE_KEY);

  localStorage.removeItem(PARTNER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_TS_KEY);
}

/**
 * Zentrale Wahrheit:
 * - wenn URL partner/token hat → Session refresh + QR_ACTIVE=1
 * - wenn URL KEIN partner hat → QR_ACTIVE aus + (optional) Session clean, damit nichts "leakt"
 * - sonst Session lesen (mit localStorage TTL fallback)
 */
function getPartnerToken_() {
  const urlPartner = getUrlParam_("partner");
  const urlToken = getUrlParam_("token");

  if (urlPartner) setSession_(PARTNER_KEY, urlPartner);
  if (urlToken) setSession_(TOKEN_KEY, urlToken);

  // QR Active: nur wenn URL partner gesetzt hat (Hotel/Partner Attribution Start)
  if (urlPartner) sessionStorage.setItem(QR_ACTIVE_KEY, "1");

  // Wenn KEIN partner in URL: wir behandeln das als "privater Einstieg" → Partner/Token löschen
  // (damit kein alter QR-Token später still mitgeht)
  if (!urlPartner) {
    clearPartnerSession_();
    return { partner: "", token: "" };
  }

  const partner = (urlPartner || getSession_(PARTNER_KEY) || "").trim();
  const token = (urlToken || getSession_(TOKEN_KEY) || "").trim();

  // Falls wir partner haben aber Token fehlt: trotzdem partner merken; token kann via r.js nachkommen
  return { partner, token };
}

function shouldPatchUrl_(u) {
  const qrActive = sessionStorage.getItem(QR_ACTIVE_KEY) === "1";
  if (!qrActive) return false;

  if (u.origin === window.location.origin) return true;
  if (PASS_HOSTS.has(u.hostname)) return true;
  if (MAIN_HOSTS.has(u.hostname)) return true;

  return false;
}

/**
 * Hängt partner/token an, ohne Query/Hash zu zerstören.
 * Überschreibt NICHT, wenn schon vorhanden.
 */
function addParamsToUrl_(urlString, partner, token) {
  try {
    const u = new URL(urlString, window.location.href);
    if (!shouldPatchUrl_(u)) return urlString;

    if (partner && !u.searchParams.get("partner")) u.searchParams.set("partner", partner);
    if (token && !u.searchParams.get("token")) u.searchParams.set("token", token);

    return u.toString();
  } catch (_) {
    return urlString;
  }
}

function patchAllLinks_(partner, token) {
  if (!partner && !token) return;

  const anchors = Array.from(document.querySelectorAll("a[href]"));
  anchors.forEach((a) => {
    const href = (a.getAttribute("href") || "").trim();
    if (!href) return;

    const lower = href.toLowerCase();
    if (
      lower.startsWith("#") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("javascript:")
    ) {
      return;
    }

    const hasPartner = href.includes("partner=");
    const hasToken = href.includes("token=");

    if ((partner ? hasPartner : true) && (token ? hasToken : true)) return;

    const patched = addParamsToUrl_(href, partner, token);
    if (patched && patched !== href) a.setAttribute("href", patched);
  });
}

function watchAndPatchLinks_(partner, token) {
  if (!partner && !token) return;

  const obs = new MutationObserver(() => patchAllLinks_(partner, token));
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

function goWithPartner_(url) {
  const { partner, token } = getPartnerToken_();
  const finalUrl = addParamsToUrl_(url, partner, token);
  window.location.href = finalUrl;
}

/**
 * QR Token sicherstellen:
 * - Wenn partner in URL aber kein token: redirect über /.netlify/functions/r?pid=PARTNER
 */
async function ensureQrTokenForHotel_(onReady) {
  const partnerFromUrl = getUrlParam_("partner");
  const tokenFromUrl = getUrlParam_("token");

  if (!partnerFromUrl) {
    clearPartnerSession_();
    if (typeof onReady === "function") onReady({ partner: "", token: "" });
    return;
  }

  // QR Active session mark
  sessionStorage.setItem(QR_ACTIVE_KEY, "1");
  setSession_(PARTNER_KEY, partnerFromUrl);

  // Wenn token vorhanden: fertig
  if (tokenFromUrl) {
    setSession_(TOKEN_KEY, tokenFromUrl);
    if (typeof onReady === "function") onReady(getPartnerToken_());
    return;
  }

  // Wenn kein token: über r.js holen (server-side)
  try {
    const pid = encodeURIComponent(partnerFromUrl);
    const dest = `/.netlify/functions/r?pid=${pid}&next=${encodeURIComponent(window.location.href)}`;
    window.location.href = dest;
  } catch (_) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
  }
}

/* ================================
   Leads (optional)
   ================================ */

async function postLead(payload) {
  try {
    const res = await fetch(AMD_LEADS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    const json = await res.json().catch(() => null);

    // Netlify leads.js wraps Apps Script response in { ok:true, upstream: ... }
    const up = json?.upstream;
    const ref =
      up?.data?.refNr ||
      up?.refNr ||
      up?.data?.data?.refNr ||
      up?.data?.data?.data?.refNr ||
      "";

    return String(ref || "").trim();
  } catch (_) {
    return "";
  }
}

function getLang() {
  return (document.documentElement.lang || "de").toLowerCase();
}

function determineServiceFromPath_() {
  const p = (location.pathname || "").toLowerCase();
  if (p.includes("package")) return "packages";
  return "services";
}

function formToObject_(form) {
  try {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = String(v ?? "");
    return obj;
  } catch (_) {
    return {};
  }
}

function _stableIdemKey_(service, locale, email, phone, obj) {
  const safe = (x) => String(x || "-").trim();
  return [
    service,
    locale,
    safe(email).toLowerCase(),
    safe(phone),
    safe(obj.people || obj.personen || obj.adults),
    safe(obj.dates || obj.date || obj.travelPeriod),
    safe(obj.departure || obj.abflughafen || obj.departureAirport),
  ].join("|");
}

/**
 * Partner/Token dürfen nur mit, wenn:
 * - QR_ACTIVE=1 UND partner in URL vorhanden (Hotel/Partner Funnel)
 * - oder manueller PartnerId im Feld (Agent)
 */
function getFinalPartnerToken_() {
  const qrActive = sessionStorage.getItem(QR_ACTIVE_KEY) === "1";
  const urlPartner = getUrlParam_("partner");
  const urlToken = getUrlParam_("token");

  const manualPartnerId = (document.getElementById("partnerId")?.value || "").trim();

  // Hotel QR: partner + token aus URL (oder nach r.js), aber nur wenn QR_ACTIVE
  if (qrActive && urlPartner) {
    const token = String(urlToken || getSession_(TOKEN_KEY) || "").trim();
    if (token) {
      return { finalPartnerId: urlPartner.trim(), finalToken: token };
    }
    // partner ja, token noch nicht: sende trotzdem partnerId, token leer
    return { finalPartnerId: urlPartner.trim(), finalToken: "" };
  }

  // Agent: manuelle PartnerId ohne token
  if (manualPartnerId) {
    return { finalPartnerId: manualPartnerId, finalToken: "" };
  }

  return { finalPartnerId: "", finalToken: "" };
}

function buildLeadPayloadFromForm_(form, contactPreference) {
  const obj = formToObject_(form);

  const name = String(
    obj.name || obj.fullName || obj.firstname || obj.firstName || obj.vorname || ""
  ).trim() || "—";

  const email = String(obj.email || obj.mail || "").trim();
  const phone = String(obj.phone || obj.tel || obj.mobile || obj.telefon || "").trim();

  const message = String(
    obj.message || obj.nachricht || obj.notes || obj.wuensche || obj.wünsche || ""
  ).trim();

  // fullText wird später mit RefNr finalisiert
  const fullText = message || _kvText_(obj);

  const { finalPartnerId, finalToken } = getFinalPartnerToken_();
  const service = determineServiceFromPath_();
  const locale = getLang();

  return {
    service,
    locale,
    lang: locale,

    name,
    email,
    phone,

    message: fullText,
    fullText: fullText,

    structuredJson: obj,

    partnerId: finalPartnerId,
    token: finalToken,

    contactPreference: contactPreference || "form",
    pageUrl: location.href,
    sourceUrl: location.href,
    source: location.hostname,

    idemKey: _stableIdemKey_(service, locale, email, phone, obj),
  };
}

function _kvText_(obj) {
  const lines = [];
  try {
    Object.keys(obj || {}).forEach((k) => {
      const v = String(obj[k] ?? "").trim();
      if (!v) return;
      lines.push(`${k}: ${v}`);
    });
  } catch (_) {}
  return lines.join("\n");
}

function _injectRef_(text, ref) {
  const t = String(text || "");
  const r = String(ref || "").trim();
  if (!r) return t;

  // 1) replace common placeholders
  const replaced = t
    .replace(/\(pending\)/gi, r)
    .replace(/\bpending\b/gi, r)
    .replace(/قيد الانتظار/g, r);

  if (replaced !== t) return replaced;

  // 2) if no placeholder, prepend a ref line depending on language
  const lang = getLang();
  if (lang === "ar") return `مرجع: ${r}\n` + t;
  if (lang === "de") return `Referenz: ${r}\n` + t;
  return `Reference: ${r}\n` + t;
}

function _setTextareaText_(text) {
  const ta = document.querySelector("textarea");
  if (ta) ta.value = String(text || "");
}

/**
 * Manche Seiten (z.B. package-tours.html) senden Leads bereits selbst.
 * Wenn eine solche Funktion existiert, dürfen wir hier NICHT nochmal senden.
 */
function pageManagesLeads_() {
  return typeof window.postLeadToSheet === "function" || typeof window.postLeadToSheets === "function";
}

/* ================================
   UI: Partner-Feld + Brand
   ================================ */

function updatePartnerFieldVisibility_() {
  const partnerRow = document.querySelector(".partner-row");
  const partnerInput = document.getElementById("partnerId");
  if (!partnerRow) return;

  const qrActive = sessionStorage.getItem(QR_ACTIVE_KEY) === "1";
  const hasPartnerInUrl = !!getUrlParam_("partner");
  const hasToken = !!String(getSession_(TOKEN_KEY) || "").trim();

  // Verstecke Partner-Feld nur im echten QR-Funnel (partner in URL)
  const hide = qrActive && hasPartnerInUrl && hasToken;

  partnerRow.style.display = hide ? "none" : "";
  if (hide && partnerInput) partnerInput.value = "";
}

function initPartnerBrand_(partner, token) {
  const brandWrap = document.getElementById("partnerBrand");
  const brandImg = document.getElementById("partnerBrandImg");
  if (!brandWrap || !brandImg) return;

  brandWrap.hidden = true;
  if (!partner || !token) return;

  const safeId = encodeURIComponent(String(partner).trim());
  const candidates = [
    `../assets/img/partners/${safeId}.png`,
    `../assets/img/partners/${safeId}.jpg`,
    `./assets/img/partners/${safeId}.png`,
    `./assets/img/partners/${safeId}.jpg`,
  ];

  const resetImg = () => {
    brandWrap.hidden = true;
    brandImg.removeAttribute("src");
  };

  const tryLoad = (i) => {
    if (i >= candidates.length) return resetImg();

    brandImg.onload = () => { brandWrap.hidden = false; };
    brandImg.onerror = () => { tryLoad(i + 1); };
    brandImg.src = candidates[i];
  };

  tryLoad(0);
}

/* ================================
   Lead Hooks: WhatsApp + Mail (nur wenn Seite nicht selbst sendet)
   ================================ */

function hookWhatsAppClicks_() {
  document.addEventListener(
    "click",
    async (e) => {
      const a = e.target?.closest?.('a[href*="wa.me"], a[href*="whatsapp"]');
      const btn = e.target?.closest?.("button");
      const txt = String((a || btn)?.innerText || "").toLowerCase();

      const isWa = !!a || txt.includes("whatsapp") || txt.includes("واتساب");
      if (!isWa) return;

      // Wenn Seite selbst sendet: NICHT eingreifen
      if (pageManagesLeads_()) return;

      try {
        // Nur eingreifen, wenn der angeklickte Link im Formular sitzt und
        // damit dessen Absende-Knopf IST. Bis 26.08.2026 stand hier ein
        // Rueckfall auf "irgendein Formular der Seite": Ein Klick auf die
        // WhatsApp-Nummer im Kontaktblock schickte dadurch den Inhalt des
        // Kontaktformulars als Anfrage ab - meist leer, mit "—" als Namen.
        // Wer nur die Nummer anklickt, will schreiben, nicht anfragen.
        const form = (a || btn)?.closest("form");
        if (!form) return;

        e.preventDefault();

        const payload = buildLeadPayloadFromForm_(form, "whatsapp");
        const ref = await postLead(payload);

// Text finalisieren (NICHT ins Textarea schreiben!)
const finalText = _injectRef_(payload.fullText || payload.message || "", ref);

// Wenn es ein Link ist: immer text= setzen (auch wenn vorher keiner existierte)
if (a) {
  const href = a.getAttribute("href") || "";
  const u = new URL(href, window.location.href);

  // wa.me / whatsapp links: text param erzwingen
  if (!u.searchParams.has("text")) u.searchParams.set("text", "");
  u.searchParams.set("text", finalText);

  window.location.href = u.toString();
  return;
}

// Button ohne Link: hier NICHTS am Textfeld verändern (sonst erzeugst du “zweite Zeile”)
// Optional: du kannst später per HTML sagen, wie WhatsApp geöffnet wird.


        // Button ohne Link: keine sichere Navigation möglich → nur Text im UI aktualisiert
      } catch (_) {}
    },
    true
  );
}

function hookEmailClicks_() {
  document.addEventListener(
    "click",
    async (e) => {
      const a = e.target?.closest?.('a[href^="mailto:"]');
      const btn = e.target?.closest?.("button");
      const txt = String((a || btn)?.innerText || "").toLowerCase();

      const isMail = !!a || txt.includes("email") || txt.includes("mail") || txt.includes("e-mail");
      if (!isMail) return;

      // Wenn Seite selbst sendet: NICHT eingreifen
      if (pageManagesLeads_()) return;

      try {
        // Nur eingreifen, wenn der angeklickte Link im Formular sitzt und
        // damit dessen Absende-Knopf IST. Bis 26.08.2026 stand hier ein
        // Rueckfall auf "irgendein Formular der Seite": Ein Klick auf die
        // sichtbare Adresse info@amd-germancenter.com im Kontaktblock
        // schickte dadurch den Inhalt des Kontaktformulars als Anfrage ab -
        // meist leer, mit "—" als Namen und gezaehlt als Behoerdenservice.
        // Seit der Mailversand laeuft, ging daraus zusaetzlich eine Meldung
        // ans Buero raus. Wer die Adresse anklickt, will selbst schreiben.
        const form = (a || btn)?.closest("form");
        if (!form) return;

        e.preventDefault();

        const payload = buildLeadPayloadFromForm_(form, "email");
        const ref = await postLead(payload);

        const finalText = _injectRef_(payload.fullText || payload.message || "", ref);
        _setTextareaText_(finalText);

        if (a) {
          const href = a.getAttribute("href") || "";
          const u = new URL(href, window.location.href);

          // Body ersetzen, wenn vorhanden
          if (u.searchParams.has("body")) {
            u.searchParams.set("body", finalText);
          }
          // Subject ergänzen, wenn gewünscht (optional)
          if (!u.searchParams.has("subject") && ref) {
            const lang = getLang();
            const subj = (lang === "ar") ? `طلب جديد – ${ref}` : (lang === "de") ? `Neue Anfrage – ${ref}` : `New request – ${ref}`;
            u.searchParams.set("subject", subj);
          }

          window.location.href = u.toString();
          return;
        }
      } catch (_) {}
    },
    true
  );
}

/* ================================
   DOM Ready
   ================================ */

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  ensureQrTokenForHotel_(({ partner: p2, token: t2 } = {}) => {
    const final = getPartnerToken_();
    const partner = (p2 || final.partner || "").trim();
    const token = (t2 || final.token || "").trim();

    if (partner || token) {
      patchAllLinks_(partner, token);
      watchAndPatchLinks_(partner, token);
    }

    updatePartnerFieldVisibility_();
    initPartnerBrand_(partner, token);
  });

  // Buttons ohne <a href>: data-go
  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-go]");
    if (!el) return;

    const url = String(el.getAttribute("data-go") || "").trim();
    if (!url) return;

    e.preventDefault();
    goWithPartner_(url);
  });

  // Lead Hooks (nur falls Seite nicht selbst sendet)
  hookWhatsAppClicks_();
  hookEmailClicks_();
});

/* ============================================================================
   DOPPELKLICK-SPERRE FUER DIE ANFRAGE-KNOEPFE
   ============================================================================

   Am 25.08.2026 hat ein Kunde beim Behoerdenservice zehnmal abgeschickt und
   dabei zwischen "Angebot anfragen" und "Per WhatsApp senden" gewechselt. Es
   entstanden zehn Anfragen; vier davon trugen sogar dieselbe Referenznummer
   (SRV-2026-00020), weil sie gleichzeitig durch die Duplikatspruefung liefen.

   Die Ursache war nicht Ungeduld: Der Aufruf dauerte an dem Tag rund 45
   Sekunden, und in dieser ganzen Zeit sah der Knopf unveraendert aus. Wer
   keine Rueckmeldung bekommt, klickt noch einmal - das ist normales Verhalten.

   Warum die Sperre hier steht und nicht in den sechs Formularseiten:
   services.html und package-tours.html haben ihre Absende-Logik jeweils
   inline, in unterschiedlicher Einrueckung und mit unterschiedlichem Aufbau.
   Sechs Seiten umzubauen waere sechsmal Gelegenheit, eine Klammer zu
   verlieren. Alle sechs laden dafuer diese Datei.

   Technik: Der Wachposten haengt am document und arbeitet in der
   Erfassungsphase (capture). Dadurch laeuft er VOR den Knopf-eigenen
   Handlern der Seite - unabhaengig davon, welches Skript zuerst geladen
   wurde. Beim zweiten Klick wird das Ereignis gestoppt, bevor die Seite es
   ueberhaupt sieht.
   ========================================================================= */
(function () {
  var BUTTON_IDS = "#btnInquiryEmail, #btnInquiryWhatsApp";
  var LEAD_ENDPOINT = "/.netlify/functions/leads";
  var LABELS = { de: "Wird gesendet …", en: "Sending …", ar: "جارٍ الإرسال …" };

  // Notbremse: falls die Anfrage nie zurueckkommt, darf der Knopf nicht
  // fuer immer gesperrt bleiben.
  var MAX_LOCK_MS = 90000;

  var busy = false;
  var savedHtml = null;
  var lockedButtons = [];
  var timer = null;

  function buttons() {
    return Array.prototype.slice.call(document.querySelectorAll(BUTTON_IDS));
  }

  function release() {
    if (!busy) return;
    busy = false;
    if (timer) { clearTimeout(timer); timer = null; }
    lockedButtons.forEach(function (b, i) {
      b.disabled = false;
      b.removeAttribute("aria-busy");
      if (savedHtml && savedHtml[i] != null) b.innerHTML = savedHtml[i];
    });
    lockedButtons = [];
    savedHtml = null;
  }

  // Von aussen freigeben koennen: de/package-tours.html steigt bei fehlender
  // Kontaktangabe mit einer Meldung aus, ohne etwas zu senden. Dort kommt nie
  // eine Antwort, an der die Sperre sich loesen koennte - der Knopf bliebe
  // 90 Sekunden auf "Wird gesendet ...".
  window.AMD_leadButtonsRelease = release;

  function lock(clicked) {
    busy = true;
    lockedButtons = buttons();
    // innerHTML sichern: der WhatsApp-Knopf traegt ein Icon, das sonst beim
    // Zuruecksetzen verloren ginge.
    savedHtml = lockedButtons.map(function (b) { return b.innerHTML; });

    var lang = String(document.documentElement.lang || "de").slice(0, 2).toLowerCase();
    var label = LABELS[lang] || LABELS.de;

    // Erst im naechsten Durchlauf sperren: wuerde der Knopf noch waehrend
    // der Ereignisverarbeitung auf disabled gesetzt, koennte der eigene
    // Handler der Seite gar nicht mehr anspringen.
    setTimeout(function () {
      // Wurde in der Zwischenzeit schon wieder freigegeben (die Seite ist
      // ausgestiegen, ohne etwas zu senden), dann hier nichts mehr anfassen -
      // sonst traegt der Knopf "Wird gesendet ..." und ist dabei klickbar.
      if (!busy) return;

      lockedButtons.forEach(function (b) {
        b.disabled = true;
        b.setAttribute("aria-busy", "true");
      });
      if (clicked) clicked.textContent = label;
    }, 0);

    timer = setTimeout(release, MAX_LOCK_MS);
  }

  document.addEventListener("click", function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest(BUTTON_IDS) : null;
    if (!target) return;

    if (busy) {
      // Zweiter Klick prallt ab, bevor die Seite ihn sieht.
      ev.stopImmediatePropagation();
      ev.preventDefault();
      return;
    }

    // Ist das Formular unvollstaendig, sendet die Seite gar nicht erst -
    // dann darf auch nicht gesperrt werden, sonst haengt der Knopf grundlos.
    var form = target.closest("form") || document.querySelector("form");
    if (form && typeof form.checkValidity === "function" && !form.checkValidity()) return;

    lock(target);
  }, true);

  // Freigeben, sobald die Lead-Anfrage tatsaechlich beantwortet ist. Das ist
  // genauer als jede feste Wartezeit: die Sperre dauert exakt so lange wie
  // der Vorgang, den sie schuetzt.
  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = "";
      try { url = String((input && input.url) || input || ""); } catch (e) {}
      var result = originalFetch.apply(this, arguments);
      if (url.indexOf(LEAD_ENDPOINT) !== -1 && result && typeof result.then === "function") {
        result.then(release, release);
      }
      return result;
    };
  }
})();

/* =========================================================================
   Bestaetigung nach dem Absenden (alle sechs Formularseiten)
   -------------------------------------------------------------------------
   Bis zum 26.08.2026 bestand die Rueckmeldung an den Kunden darin, dass sich
   sein Mailprogramm oeffnete - und 250 ms spaeter zusaetzlich ein
   Gmail-Fenster. Der Versand laeuft jetzt serverseitig ueber das
   IONOS-Postfach (netlify/functions/leads.js -> Maildienst der
   Transfer-Seite). Ohne Ersatz saehe der Kunde nach dem Absenden gar nichts
   mehr, deshalb dieser Kasten mit der Referenznummer.

   Warum hier und nicht auf den sechs Seiten: dieselbe Ueberlegung wie beim
   Wachposten oben. Die Seiten haben ihre Absende-Logik jeweils inline und
   jede etwas anders aufgebaut; alle sechs laden aber diese Datei.

   Technik: Die Antwort der Lead-Funktion wird mitgelesen - ueber res.clone(),
   damit die Seite ihre eigene Auswertung unveraendert weiterbenutzt. Die
   sechs Seiten brauchen dafuer keine einzige Zeile.
   ========================================================================= */
(function () {
  var LEAD_ENDPOINT = "/.netlify/functions/leads";
  var BOX_CLASS = "amd-lead-feedback";

  var TEXTS = {
    de: {
      title: "Vielen Dank! Ihre Anfrage ist bei uns eingegangen.",
      ref: "Ihre Referenznummer",
      mail: "Eine Bestätigung mit allen Angaben geht per E-Mail an Sie raus. Bitte sehen Sie auch im Spam-Ordner nach, falls Sie nichts finden.",
      noMail: "Wir melden uns in Kürze bei Ihnen.",
      error: "Ihre Anfrage konnte gerade nicht gespeichert werden. Bitte versuchen Sie es noch einmal oder nutzen Sie den WhatsApp-Knopf."
    },
    en: {
      title: "Thank you! We have received your request.",
      ref: "Your reference number",
      mail: "A confirmation with all the details is on its way to you by email. If you cannot find it, please also check your spam folder.",
      noMail: "We will get back to you shortly.",
      error: "We could not save your request just now. Please try again or use the WhatsApp button."
    },
    ar: {
      title: "شكرًا لكم! لقد استلمنا طلبكم.",
      ref: "رقم المرجع الخاص بكم",
      mail: "سيصلكم تأكيد بجميع التفاصيل عبر البريد الإلكتروني. إذا لم تجدوه، يرجى مراجعة مجلد الرسائل غير المرغوب فيها.",
      noMail: "سنتواصل معكم في أقرب وقت.",
      error: "تعذر حفظ طلبكم الآن. يرجى المحاولة مرة أخرى أو استخدام زر الواتساب."
    }
  };

  function texts() {
    var lang = String(document.documentElement.lang || "de").slice(0, 2).toLowerCase();
    return TEXTS[lang] || TEXTS.de;
  }

  function box() {
    var existing = document.querySelector("." + BOX_CLASS);
    if (existing) return existing;

    // Direkt unter die Knopfreihe - dorthin schaut der Kunde nach dem Klick.
    //
    // Kein Rueckfall auf "irgendein Formular": Die Lead-Funktion wird auch von
    // hookEmailClicks_ weiter oben aufgerufen, und zwar auf Seiten ohne diese
    // Knopfreihe (contact.html, bewertung.html). Dort waere der Kasten
    // verwirrend - der Besucher hat nur auf eine E-Mail-Adresse geklickt.
    // Kein Anker, kein Kasten.
    var actions = document.querySelector(".srv-form__actions, .pt-form__actions");
    if (!actions || !actions.parentNode) return null;

    var el = document.createElement("div");
    el.className = BOX_CLASS;
    actions.parentNode.insertBefore(el, actions.nextSibling);
    return el;
  }

  // Die Zusage "Sie bekommen eine E-Mail" darf nur stehen, wenn der Kunde
  // ueberhaupt eine Adresse angegeben hat. Auf den Pauschalreise-Seiten
  // genuegt wahlweise Telefon.
  function hasEmail() {
    var el = document.querySelector('input[name="email"]');
    return !!(el && String(el.value || "").trim());
  }

  function paragraph(suffix, text) {
    var p = document.createElement("p");
    p.className = BOX_CLASS + "__" + suffix;
    p.textContent = text; // textContent, nie innerHTML: hier landen Kundendaten
    return p;
  }

  // Alten Kasten wegnehmen. Noetig, weil das Anfrage-Fenster auf den
  // Pauschalreise-Seiten beim Schliessen nur unsichtbar geschaltet und nicht
  // ausgehaengt wird: ohne das saehe der Kunde beim naechsten Oeffnen sofort
  // die Bestaetigung von vorhin, mitsamt alter Referenznummer.
  function clearBox() {
    var el = document.querySelector("." + BOX_CLASS);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function show(kind, refNr, mailQueued) {
    var el = box();
    if (!el) return;

    var t = texts();
    el.innerHTML = "";
    el.classList.remove(BOX_CLASS + "--success", BOX_CLASS + "--error");

    if (kind === "success") {
      el.classList.add(BOX_CLASS + "--success");
      el.setAttribute("role", "status");
      el.appendChild(paragraph("title", t.title));
      if (refNr) el.appendChild(paragraph("ref", t.ref + ": " + refNr));
      // Eine Mail nur versprechen, wenn der Server sie auch angestossen hat
      // UND eine Adresse vorliegt. Fehlt das Geheimnis in Netlify, meldet
      // leads.js mailQueued:false - dann steht hier der neutrale Satz.
      el.appendChild(paragraph("hint", (mailQueued && hasEmail()) ? t.mail : t.noMail));
    } else {
      el.classList.add(BOX_CLASS + "--error");
      el.setAttribute("role", "alert");
      el.appendChild(paragraph("title", t.error));
    }

    try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
  }

  // leads.js reicht refNr flach mit; die aelteren Verschachtelungen bleiben
  // als Rueckfall stehen, damit ein Umbau am Apps Script die Nummer nicht
  // wieder verschwinden laesst.
  function refFrom(out) {
    if (!out) return "";
    var up = out.upstream || null;
    var candidates = [
      out.refNr,
      up && up.data && up.data.refNr,
      up && up.data && up.data.data && up.data.data.refNr,
      up && up.refNr,
      out.data && out.data.refNr
    ];
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i] == null ? "" : String(candidates[i]).trim();
      if (v) return v;
    }
    return "";
  }

  // Sobald der Kunde wieder am Formular arbeitet oder das Anfrage-Fenster
  // erneut oeffnet, ist die alte Bestaetigung nicht mehr wahr.
  document.addEventListener("input", clearBox);
  document.addEventListener("click", function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest("#btnOpenInquiry")) clearBox();
  }, true);

  if (typeof window.fetch !== "function") return;

  var innerFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = "";
    try { url = String((input && input.url) || input || ""); } catch (e) {}

    var result = innerFetch.apply(this, arguments);

    if (url.indexOf(LEAD_ENDPOINT) !== -1 && result && typeof result.then === "function") {
      // Neue Anfrage laeuft: alte Rueckmeldung sofort weg.
      clearBox();

      result.then(function (res) {
        var copy;
        try { copy = res.clone(); } catch (e) { return; }
        copy.json().then(
          function (out) {
            if (!res.ok || !out || out.ok === false) { show("error"); return; }
            show("success", refFrom(out), out.mailQueued === true);
          },
          function () { if (!res.ok) show("error"); }
        );
      }, function () {
        show("error");
      });
    }

    return result;
  };
})();
