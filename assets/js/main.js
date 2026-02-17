/* ================================
   AMD Leads – Car Rental
   + Partner+Token Session (URL → sessionStorage)
   + Link-Patching (nur definierte Domains)
   + Lead payload: partnerId/token nur wenn gesetzt
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
  // neue Subdomains
  "transfer.amd-germancenter.com",
  "tours.amd-germancenter.com",

  // alte Netlify-Hosts (Fallback)
  "amdtransfer.netlify.app",
  "amdtourbooking.netlify.app",
]);

/**
 * Hauptseite wird später unter amd-germancenter.com laufen.
 * Wir erlauben ebenfalls das Behalten beim Zurückwechseln.
 */
const MAIN_HOSTS = new Set([
  "neuewebsite.netlify.app",
  "www.amd-germancenter.com",
  "amd-germancenter.com",
]);

function goWithPartner_(url) {
  const { partner, token } = getPartnerToken_();
  const finalUrl = addParamsToUrl_(url, partner, token);
  window.location.href = finalUrl;
}

function getUrlParam_(key) {
  const sp = new URLSearchParams(window.location.search);
  return (sp.get(key) || "").trim();
}

function getSession_(key) {
  // 1) zuerst sessionStorage
  const s = (sessionStorage.getItem(key) || "").trim();
  if (s) return s;

  // 2) fallback localStorage, aber nur wenn Token < 1 Stunde alt
  const ts = Number(localStorage.getItem(TOKEN_TS_KEY) || "0");
  if (!ts || Date.now() - ts > TOKEN_TTL_MS) return "";

  return (localStorage.getItem(key) || "").trim();
}


function setSession_(key, val) {
  if (!val) return;
  const v = String(val).trim();

  // sessionStorage (wie bisher)
  sessionStorage.setItem(key, v);

  // zusätzlich localStorage für 1h-Sticky
  localStorage.setItem(key, v);

  // wenn wir token setzen, auch timestamp setzen
  if (key === TOKEN_KEY) {
    localStorage.setItem(TOKEN_TS_KEY, String(Date.now()));
  }
}


/**
 * Zentrale Wahrheit:
 * - wenn URL partner/token hat => Session setzen/refresh
 * - sonst Session lesen
 */
function getPartnerToken_() {
  const urlPartner = getUrlParam_("partner");
  const urlToken = getUrlParam_("token");

  // Wenn URL etwas hat → refresh Storage
  if (urlPartner) setSession_(PARTNER_KEY, urlPartner);
  if (urlToken) setSession_(TOKEN_KEY, urlToken);

  // 1) zuerst aus URL/Session
  const partner = (urlPartner || getSession_(PARTNER_KEY) || "").trim();
  const token = (urlToken || getSession_(TOKEN_KEY) || "").trim();

  if (partner || token) return { partner, token };

  // 2) Fallback: localStorage, aber nur wenn Token jünger als 1 Stunde ist
  const ts = Number(localStorage.getItem(TOKEN_TS_KEY) || "0");
  const fresh = ts > 0 && (Date.now() - ts) <= TOKEN_TTL_MS;
  if (!fresh) return { partner: "", token: "" };

  const lp = (localStorage.getItem(PARTNER_KEY) || "").trim();
  const lt = (localStorage.getItem(TOKEN_KEY) || "").trim();

  // Session wieder auffüllen fürs aktuelle Tab
  if (lp) sessionStorage.setItem(PARTNER_KEY, lp);
  if (lt) sessionStorage.setItem(TOKEN_KEY, lt);

  return { partner: lp, token: lt };
}

