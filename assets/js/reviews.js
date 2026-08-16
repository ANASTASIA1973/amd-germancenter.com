/* =====================================================
   AMD German Center – Kundenbewertungen
   -----------------------------------------------------
   SPAETER UMSTELLEN AUF ECHTDATEN:
   Unten AMD_REVIEWS_ENDPOINT auf die Netlify-Function
   setzen, z. B. "/.netlify/functions/reviews".
   Solange der Wert null ist, laufen Beispieldaten im
   Vorschau-Modus: Sie erscheinen NICHT automatisch auf
   der Startseite und sind auf der Bewertungsseite
   sichtbar als Beispiel gekennzeichnet.
   ===================================================== */

(function () {
  "use strict";

  // Echtbetrieb seit System API @48.
  // Auf null setzen, um wieder in den Vorschau-Modus mit Beispieldaten
  // zurueckzufallen (dann sendet das Formular bewusst nichts).
  var AMD_REVIEWS_ENDPOINT = "/.netlify/functions/reviews";

  // ---------------------------------------------------
  // Beispieldaten (werden bei Echtbetrieb nicht genutzt)
  // ---------------------------------------------------
  var DEMO_REVIEWS = {
    de: [
      {
        rating: 5,
        text: "Sehr professioneller Service. Der Flughafentransfer war pünktlich und der Fahrer sehr freundlich. Die Beglaubigung meiner Urkunden hat ohne Probleme geklappt.",
        name: "Sabine M.", country: "Deutschland",
        service: "Behörden- & Dokumentenservice", date: "2026-03-12"
      },
      {
        rating: 5,
        text: "Wir haben eine Rundreise über AMD gebucht. Alles war bestens organisiert, die Kommunikation lief auf Deutsch und wir wurden während der gesamten Reise betreut.",
        name: "Familie Kaiser", country: "Deutschland",
        service: "Pauschalreise", date: "2026-02-28"
      },
      {
        rating: 4,
        text: "Schnelle Abwicklung bei der Beschaffung meiner Geburtsurkunde aus dem Libanon. Hat etwas länger gedauert als geplant, wurde aber immer transparent kommuniziert.",
        name: "Karim H.", country: "Deutschland",
        service: "Dokumente im Libanon beschaffen", date: "2026-02-10"
      },
      {
        rating: 5,
        text: "Sehr schöne Tagestour nach Byblos und zur Jeita-Grotte. Der Fahrer war pünktlich und hat unterwegs viel erklärt. Klare Empfehlung.",
        name: "Peter W.", country: "Vereinigtes Königreich",
        service: "Tagestour", date: "2026-01-22"
      }
    ],
    en: [
      {
        rating: 5,
        text: "Very professional service. The airport transfer was on time and the driver was friendly. The certification of my documents went through without any problems.",
        name: "Sabine M.", country: "Germany",
        service: "Administrative & document services", date: "2026-03-12"
      },
      {
        rating: 5,
        text: "We booked a round trip through AMD. Everything was well organised, communication was easy and we were looked after throughout the whole trip.",
        name: "The Kaiser family", country: "Germany",
        service: "Package tour", date: "2026-02-28"
      },
      {
        rating: 4,
        text: "Quick handling of my birth certificate from Lebanon. It took a little longer than planned, but we were kept informed the whole time.",
        name: "Karim H.", country: "Germany",
        service: "Document retrieval in Lebanon", date: "2026-02-10"
      },
      {
        rating: 5,
        text: "Excellent day tour to Byblos and Jeita Grotto. Our guide spoke perfect English and was very knowledgeable. Highly recommended.",
        name: "Peter W.", country: "United Kingdom",
        service: "Day tour", date: "2026-01-22"
      }
    ],
    ar: [
      {
        rating: 5,
        text: "خدمة احترافية جدًا. كان النقل من المطار في موعده والسائق لطيف للغاية، وتمت المصادقة على أوراقي دون أي مشاكل.",
        name: "سابينه م.", country: "ألمانيا",
        service: "خدمات المعاملات والوثائق", date: "2026-03-12"
      },
      {
        rating: 5,
        text: "حجزنا جولة عبر AMD. كان كل شيء منظمًا بشكل ممتاز، والتواصل سهلًا، وتمت متابعتنا طوال الرحلة.",
        name: "عائلة قيصر", country: "ألمانيا",
        service: "باقة سياحية", date: "2026-02-28"
      },
      {
        rating: 4,
        text: "إنجاز سريع لاستخراج شهادة ميلادي من لبنان. استغرق الأمر وقتًا أطول قليلًا مما كان مخططًا، لكن تم إبلاغنا بكل خطوة.",
        name: "كريم ح.", country: "ألمانيا",
        service: "استخراج وثائق في لبنان", date: "2026-02-10"
      },
      {
        rating: 5,
        text: "جولة يومية رائعة إلى جبيل ومغارة جعيتا. كان الدليل على دراية كبيرة وشرح لنا الكثير في الطريق. أنصح بها بشدة.",
        name: "بيتر و.", country: "المملكة المتحدة",
        service: "جولة يومية", date: "2026-01-22"
      }
    ]
  };

  // ---------------------------------------------------
  // Texte
  // ---------------------------------------------------
  var I18N = {
    de: {
      of: "von",
      dec: ",",
      q1: "„", q2: "“",
      count: function (n) { return "aus " + n + (n === 1 ? " Bewertung" : " Bewertungen"); },
      link: "Das sagen unsere Kunden",
      empty: "Hier erscheinen in Kürze die ersten Bewertungen unserer Kunden. Sie waren bei uns? Dann freuen wir uns über Ihre Rückmeldung – Sie wären die oder der Erste.",
      preview: "Vorschau: Dies sind Beispielbewertungen zur Ansicht des Layouts – noch keine echten Kundenbewertungen.",
      anon: "Kundin oder Kunde",
      anonFrom: function (c) { return "Kundin oder Kunde aus " + c; },
      sending: "Wird gesendet…",
      errAlready: "Für diesen Vorgang wurde bereits eine Bewertung abgegeben. Vielen Dank!",
      errGeneric: "Ihre Bewertung konnte gerade nicht gesendet werden. Bitte versuchen Sie es in einigen Minuten noch einmal.",
      demoSubmit: "Vorschau-Modus: Das Formular ist noch nicht mit dem System verbunden. Es wurde nichts gesendet.",
      locale: "de-DE"
    },
    en: {
      of: "of",
      dec: ".",
      q1: "“", q2: "”",
      count: function (n) { return "from " + n + (n === 1 ? " review" : " reviews"); },
      link: "What our customers say",
      empty: "The first customer reviews will appear here shortly. Have you used our service? We would be glad to hear from you – you would be the first.",
      preview: "Preview: these are sample reviews to show the layout – not real customer reviews yet.",
      anon: "A customer",
      anonFrom: function (c) { return "A customer from " + c; },
      sending: "Sending…",
      errAlready: "A review has already been submitted for this reference. Thank you!",
      errGeneric: "Your review could not be sent right now. Please try again in a few minutes.",
      demoSubmit: "Preview mode: the form is not connected to the system yet. Nothing was sent.",
      locale: "en-GB"
    },
    ar: {
      of: "من",
      dec: ".",
      q1: "«", q2: "»",
      // Arabische Zaehlregeln: 1 Einzahl, 2 Zweizahl, 3–10 Mehrzahl, ab 11 Einzahl im Akkusativ
      count: function (n) {
        if (n === 1) return "من تقييم واحد";
        if (n === 2) return "من تقييمين";
        if (n <= 10) return "من " + n + " تقييمات";
        return "من " + n + " تقييمًا";
      },
      link: "ماذا يقول عملاؤنا",
      empty: "ستظهر هنا قريبًا أولى تقييمات عملائنا. هل استفدت من خدماتنا؟ يسعدنا أن نسمع رأيك – ستكون أول المقيّمين.",
      preview: "معاينة: هذه تقييمات نموذجية لعرض التصميم – وليست تقييمات حقيقية بعد.",
      anon: "أحد العملاء",
      anonFrom: function (c) { return "أحد العملاء من " + c; },
      sending: "جارٍ الإرسال…",
      errAlready: "تم إرسال تقييم لهذه المعاملة من قبل. شكرًا لك!",
      errGeneric: "تعذّر إرسال تقييمك في الوقت الحالي. يرجى المحاولة مرة أخرى بعد بضع دقائق.",
      demoSubmit: "وضع المعاينة: النموذج غير متصل بالنظام بعد. لم يتم إرسال أي شيء.",
      locale: "ar"
    }
  };

  var lang = (document.documentElement.lang || "de").slice(0, 2).toLowerCase();
  var t = I18N[lang] || I18N.de;

  // ---------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------
  function isPreviewMode() {
    return AMD_REVIEWS_ENDPOINT === null;
  }

  // Vorschau laesst sich per ?preview ODER #preview anfordern.
  // Der Anker funktioniert auch dann zuverlaessig, wenn die Seite
  // lokal ueber file:// geoeffnet wird.
  function previewRequested() {
    if (new URLSearchParams(window.location.search).has("preview")) return true;
    return /(^|[#&])preview\b/.test(window.location.hash || "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Dezimaltrennzeichen je Sprache: Deutsch Komma, Englisch und Arabisch Punkt
  function num(value) {
    return value.toFixed(1).replace(".", t.dec);
  }

  function starsHtml(value) {
    var pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100));
    return (
      '<span class="rv-stars" style="--rv-pct:' + pct.toFixed(1) + '%" ' +
      'role="img" aria-label="' + num(value) + " " + t.of + ' 5">' +
      '<span class="rv-stars-bg" aria-hidden="true">★★★★★</span>' +
      '<span class="rv-stars-fg" aria-hidden="true">★★★★★</span>' +
      "</span>"
    );
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString(t.locale, { month: "long", year: "numeric" });
    } catch (e) {
      return iso;
    }
  }

  function average(list) {
    if (!list.length) return 0;
    var sum = list.reduce(function (acc, r) { return acc + Number(r.rating || 0); }, 0);
    return sum / list.length;
  }

  function cardHtml(review) {
    var parts = [];
    parts.push('<article class="rv-card">');
    parts.push('<div class="rv-card-head">');
    parts.push(starsHtml(Number(review.rating) || 0));
    parts.push('<span class="rv-card-date">' + escapeHtml(formatDate(review.date)) + "</span>");
    parts.push("</div>");
    parts.push('<p class="rv-card-text">' + t.q1 + escapeHtml(review.text) + t.q2 + "</p>");
    parts.push('<div class="rv-card-foot">');

    // Der Name kommt nur mit Einwilligung. Fehlt er, wird nicht der
    // Ort leer gelassen, sondern eine neutrale Bezeichnung gesetzt.
    var author = String(review.name || "").trim();
    var country = String(review.country || "").trim();

    if (author) {
      parts.push('<span class="rv-card-author">' + escapeHtml(author) + "</span>");
      if (country) {
        parts.push('<span class="rv-card-origin">· ' + escapeHtml(country) + "</span>");
      }
    } else {
      parts.push(
        '<span class="rv-card-author">' +
        escapeHtml(country ? t.anonFrom(country) : t.anon) +
        "</span>"
      );
    }
    if (review.service) {
      parts.push('<span class="rv-card-service">' + escapeHtml(review.service) + "</span>");
    }
    parts.push("</div>");
    parts.push("</article>");
    return parts.join("");
  }

  // ---------------------------------------------------
  // Rendern
  // ---------------------------------------------------
  function render(reviews) {
    var avg = average(reviews);
    var count = reviews.length;

    // Gesamtnote
    document.querySelectorAll("[data-reviews-summary]").forEach(function (el) {
      if (!count) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.innerHTML =
        starsHtml(avg) +
        '<div class="rv-summary-score">' + num(avg) +
        " <span>" + escapeHtml(t.of) + " 5</span></div>" +
        '<div class="rv-summary-count">' + escapeHtml(t.count(count)) + "</div>";
    });

    // Listen (data-reviews-list="3" begrenzt auf 3 Karten)
    document.querySelectorAll("[data-reviews-list]").forEach(function (el) {
      var limit = parseInt(el.getAttribute("data-reviews-list"), 10);
      var slice = isNaN(limit) ? reviews : reviews.slice(0, limit);
      if (!slice.length) {
        el.innerHTML = '<p class="rv-empty">' + escapeHtml(t.empty) + "</p>";
        return;
      }
      el.innerHTML = slice.map(cardHtml).join("");
    });

    // Vertrauenszeile
    document.querySelectorAll("[data-reviews-trustbar]").forEach(function (el) {
      if (!count) return;
      var href = el.getAttribute("data-reviews-href") || "#";
      // dir="ltr" ist noetig: im Arabischen wuerde "4.8 / 5"
      // von der Zweirichtungs-Darstellung sonst zu "5 / 4.8" gedreht
      el.innerHTML =
        starsHtml(avg) +
        '<span class="rv-trustbar-score" dir="ltr">' + num(avg) + " / 5</span>" +
        '<span class="rv-trustbar-sep">·</span>' +
        '<span class="rv-trustbar-count">' + escapeHtml(t.count(count)) + "</span>" +
        '<span class="rv-trustbar-sep">·</span>' +
        '<a class="rv-trustbar-link" href="' + escapeHtml(href) + '">' +
        escapeHtml(t.link) + " →</a>";
    });

    // Vorschau-Kennzeichnung
    if (isPreviewMode()) {
      document.querySelectorAll("[data-reviews-previewflag]").forEach(function (el) {
        el.textContent = t.preview;
        el.hidden = false;
      });
    }

    // Bereiche einblenden.
    // Im Vorschau-Modus nur, wenn ?preview in der URL steht – damit
    // Beispieldaten nie ungewollt oeffentlich als echt erscheinen.
    var mayShow = !isPreviewMode() || previewRequested();
    document.querySelectorAll("[data-reviews-section]").forEach(function (el) {
      if (mayShow && count) el.hidden = false;
    });
  }

  function load() {
    if (isPreviewMode()) {
      render(DEMO_REVIEWS[lang] || DEMO_REVIEWS.de);
      return;
    }
    fetch(AMD_REVIEWS_ENDPOINT, { headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Apps Script antwortet verpackt: { success, data: { reviews: [...] } }
        var list =
          (data && data.data && data.data.reviews) ||
          (data && data.reviews) ||
          (Array.isArray(data) ? data : []);
        render(Array.isArray(list) ? list : []);
      })
      .catch(function () { render([]); });
  }

  // ---------------------------------------------------
  // Formular: Referenznummer und Erfolgsmeldung
  // ---------------------------------------------------
  function initForm() {
    var params = new URLSearchParams(window.location.search);

    var ref = (params.get("ref") || "").trim();
    if (ref) {
      var refField = document.querySelector('[name="refNr"]');
      if (refField) refField.value = ref;
      document.querySelectorAll("[data-review-refinfo]").forEach(function (el) {
        el.querySelectorAll("[data-review-refvalue]").forEach(function (slot) {
          slot.textContent = ref;
        });
        el.hidden = false;
      });
    }

    if (params.has("ok")) {
      showSuccess();
    }

    var form = document.querySelector("[data-review-form] form");
    if (form) form.addEventListener("submit", onSubmit);
  }

  function showSuccess() {
    document.querySelectorAll("[data-review-success]").forEach(function (el) {
      el.hidden = false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    var wrap = document.querySelector("[data-review-form]");
    if (wrap) wrap.hidden = true;
  }

  function showError(message) {
    document.querySelectorAll("[data-review-error]").forEach(function (el) {
      el.textContent = message;
      el.hidden = false;
    });
  }

  function onSubmit(event) {
    event.preventDefault();

    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var buttonLabel = button ? button.textContent : "";

    document.querySelectorAll("[data-review-error]").forEach(function (el) {
      el.hidden = true;
    });

    var fd = new FormData(form);

    // Solange keine Datenquelle gesetzt ist, wird bewusst nichts gesendet.
    if (isPreviewMode()) {
      showError(t.demoSubmit);
      return;
    }

    var payload = {
      // Referenznummer ist eine undurchsichtige Zeichenkette
      // (SRV-, PAC-, TRA-, TUR- oder INV-Praefix) – keine Musterpruefung.
      refNr: fd.get("refNr") || "",
      rating: Number(fd.get("rating")),
      service: fd.get("service") || "",
      text: fd.get("text") || "",
      name: fd.get("name") || "",
      country: fd.get("country") || "",
      consent: !!fd.get("consent"),
      locale: fd.get("locale") || lang,
      botField: fd.get("bot-field") || "",
      sourceUrl: window.location.href.split("#")[0]
    };

    if (button) {
      button.disabled = true;
      button.textContent = t.sending;
    }

    function restoreButton() {
      if (button) {
        button.disabled = false;
        button.textContent = buttonLabel;
      }
    }

    fetch(AMD_REVIEWS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (data && data.ok) {
          showSuccess();
          return;
        }
        restoreButton();
        showError(data && data.error === "already_reviewed" ? t.errAlready : t.errGeneric);
      })
      .catch(function () {
        restoreButton();
        showError(t.errGeneric);
      });
  }

  function init() {
    load();
    initForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
