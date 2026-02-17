/* ================================
   AMD Leads – Packages + Services
   + Partner+Token Session (URL → session/localStorage)
   + Link-Patching (nur definierte Domains)
   + Lead payload: PartnerId/Token sauber (Hotel QR vs Agent)
   + FIX: idemKey (keine Doppelzeilen)
   + FIX: WhatsApp/Mail Text bekommt refNr (immer)
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
 */
const PASS_HOSTS = new Set([
  "transfer.amd-germancenter.com",
  "tours.amd-germancenter.com",
  "amdtransfer.netlify.app",
  "amdtourbooking.netlify.app",
]);

/**
 * Hauptseite (inkl. Netlify Preview Hosts)
 */
const MAIN_HOSTS = new Set([
  "neuewebsite.netlify.app",
  "www.amd-germancenter.com",
  "amd-germancenter.com",
]);

function getUrlParam_(key) {
  const sp = new URLSearchParams(window.location.search);
  return (sp.get(key) || "").trim();
}

function getSession_(key) {
  // 1) sessionStorage
  const s = (sessionStorage.getItem(key) || "").trim();
  if (s) return s;

  // 2) localStorage, aber nur wenn Token frisch
  const ts = Number(localStorage.getItem(TOKEN_TS_KEY) || "0");
  if (!ts || Date.now() - ts > TOKEN_TTL_MS) return "";

  return (localStorage.getItem(key) || "").trim();
}

function setSession_(key, val) {
  if (!val) return;
  const v = String(val).trim();

  sessionStorage.setItem(key, v);
  localStorage.setItem(key, v);

  if (key === TOKEN_KEY) {
    localStorage.setItem(TOKEN_TS_KEY, String(Date.now()));
  }
}

/**
 * Zentrale Wahrheit:
 * - wenn URL partner/token hat => Session refresh
 * - sonst Session lesen (mit localStorage TTL fallback)
 */
function getPartnerToken_() {
  const urlPartner = getUrlParam_("partner");
  const urlToken = getUrlParam_("token");

  if (urlPartner) setSession_(PARTNER_KEY, urlPartner);
  if (urlToken) setSession_(TOKEN_KEY, urlToken);

  const partner = (urlPartner || getSession_(PARTNER_KEY) || "").trim();
  const token = (urlToken || getSession_(TOKEN_KEY) || "").trim();

  if (partner || token) return { partner, token };

  const ts = Number(localStorage.getItem(TOKEN_TS_KEY) || "0");
  const fresh = ts > 0 && Date.now() - ts <= TOKEN_TTL_MS;
  if (!fresh) return { partner: "", token: "" };

  const lp = (localStorage.getItem(PARTNER_KEY) || "").trim();
  const lt = (localStorage.getItem(TOKEN_KEY) || "").trim();

  if (lp) sessionStorage.setItem(PARTNER_KEY, lp);
  if (lt) sessionStorage.setItem(TOKEN_KEY, lt);

  return { partner: lp, token: lt };
}

/**
 * “Hotel-QR Attribution” NUR wenn in der AKTUELLEN URL beides steht:
 *   ?partner=XXX&token=YYY
 * Dadurch kann kein alter Token aus storage eine private Anfrage “partnern”.
 */
function getQrAttributionFromUrlOnly_() {
  const partner = getUrlParam_("partner");
  const token = getUrlParam_("token");
  if (partner && token) return { partner: partner.trim(), token: token.trim() };
  return { partner: "", token: "" };
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

  const obs = new MutationObserver(() => {
    patchAllLinks_(partner, token);
  });
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
function ensureQrTokenForHotel_(onReady) {
  const partnerFromUrl = getUrlParam_("partner");
  const tokenFromUrl = getUrlParam_("token");

  if (!partnerFromUrl) {
    sessionStorage.removeItem(QR_ACTIVE_KEY);
    if (typeof onReady === "function") onReady(getPartnerToken_());
    return;
  }

  sessionStorage.setItem(QR_ACTIVE_KEY, "1");

  if (tokenFromUrl) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
    return;
  }

  try {
    const dest = `/.netlify/functions/r?pid=${encodeURIComponent(partnerFromUrl)}`;
    window.location.href = dest;
  } catch (_) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
  }
}

/* ================================
   Leads (POST + refNr parsing)
   ================================ */

function extractRefNr_(json) {
  // netlify returns: { ok:true, upstream: { success:true, data:{ refNr ... } } }
  // sometimes nested: upstream.data.data.refNr
  const u = json?.upstream;
  return (
    u?.data?.refNr ||
    u?.refNr ||
    u?.data?.data?.refNr ||
    json?.refNr ||
    json?.data?.refNr ||
    ""
  );
}

