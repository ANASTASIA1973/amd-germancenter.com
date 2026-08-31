// assets/js/contact-form.js
//
// Verschickt das Kontaktformular auf /de|/en|/ar/contact.html per JavaScript,
// damit zwei Dinge gleichzeitig passieren:
//
//   1. Die Einsendung geht wie bisher an Netlify Forms - das Archiv im
//      Dashboard bleibt erhalten und ist das Sicherheitsnetz.
//   2. Die Meldung ans Buero geht ueber die eigene Funktion /contact und von
//      dort ueber den IONOS-Versand der Transfer-Seite.
//
// Warum ueberhaupt: Die Benachrichtigung von Netlify Forms kam von
// formresponses@netlify.com, trug als Anzeigenamen aber "amd-germancenter.com"
// - die Domain des Empfaengers selbst. An info@amd-tarifcheck.de wurde sie
// zugestellt, an info@amd-germancenter.com am 31.08.2026 nicht.
//
// Ohne JavaScript bleibt das Formular funktionsfaehig: Der Browser schickt es
// dann wie bisher direkt an Netlify Forms ab. Nur die Mail entfaellt in dem
// Fall - die Anfrage ist trotzdem erfasst.

(function () {
  "use strict";

  var TEXTE = {
    de: {
      senden: "Wird gesendet …",
      erfolg: "Vielen Dank! Ihre Nachricht ist bei uns eingegangen. Wir melden uns in Kürze bei Ihnen.",
      fehler: "Ihre Nachricht konnte gerade nicht gesendet werden. Bitte versuchen Sie es noch einmal oder schreiben Sie an info@amd-germancenter.com.",
    },
    en: {
      senden: "Sending …",
      erfolg: "Thank you! We have received your message and will get back to you shortly.",
      fehler: "Your message could not be sent right now. Please try again or email us at info@amd-germancenter.com.",
    },
    ar: {
      senden: "جارٍ الإرسال …",
      erfolg: "شكراً لك! لقد استلمنا رسالتك وسنتواصل معك قريباً.",
      fehler: "تعذّر إرسال رسالتك الآن. يرجى المحاولة مرة أخرى أو مراسلتنا على info@amd-germancenter.com.",
    },
  };

  function texteFuerSeite() {
    var lang = String(document.documentElement.lang || "de").toLowerCase().slice(0, 2);
    return TEXTE[lang] || TEXTE.de;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector('form[name="contact"]');
    if (!form) return;

    var T = texteFuerSeite();
    var knopf = form.querySelector('button[type="submit"]');
    var knopfText = knopf ? knopf.textContent : "";

    // Meldezeile. role="status" sorgt dafuer, dass Screenreader die Antwort
    // vorlesen, ohne dass der Fokus wegspringt.
    var meldung = document.createElement("p");
    meldung.className = "form-status";
    meldung.setAttribute("role", "status");
    meldung.setAttribute("aria-live", "polite");
    meldung.hidden = true;
    form.appendChild(meldung);

    var laeuft = false;

    function zeige(text, art) {
      meldung.textContent = text;
      meldung.className = "form-status is-" + art;
      meldung.hidden = false;
    }

    /** Netlify Forms erwartet die Felder als klassische Formulardaten. */
    function alsFormulardaten(daten) {
      var teile = [];
      daten.forEach(function (wert, name) {
        teile.push(encodeURIComponent(name) + "=" + encodeURIComponent(wert));
      });
      return teile.join("&");
    }

    form.addEventListener("submit", function (ereignis) {
      // Ohne gueltige Pflichtfelder uebernimmt der Browser wie gewohnt.
      if (!form.checkValidity()) return;

      ereignis.preventDefault();
      if (laeuft) return;
      laeuft = true;

      var daten = new FormData(form);

      if (knopf) {
        knopf.disabled = true;
        knopf.textContent = T.senden;
      }
      zeige(T.senden, "warten");

      // Beide Wege gleichzeitig anstossen. Das Archiv bei Netlify Forms ist
      // der wichtigere von beiden - deshalb entscheidet SEIN Ergebnis
      // darueber, ob der Absender eine Bestaetigung sieht. Bleibt nur die
      // Mail aus, ist die Anfrage trotzdem erfasst und wir schweigen darueber.
      var anArchiv = fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: alsFormulardaten(daten),
      });

      var anMail = fetch("/.netlify/functions/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: daten.get("name") || "",
          email: daten.get("email") || "",
          phone: daten.get("phone") || "",
          topic: daten.get("topic") || "",
          message: daten.get("message") || "",
          "bot-field": daten.get("bot-field") || "",
          locale: String(document.documentElement.lang || "de").slice(0, 2),
          sourceUrl: window.location.href,
        }),
      }).catch(function () {
        // Ein Fehler hier darf die Bestaetigung nicht kippen.
        return null;
      });

      Promise.all([anArchiv, anMail])
        .then(function (ergebnisse) {
          var archiv = ergebnisse[0];
          if (!archiv || !archiv.ok) throw new Error("Archiv hat abgelehnt");

          form.reset();
          zeige(T.erfolg, "gut");
          // Wieder freigeben: Das Formular ist leer, eine zweite Nachricht
          // waere eine neue - nicht dieselbe doppelt.
          if (knopf) {
            knopf.disabled = false;
            knopf.textContent = knopfText;
          }
        })
        .catch(function () {
          zeige(T.fehler, "schlecht");
          if (knopf) {
            knopf.disabled = false;
            knopf.textContent = knopfText;
          }
        })
        .finally(function () {
          laeuft = false;
        });
    });
  });
})();
