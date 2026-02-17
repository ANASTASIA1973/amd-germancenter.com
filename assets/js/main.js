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
        const form = (a || btn)?.closest("form") || document.querySelector("form");
        if (!form) return;

        e.preventDefault();

        const payload = buildLeadPayloadFromForm_(form, "whatsapp");
        const ref = await postLead(payload);

        // Text finalisieren + in UI setzen (falls textarea genutzt wird)
        const finalText = _injectRef_(payload.fullText || payload.message || "", ref);
        _setTextareaText_(finalText);

        // Wenn es ein Link ist: versuche "text=" Parameter zu aktualisieren
        if (a) {
          const href = a.getAttribute("href") || "";
          const u = new URL(href, window.location.href);
          if (u.searchParams.has("text")) {
            u.searchParams.set("text", finalText);
            window.location.href = u.toString();
            return;
          }
          // fallback: normal folgen
          window.location.href = href;
          return;
        }

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
        const form = (a || btn)?.closest("form") || document.querySelector("form");
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