async function postLead(payload) {
  try {
    const res = await fetch(AMD_LEADS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    const json = await res.json().catch(() => null);
    return { refNr: extractRefNr_(json), json };
  } catch (e) {
    return { refNr: "", json: null };
  }
}

function getLang() {
  return (document.documentElement.lang || "de").toLowerCase();
}

/* ================================
   UI: Partner-Feld + Brand
   ================================ */

function updatePartnerFieldVisibility_(token) {
  const partnerRow = document.querySelector(".partner-row");
  const partnerInput = document.getElementById("partnerId");
  if (!partnerRow) return;

  const hide = !!String(token || "").trim();
  partnerRow.style.display = hide ? "none" : "";
  if (hide && partnerInput) partnerInput.value = "";
}

function initPartnerBrand_(partner, token) {
  const brandWrap = document.getElementById("partnerBrand");
  const brandImg = document.getElementById("partnerBrandImg");
  if (!brandWrap) return;

  brandWrap.hidden = true;
  if (!brandImg) return;

  if (!partner || !token) return;

  const safeId = encodeURIComponent(String(partner).trim());
  const candidates = [`../assets/partners/${safeId}.svg`, `../assets/partners/${safeId}.png`];

  const resetImg = () => {
    brandImg.onload = null;
    brandImg.onerror = null;
    brandImg.removeAttribute("src");
    brandImg.src = "";
  };

  const tryLoad = (i) => {
    if (i >= candidates.length) {
      resetImg();
      brandWrap.hidden = true;
      return;
    }

    brandImg.onload = () => {
      brandWrap.hidden = false;
    };

    brandImg.onerror = () => {
      resetImg();
      tryLoad(i + 1);
    };

    brandImg.src = candidates[i];
  };

  tryLoad(0);
}

/* ================================
   Universal Lead Hooks (Packages + Services)
   ================================ */

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

function buildFullText_(obj) {
  const lines = [];
  for (const k of Object.keys(obj)) {
    const v = String(obj[k] ?? "").trim();
    if (!v) continue;
    lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

/**
 * Agent (manuell): #partnerId (ohne token)
 * Hotel QR: NUR wenn ?partner + ?token in aktueller URL
 */
function getFinalPartnerToken_() {
  const manualPartnerId = document.getElementById("partnerId")?.value?.trim() || "";

  const qr = getQrAttributionFromUrlOnly_();
  if (qr.partner && qr.token) {
    return { finalPartnerId: qr.partner, finalToken: qr.token };
  }

  if (manualPartnerId) {
    return { finalPartnerId: manualPartnerId.trim(), finalToken: "" };
  }

  return { finalPartnerId: "", finalToken: "" };
}

function safeLower_(s) {
  return String(s || "").trim().toLowerCase();
}

function stableStringify_(obj) {
  try {
    if (!obj || typeof obj !== "object") return String(obj ?? "");
    const keys = Object.keys(obj).sort();
    const out = {};
    for (const k of keys) out[k] = obj[k];
    return JSON.stringify(out);
  } catch (_) {
    return "";
  }
}

function simpleHash_(str) {
  // stable-enough short hash for idemKey
  let hash = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildIdemKey_(payload) {
  const base = [
    payload.service || "-",
    payload.locale || "-",
    safeLower_(payload.email || "-"),
    String(payload.phone || "-").trim(),
    String(payload.pageUrl || payload.sourceUrl || "-").trim(),
    stableStringify_(payload.structuredJson || {}),
    String(payload.fullText || "").trim(),
  ].join("|");
  return `${payload.service || "lead"}:${simpleHash_(base)}`;
}

function findFormForElement_(el) {
  if (!el) return document.querySelector("form") || null;
  return el.closest("form") || document.querySelector("form") || null;
}

function buildLeadPayloadFromForm_(form, opts = {}) {
  const obj = form ? formToObject_(form) : {};
  const service = determineServiceFromPath_();

  const name =
    (document.getElementById("name")?.value || obj.name || obj.fullname || obj.customerName || "").trim();
  const email =
    (document.getElementById("email")?.value || obj.email || obj.mail || "").trim();
  const phone =
    (document.getElementById("phone")?.value || obj.phone || obj.tel || obj.mobile || "").trim();

  const contactPreference =
    (opts.contactPreference || obj.contactPreference || obj.channel || "whatsapp").trim();

  const { finalPartnerId, finalToken } = getFinalPartnerToken_();

  // fullText: bevorzugt Textarea/Message-Feld (menschlich), sonst aus Formdaten
  const message =
    (document.getElementById("fullText")?.value ||
      document.getElementById("message")?.value ||
      obj.fullText ||
      obj.message ||
      obj.notes ||
      "").trim();

  const structuredJson = {
    ...obj,
    channel: opts.channel || obj.channel || "",
    action: opts.action || obj.action || "",
  };

  const payload = {
    service,
    locale: (document.documentElement.lang || getLang() || "en"),
    lang: (document.documentElement.lang || getLang() || "en"),
    name,
    email,
    phone,
    contactPreference,
    partnerId: finalPartnerId,
    token: finalToken,
    sourceUrl: window.location.href,
    pageUrl: window.location.href,
    structuredJson,
    fullText: message || buildFullText_(structuredJson),
  };

  payload.idemKey = buildIdemKey_(payload);

  return payload;
}

/* ================================
   refNr in WhatsApp/Email Text “einspritzen”
   ================================ */

function refLabel_(lang) {
  const l = (lang || getLang() || "en").toLowerCase();
  if (l.startsWith("de")) return "Referenz";
  if (l.startsWith("ar")) return "المرجع";
  return "Reference";
}

function injectRef_(text, refNr) {
  const ref = String(refNr || "").trim();
  if (!ref) return String(text || "");

  const t = String(text || "");

  // 1) ersetze (pending)
  if (t.includes("(pending)")) return t.replace(/\(pending\)/g, ref);

  // 2) ersetze bestehende Reference/Referenz Zeile
  const re = /^(Reference|Referenz|المرجع)\s*:\s*.*$/gmi;
  if (re.test(t)) return t.replace(re, `${refLabel_()}: ${ref}`);

  // 3) sonst: nach erster Zeile einfügen
  const lines = t.split("\n");
  if (lines.length <= 1) return `${refLabel_()}: ${ref}\n${t}`.trim();
  lines.splice(1, 0, `${refLabel_()}: ${ref}`);
  return lines.join("\n");
}

function buildWhatsAppUrlFromElement_(el, messageText) {
  // akzeptiert:
  // - a[href="https://wa.me/....?text=..."]
  // - button[data-wa="+961..."] oder data-whatsapp="+961..."
  const msg = encodeURIComponent(String(messageText || ""));

  // prefer explicit href if present
  const href = el?.getAttribute?.("href") || "";
  if (href && href.includes("wa.me")) {
    try {
      const u = new URL(href);
      u.searchParams.set("text", String(messageText || ""));
      return u.toString();
    } catch (_) {
      // fallback: replace text=...
      if (href.includes("text=")) return href.replace(/text=[^&]*/i, `text=${msg}`);
      return href + (href.includes("?") ? "&" : "?") + `text=${msg}`;
    }
  }

  const rawNum =
    el?.dataset?.wa ||
    el?.dataset?.whatsapp ||
    document.querySelector("[data-wa]")?.dataset?.wa ||
    "";

  const num = String(rawNum || "").replace(/[^\d+]/g, "");
  const waNumber = num ? num.replace(/^\+/, "") : "";
  if (!waNumber) return "";

  return `https://wa.me/${waNumber}?text=${msg}`;
}

function buildMailtoFromElement_(el, subject, body) {
  const href = el?.getAttribute?.("href") || "";
  let to = "";

  if (href.toLowerCase().startsWith("mailto:")) {
    to = href.slice("mailto:".length).split("?")[0] || "";
  }

  if (!to) {
    to = el?.dataset?.mailto || el?.dataset?.emailto || "";
  }
  if (!to) {
    // fallback: first mailto on page
    const a = document.querySelector('a[href^="mailto:"]');
    if (a) to = (a.getAttribute("href") || "").slice("mailto:".length).split("?")[0] || "";
  }

  const sp = new URLSearchParams();
  if (subject) sp.set("subject", subject);
  if (body) sp.set("body", body);

  return `mailto:${to}?${sp.toString()}`;
}

/* ================================
   Hooks (WhatsApp / Email / Form)
   ================================ */

const _leadSendLocks = new Map(); // idemKey -> timestamp

function lockAllowsSend_(idemKey) {
  const now = Date.now();
  const last = Number(_leadSendLocks.get(idemKey) || 0);
  if (last && now - last < 8000) return false; // 8s click spam guard
  _leadSendLocks.set(idemKey, now);
  return true;
}

async function handleSendAndOpen_(kind, el) {
  const form = findFormForElement_(el);
  if (form && typeof form.checkValidity === "function" && !form.checkValidity()) {
    form.reportValidity?.();
    return;
  }

  const payload = buildLeadPayloadFromForm_(form, {
    channel: kind,
    action: "click",
    contactPreference: kind,
  });

  // minimal required fields: name + (email or phone)
  if (!payload.name || (!payload.email && !payload.phone)) {
    // page may have custom validation elsewhere
    return;
  }

  if (!lockAllowsSend_(payload.idemKey)) {
    // already sent very recently; still open link if possible
  }

  const { refNr } = await postLead(payload);

  // build outgoing message from textarea if exists, else payload.fullText
  const textarea =
    document.getElementById("fullText") ||
    document.getElementById("message") ||
    document.querySelector("textarea");

  const baseText = (textarea?.value || payload.fullText || "").trim();
  const finalText = injectRef_(baseText, refNr);

  if (textarea && finalText) textarea.value = finalText;

  if (kind === "whatsapp") {
    const waUrl = buildWhatsAppUrlFromElement_(el, finalText);
    if (waUrl) window.open(waUrl, "_blank", "noopener");
    return;
  }

  if (kind === "email") {
    const subjBase =
      (document.querySelector('input[name="subject"]')?.value || "").trim() ||
      (getLang().startsWith("de") ? "Anfrage AMD German Center" : "AMD German Center Inquiry");

    const subject = refNr ? `${subjBase} – ${refNr}` : subjBase;
    const mailto = buildMailtoFromElement_(el, subject, finalText);
    if (mailto) window.location.href = mailto;
    return;
  }
}

function hookWhatsAppClicks_() {
  // anchors or buttons that look like WhatsApp
  const candidates = Array.from(document.querySelectorAll('a,button')).filter((el) => {
    const href = (el.getAttribute?.("href") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();
    const data = Object.assign({}, el.dataset || {});
    return (
      href.includes("wa.me") ||
      href.includes("whatsapp") ||
      id.includes("whatsapp") ||
      cls.includes("whatsapp") ||
      data.wa ||
      data.whatsapp
    );
  });

  candidates.forEach((el) => {
    if (el.__amdHookedWhatsApp) return;
    el.__amdHookedWhatsApp = true;

    el.addEventListener(
      "click",
      async (ev) => {
        // prevent default navigation to keep exactly one lead
        ev.preventDefault();
        ev.stopPropagation();
        await handleSendAndOpen_("whatsapp", el);
      },
      true
    );
  });
}

function hookEmailClicks_() {
  const candidates = Array.from(document.querySelectorAll('a[href^="mailto:"], a, button')).filter((el) => {
    const href = (el.getAttribute?.("href") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cls = (el.className || "").toString().toLowerCase();
    const data = Object.assign({}, el.dataset || {});
    return href.startsWith("mailto:") || id.includes("email") || cls.includes("email") || data.mailto || data.emailto;
  });

  candidates.forEach((el) => {
    if (el.__amdHookedEmail) return;
    el.__amdHookedEmail = true;

    el.addEventListener(
      "click",
      async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await handleSendAndOpen_("email", el);
      },
      true
    );
  });
}

function hookFormSubmits_() {
  const forms = Array.from(document.querySelectorAll("form"));
  forms.forEach((form) => {
    if (form.__amdHookedSubmit) return;
    form.__amdHookedSubmit = true;

    form.addEventListener("submit", async (ev) => {
      // some pages do custom submission; we keep it safe:
      // - we only send lead once (idemKey) and do NOT block the form unless it would navigate away immediately
      const payload = buildLeadPayloadFromForm_(form, {
        channel: "form",
        action: "submit",
        contactPreference: "whatsapp",
      });

      if (!payload.name || (!payload.email && !payload.phone)) return;

      if (!lockAllowsSend_(payload.idemKey)) return;

      // fire-and-forget; do not prevent form behavior
      postLead(payload).catch(() => {});
    });
  });
}

/* ================================
   Boot
   ================================ */

function boot_() {
  ensureQrTokenForHotel_(({ partner, token } = {}) => {
    // UI
    updatePartnerFieldVisibility_(token);
    initPartnerBrand_(partner, token);

    // patch links only when QR active (existing behavior)
    const qrActive = sessionStorage.getItem(QR_ACTIVE_KEY) === "1";
    if (qrActive) {
      patchAllLinks_(partner, token);
      watchAndPatchLinks_(partner, token);
    }

    // lead hooks
    hookWhatsAppClicks_();
    hookEmailClicks_();
    hookFormSubmits_();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot_);
} else {
  boot_();
}
