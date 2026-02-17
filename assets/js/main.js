/* ================================
   AMD Leads – Packages + Services
   + Partner+Token Session (URL → session/localStorage)
   + Link-Patching (nur definierte Domains)
   + Lead payload: PartnerId/Token sauber (Hotel QR vs Agent)
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
  const fresh = ts > 0 && (Date.now() - ts) <= TOKEN_TTL_MS;
  if (!fresh) return { partner: "", token: "" };

  const lp = (localStorage.getItem(PARTNER_KEY) || "").trim();
  const lt = (localStorage.getItem(TOKEN_KEY) || "").trim();

  if (lp) sessionStorage.setItem(PARTNER_KEY, lp);
  if (lt) sessionStorage.setItem(TOKEN_KEY, lt);

  return { partner: lp, token: lt };
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
 *   (dein QR-Link macht genau das server-side)
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

  // Partner vorhanden, Token fehlt => über r.js Token holen (redirect)
  try {
    const dest = `/.netlify/functions/r?pid=${encodeURIComponent(partnerFromUrl)}`;
    window.location.href = dest;
  } catch (_) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
  }
}

/* ================================
   Leads
   ================================ */

function postLead(payload) {
  // bewusst silent: darf niemals Flow blockieren
  try {
    const body = JSON.stringify(payload || {});
    // 1) Beacon überlebt Navigation (mailto/wa.me)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(AMD_LEADS_URL, blob);
      return;
    }
    // 2) Fallback: keepalive
    fetch(AMD_LEADS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
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
  const candidates = [
    `../assets/partners/${safeId}.svg`,
    `../assets/partners/${safeId}.png`,
  ];

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
  // Backend akzeptiert "packages" (nicht "package_tours")
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
 * Regel:
 * - Hotel QR: token vorhanden => PartnerId nur aus URL/Session, Feld wird versteckt
 * - Agent: kein token => PartnerId darf manuell aus #partnerId kommen
 */
function getFinalPartnerToken_() {
  const urlPartner = getUrlParam_("partner");
  const { token } = getPartnerToken_();

  const manualPartnerId = document.getElementById("partnerId")?.value?.trim() || "";

  if (urlPartner && token) {
    return {
      finalPartnerId: urlPartner.trim(),
      finalToken: String(token || "").trim(),
    };
  }

  if (manualPartnerId) {
    return {
      finalPartnerId: manualPartnerId.trim(),
      finalToken: "",
    };
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

  const fullText = message || buildFullText_(obj);
  const { finalPartnerId, finalToken } = getFinalPartnerToken_();

  return {
    service: determineServiceFromPath_(), // packages | services
    locale: getLang(),
    lang: getLang(),

    name,
    email,
    phone,

    // menschenlesbarer Text
    message: fullText,
    fullText: fullText,

    // strukturiert (für Angebot)
    structuredJson: obj,

    // Attribution
    partnerId: finalPartnerId,
    token: finalToken,

    contactPreference: contactPreference || "form",
    pageUrl: location.href,
    sourceUrl: location.href,
    source: location.hostname,
  };
}

function hookForms_() {
  const forms = Array.from(document.querySelectorAll("form"));
  forms.forEach((form) => {
    if (form.__amdLeadHooked) return;
    form.__amdLeadHooked = true;

    form.addEventListener(
      "submit",
      () => {
        try {
          const payload = buildLeadPayloadFromForm_(form, "email");
          postLead(payload);
        } catch (_) {}
      },
      { passive: true }
    );
  });
}

function hookWhatsAppClicks_() {
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.('a[href*="wa.me"], a[href*="whatsapp"]');
      const btn = e.target?.closest?.("button");
      const txt = String((a || btn)?.innerText || "").toLowerCase();

      const isWa = !!a || txt.includes("whatsapp") || txt.includes("واتساب");
      if (!isWa) return;

      try {
        const form = (a || btn)?.closest("form") || document.querySelector("form");
        if (!form) return;

        const payload = buildLeadPayloadFromForm_(form, "whatsapp");
        postLead(payload);
      } catch (_) {}
    },
    { passive: true }
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

    updatePartnerFieldVisibility_(token);
    initPartnerBrand_(partner, token);
  });

  // Sofortzustand (wenn partner/token schon da sind)
  const { partner, token } = getPartnerToken_();
  if (partner || token) {
    patchAllLinks_(partner, token);
    watchAndPatchLinks_(partner, token);
  }
  updatePartnerFieldVisibility_(token);
  initPartnerBrand_(partner, token);

  // Buttons ohne <a href>: data-go
  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-go]");
    if (!el) return;

    const url = String(el.getAttribute("data-go") || "").trim();
    if (!url) return;

    e.preventDefault();
    goWithPartner_(url);
  });

  // Lead Hooks
  hookForms_();
  hookWhatsAppClicks_();
});