function ensureQrTokenForHotel_(onReady) {
  const partnerFromUrl = getUrlParam_("partner");

  // Kein Partner in URL => normaler Besucher => QR nicht aktiv
  if (!partnerFromUrl) {
    sessionStorage.removeItem(QR_ACTIVE_KEY);
    if (typeof onReady === "function") onReady(getPartnerToken_());
    return;
  }

  // Partner in URL => QR/Partner-Session aktiv
  sessionStorage.setItem(QR_ACTIVE_KEY, "1");


  // Wenn Token schon existiert: sofort "ready"
  const existingToken = getUrlParam_("token") || getSession_(TOKEN_KEY);
  if (existingToken) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
    return;
  }

  const url =
    AMD_LEADS_URL +
    "?mode=qr_check&partner=" +
    encodeURIComponent(partnerFromUrl) +
    "&secret=" +
    encodeURIComponent(AMD_LEADS_SECRET);

  try {
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.ok || !data.token) {
          if (typeof onReady === "function") onReady(getPartnerToken_());
          return;
        }

        const finalPartnerId = (data.partnerId || partnerFromUrl || "").trim();
        const token = String(data.token || "").trim();

        if (finalPartnerId) setSession_(PARTNER_KEY, finalPartnerId);
        if (token) setSession_(TOKEN_KEY, token);

        // URL aufräumen: qr entfernen, partner+token setzen
        try {
          const current = new URL(window.location.href);
          if (finalPartnerId) current.searchParams.set("partner", finalPartnerId);
          if (token) current.searchParams.set("token", token);
          current.searchParams.delete("qr");
          history.replaceState(null, "", current.toString());
        } catch (_) {}

        if (typeof onReady === "function") onReady({ partner: finalPartnerId, token });
      })
      .catch(() => {
        if (typeof onReady === "function") onReady(getPartnerToken_());
      });
  } catch (_) {
    if (typeof onReady === "function") onReady(getPartnerToken_());
  }
}


function shouldPatchUrl_(u) {
  // Nur patchen, wenn wirklich eine QR/Partner-Session aktiv ist
  const qrActive = sessionStorage.getItem(QR_ACTIVE_KEY) === "1";
  if (!qrActive) return false;

  // Interne Links (Sprachwechsel etc.) dürfen dann partner/token mitnehmen
  if (u.origin === window.location.origin) return true;

  // Externe Apps dürfen ebenfalls
  if (PASS_HOSTS.has(u.hostname)) return true;

  // optional: absolute Links zur Hauptseite
  if (MAIN_HOSTS.has(u.hostname)) return true;

  return false;
}


/**
 * Hängt partner/token an, ohne bestehende Query/Hash zu zerstören.
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

/**
 * Patcht alle <a href="..."> Links im DOM.
 * - ignoriert: mailto:, tel:, #hash-only, javascript:
 */
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

    // nichts tun, wenn schon beide drin sind (oder jeweils vorhanden)
    const hasPartner = href.includes("partner=");
    const hasToken = href.includes("token=");

    if ((partner ? hasPartner : true) && (token ? hasToken : true)) return;

    const patched = addParamsToUrl_(href, partner, token);
    if (patched && patched !== href) a.setAttribute("href", patched);
  });
}

/**
 * Robust gegen dynamische DOM-Updates
 */
function watchAndPatchLinks_(partner, token) {
  if (!partner && !token) return;

  const obs = new MutationObserver(() => {
    patchAllLinks_(partner, token);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

/* ================================
   Leads / WhatsApp / Mail
   ================================ */

function postLead(payload) {
  // bewusst silent: darf niemals Flow blockieren
  try {
    fetch("/.netlify/functions/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }).catch(() => {});
  } catch (_) {}
}

function getLang() {
  return (document.documentElement.lang || "de").toLowerCase();
}

function buildWhatsAppMessage({
  lang,
  name,
  email,
  phone,
  dob,
  car,
  startDate,
  endDate,
  freeNotes,
  acceptLegal,
}) {
  if (lang.startsWith("ar")) {
    return (
      "مرحباً AMD German Center،\n" +
      "أرغب بطلب عرض لتأجير سيارة:\n\n" +
      `الاسم: ${name || "-"}\n` +
      `الهاتف: ${phone || "-"}\n` +
      `البريد: ${email || "-"}\n` +
      `تاريخ الميلاد: ${dob || "-"}\n` +
      `السيارة: ${car || "-"}\n` +
      `بداية الإيجار: ${startDate || "-"}\n` +
      `نهاية الإيجار: ${endDate || "-"}\n` +
      `ملاحظات: ${freeNotes || "-"}\n\n` +
      `الموافقة: تم قبول سياسة الخصوصية والشروط\n` +
      `الصفحة: ${window.location.href}\n`
    );
  }

  if (lang.startsWith("en")) {
    return (
      "Hello AMD German Center,\n" +
      "I’d like a rental car offer:\n\n" +
      `Name: ${name || "-"}\n` +
      `Phone: ${phone || "-"}\n` +
      `Email: ${email || "-"}\n` +
      `Date of birth: ${dob || "-"}\n` +
      `Car: ${car || "-"}\n` +
      `Start date: ${startDate || "-"}\n` +
      `End date: ${endDate || "-"}\n` +
      `Notes: ${freeNotes || "-"}\n\n` +
      `Consent: Privacy policy & terms accepted\n` +
      `Page: ${window.location.href}\n`
    );
  }

  // DE
  return (
    "Hallo AMD German Center,\n" +
    "ich möchte ein Mietwagen-Angebot anfragen:\n\n" +
    `Name: ${name || "-"}\n` +
    `Telefon: ${phone || "-"}\n` +
    `E-Mail: ${email || "-"}\n` +
    `Geburtsdatum: ${dob || "-"}\n` +
    `Wunschfahrzeug: ${car || "-"}\n` +
    `Mietbeginn: ${startDate || "-"}\n` +
    `Mietende: ${endDate || "-"}\n` +
    `Wünsche: ${freeNotes || "-"}\n\n` +
    `Zustimmung: Datenschutz & AGB akzeptiert\n` +
    `Seite: ${window.location.href}\n`
  );
}
function updatePartnerFieldVisibility_(token) {
  // Partner-ID Feld nur für Reisebüros:
  // Hotel-QR (Token vorhanden) => Feld ausblenden + leeren
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

  // Default: versteckt
  brandWrap.hidden = true;
  if (!brandImg) return;

  // Nur Hotel-QR: Partner + Token erforderlich
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
      brandWrap.hidden = false; // nur wenn wirklich geladen
    };

    brandImg.onerror = () => {
      resetImg();
      tryLoad(i + 1);
    };

    brandImg.src = candidates[i];
  };

  tryLoad(0);
}

document.addEventListener("DOMContentLoaded", () => {
  // Footer-Jahr (ersetzt Inline-Script)
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // 0) Erst Hotel-QR prüfen (Token ggf. nachladen).
  // Danach: Links + UI (Partnerfeld/Logo) mit FINALEN Werten setzen.
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

  // 1) Sofortiger Zustand (wenn Token schon in URL/Session ist)
  const { partner, token } = getPartnerToken_();
  if (partner || token) {
    patchAllLinks_(partner, token);
    watchAndPatchLinks_(partner, token);
  }
  updatePartnerFieldVisibility_(token);
  initPartnerBrand_(partner, token);

  // 1b) Buttons ohne <a href>: data-go automatisch mit Partner/Token öffnen
  document.addEventListener("click", (e) => {
    const el = e.target?.closest?.("[data-go]");
    if (!el) return;

    const url = String(el.getAttribute("data-go") || "").trim();
    if (!url) return;

    e.preventDefault();
    goWithPartner_(url);
  });

  const rentalForm = document.querySelector(".amd-form");
  if (!rentalForm) return;

    /* =========================================================
     EXTRA VALIDATION: Mietbeginn nicht rückwirkend + Alterslogik
     ========================================================= */

  // 1) Mietbeginn: frühestens heute
  const startDateInput = document.getElementById("startDate");
  if (startDateInput) {
    const today = new Date().toISOString().split("T")[0];
    startDateInput.setAttribute("min", today);
  }

  // 2) Mindestalter pro Fahrzeug
  function getMinAgeForCar(car) {
    switch ((car || "").trim()) {
      case "Audi Q7":
      case "Range Rover Sport":
        return 21; // Premium / Luxury
      default:
        return 18; // alle anderen Fahrzeuge + freie Anfrage
    }
  }

  function isUnderMinAge(dobString, minAge) {
    if (!dobString) return true; // Sicherheitsfallback

    const dob = new Date(dobString);
    if (Number.isNaN(dob.getTime())) return true;

    const today = new Date();
    const threshold = new Date(
      today.getFullYear() - minAge,
      today.getMonth(),
      today.getDate()
    );

    // zu jung, wenn Geburtsdatum NACH dem Stichtag liegt
    return dob > threshold;
  }

  // 3) Alterscheck vor Versand (E-Mail & WhatsApp)
  function checkAgeBeforeSend(car, dob) {
    if (!dob) return true; // Pflichtfeld-Prüfung läuft separat

    const minAge = getMinAgeForCar(car);
    if (!isUnderMinAge(dob, minAge)) {
      // alles okay, nicht blocken
      return true;
    }

    const lang = typeof getLang === "function" ? getLang() : "de";
    const carLabel = (car || "").trim();

    const msg = lang.startsWith("ar")
      ? `الحد الأدنى للعمر لهذه السيارة هو ${minAge} سنة.\n\nإذا كان عمرك أقل من ذلك، فيرجى اختيار سيارة أخرى أو الاتصال بنا مباشرة عبر الهاتف أو الواتساب لمناقشة حل فردي مناسب.`
      : lang.startsWith("en")
      ? `The minimum age for this vehicle${carLabel ? ` (${carLabel})` : ""} is ${minAge} years.\n\nIf you are younger, please choose another vehicle or contact us directly by phone or WhatsApp so we can look for an individual solution.`
      : `Für das gewählte Fahrzeug${carLabel ? ` („${carLabel}“)`: ""} gilt ein Mindestalter von ${minAge} Jahren.\n\nWenn Sie jünger sind, wählen Sie bitte ein anderes Fahrzeug oder kontaktieren Sie uns direkt per Telefon oder WhatsApp, damit wir eine individuelle Lösung prüfen können.`;

    alert(msg);
    document.getElementById("dob")?.focus();
    return false;
  }


   // 3b) Live-Hinweis im Formular: nur anzeigen, wenn Fahrzeug + Alter nicht passen
  const ageWarningEl = document.getElementById("ageWarning");

  function updateLiveAgeWarning() {
    if (!ageWarningEl) return;

    const car = document.getElementById("car")?.value || "";
    const dob = document.getElementById("dob")?.value || "";

    // Wenn noch nichts ausgewählt ist → Hinweis weg
    if (!car || !dob) {
      ageWarningEl.style.display = "none";
      ageWarningEl.textContent = "";
      return;
    }

    const minAge = getMinAgeForCar(car);
    const tooYoung = isUnderMinAge(dob, minAge);

    if (!tooYoung) {
      ageWarningEl.style.display = "none";
      ageWarningEl.textContent = "";
      return;
    }

    const lang = typeof getLang === "function" ? getLang() : "de";
    const carLabel = (car || "").trim();

    ageWarningEl.textContent =
      lang.startsWith("ar")
        ? `العمر الأدنى لسيارة ${carLabel || "هذه السيارة"} هو ${minAge} سنة.`
        : lang.startsWith("en")
        ? `Minimum age for ${carLabel || "this vehicle"} is ${minAge} years.`
        : `Mindestalter für ${carLabel || "dieses Fahrzeug"} ist ${minAge} Jahre.`;

    ageWarningEl.style.display = "block";
  }

  // Events: wenn Geburtsdatum oder Fahrzeug geändert wird
  document.getElementById("car")?.addEventListener("change", updateLiveAgeWarning);
  document.getElementById("dob")?.addEventListener("change", updateLiveAgeWarning);

  // 0) Inquiry Modal
  const crModal = document.getElementById("crInquiryModal");
  const openBtns = Array.from(
    document.querySelectorAll(
      "#btnOpenInquiryRental, #btnOpenInquiryRental2, .js-open-rental-inquiry"
    )
  );

  if (crModal && openBtns.length) {
    let lastOpener = null;

     const open = (btn) => {
      lastOpener = btn || null;
      crModal.classList.add("is-open");
      crModal.setAttribute("aria-hidden", "false");
      document.documentElement.style.overflow = "hidden";

      const carName = btn?.getAttribute("data-car");
      if (carName) {
        const sel = document.getElementById("car");
        if (sel) {
          sel.value = carName;

          // Alters-Hinweis sofort an das gewählte Fahrzeug anpassen
          if (typeof updateLiveAgeWarning === "function") {
            updateLiveAgeWarning();
          }
        }
      }

      const first = crModal.querySelector("input, select, textarea, button");
      if (first) first.focus();
    };


    const close = () => {
      crModal.classList.remove("is-open");
      crModal.setAttribute("aria-hidden", "true");
      document.documentElement.style.overflow = "";
      if (lastOpener && typeof lastOpener.focus === "function") lastOpener.focus();
    };

    openBtns.forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        open(btn);
      })
    );

    // explizit alle Elemente mit data-close="1" anklicken lassen (X + Overlay)
    const closeEls = crModal.querySelectorAll("[data-close='1']");
    closeEls.forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && crModal.classList.contains("is-open")) close();
    });

  }


// Helper: final partner/token for sending (manual Partner-ID stays possible)
// Helper: final partner/token for sending
// Regel:
// - Hotel-QR => token vorhanden => Partner-ID kommt NUR aus Session/URL (keine manuelle Partner-ID)
 // - Reisebüro => kein token => manuelle Partner-ID erlaubt (ohne Token)
function getFinalPartnerToken_() {
  const urlPartner = getUrlParam_("partner"); // NUR aus URL = echter QR
  const { partner, token } = getPartnerToken_();

  const manualPartnerId =
    document.getElementById("partnerId")?.value?.trim() || "";

  // 1️⃣ ECHTER Hotel-QR: Partner kam aus URL + Token existiert
  if (urlPartner && token) {
    return {
      finalPartnerId: urlPartner.trim(),
      finalToken: String(token || "").trim(),
    };
  }

  // 2️⃣ Reisebüro-Fall: manuelle Partner-ID (A001 etc.)
  if (manualPartnerId) {
    return {
      finalPartnerId: manualPartnerId.trim(),
      finalToken: "", // NIE Token für Agenturen
    };
  }

  // 3️⃣ Fallback: nichts
  return {
    finalPartnerId: "",
    finalToken: "",
  };
}



  // 1) E-Mail Button (mailto)
  const emailBtn = document.getElementById("btnRentalEmail");
  if (emailBtn) {
    emailBtn.addEventListener("click", () => {
      const acceptLegal = !!document.getElementById("acceptLegal")?.checked;
      if (!acceptLegal) {
        const lang = typeof getLang === "function" ? getLang() : "de";
        const msg = lang.startsWith("ar")
          ? "يرجى الموافقة على سياسة الخصوصية والشروط أولاً."
          : lang.startsWith("en")
          ? "Please accept the privacy policy and terms first."
          : "Bitte akzeptieren Sie zuerst die Datenschutzerklärung und die AGB.";
        alert(msg);
        document.getElementById("acceptLegal")?.focus();
        return;
      }

      const firstName = document.getElementById("firstName")?.value?.trim() || "";
      const lastName  = document.getElementById("lastName")?.value?.trim() || "";
      const phone     = document.getElementById("phone")?.value?.trim() || "";
      const email     = document.getElementById("email")?.value?.trim() || "";
      const dob       = document.getElementById("dob")?.value || "";
      const car       = document.getElementById("car")?.value || "";
      const startDate = document.getElementById("startDate")?.value || "";
      const endDate   = document.getElementById("endDate")?.value || "";
      const freeNotes = document.getElementById("notes")?.value?.trim() || "";

      const missing =
        !firstName ? "firstName" :
        !lastName  ? "lastName"  :
        !phone     ? "phone"     :
        !email     ? "email"     :
        !dob       ? "dob"       :
        !car       ? "car"       :
        !startDate ? "startDate" :
        !endDate   ? "endDate"   : "";

      if (missing) {
        document.getElementById(missing)?.focus();
        return;
      }

      // 🔴 Alterslogik: Audi Q7 / Range Rover ab 21, andere ab 18
      if (!checkAgeBeforeSend(car, dob)) {
        return;
      }

      const fullName = (firstName + " " + lastName).trim();
      const lang = getLang();

      const notes = [
        "channel=form",
        "action=mailto",
        `dob=${dob}`,
        `car=${car}`,
        `start=${startDate}`,
        `end=${endDate}`,
        freeNotes ? `message=${freeNotes}` : "",
      ].filter(Boolean).join(" | ");

      const { finalPartnerId, finalToken } = getFinalPartnerToken_();

      postLead({
        source: window.location.hostname,
        service: "car_rental",
        name: fullName,
        email,
        phone,
        partnerId: finalPartnerId, // wird nur gesendet, wenn nicht leer
        token: finalToken,         // wird nur gesendet, wenn nicht leer
        acceptLegal,
        lang,
        pageUrl: window.location.href,
        notes,
      });

      const subject =
        lang.startsWith("ar") ? "طلب عرض لتأجير سيارة" :
        lang.startsWith("en") ? "Rental Car Offer Request" :
        "Mietwagen-Angebot anfordern";

      const body = buildWhatsAppMessage({
        lang,
        name: fullName,
        email,
        phone,
        dob,
        car,
        startDate,
        endDate,
        freeNotes,
        acceptLegal,
      });

      const to = "info@amd-germancenter.com";
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    });
  }

  // 2) WhatsApp Button
  const waBtn = document.getElementById("btnRentalWhatsApp");
  if (waBtn) {
    waBtn.addEventListener("click", (e) => {
      e.preventDefault();

      const acceptLegal = !!document.getElementById("acceptLegal")?.checked;
      if (!acceptLegal) {
        const lang = typeof getLang === "function" ? getLang() : "de";
        const msg = lang.startsWith("ar")
          ? "يرجى الموافقة على سياسة الخصوصية والشروط أولاً."
          : lang.startsWith("en")
          ? "Please accept the privacy policy and terms first."
          : "Bitte akzeptieren Sie zuerst die Datenschutzerklärung und die AGB.";
        alert(msg);
        document.getElementById("acceptLegal")?.focus();
        return;
      }

      const firstName = document.getElementById("firstName")?.value || "";
      const lastName = document.getElementById("lastName")?.value || "";
      const name = (firstName + " " + lastName).trim();

      const email = document.getElementById("email")?.value || "";
      const phone = document.getElementById("phone")?.value || "";

      const dob = document.getElementById("dob")?.value || "";
      const car = document.getElementById("car")?.value || "";
      const startDate = document.getElementById("startDate")?.value || "";
      const endDate = document.getElementById("endDate")?.value || "";
      const freeNotes = document.getElementById("notes")?.value || "";
      // Alterslogik auch vor WhatsApp-Versand prüfen
      if (!checkAgeBeforeSend(car, dob)) {
        return;
      }

      const lang = getLang();
      const msg = buildWhatsAppMessage({
        lang,
        name,
        email,
        phone,
        dob,
        car,
        startDate,
        endDate,
        freeNotes,
        acceptLegal,
      });

      const waNumber = "96181622668";
      const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, "_blank", "noopener");

      if (name || email || phone) {
        const notes = [
          "channel=whatsapp",
          "action=click",
          `dob=${dob}`,
          `car=${car}`,
          `start=${startDate}`,
          `end=${endDate}`,
          freeNotes ? `message=${freeNotes}` : "",
        ].filter(Boolean).join(" | ");

        const { finalPartnerId, finalToken } = getFinalPartnerToken_();

        postLead({
          source: window.location.hostname,
          service: "car_rental",
          name,
          email,
          phone,
          partnerId: finalPartnerId, // nur wenn nicht leer
          token: finalToken,         // nur wenn nicht leer
          acceptLegal,
          lang,
          pageUrl: window.location.href,
          notes,
        });
      }
    });
  }
});
