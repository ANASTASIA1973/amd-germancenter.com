
AMD German Center – Mehrsprachiges Website-Gerüst
-------------------------------------------------
Ordner:
- /de  : deutsche Seiten
- /en  : englische Seiten
- /ar  : arabische Seiten
- /assets/css : globale Styles
- /assets/js  : globale Scripts
- /assets/img : Bilder (Platzhalter)

Öffne diesen Ordner in VS Code. Die eigentlichen Inhalte/Layouts füllen wir Schritt für Schritt.
# AMD German Center - Services Seite (Behörden- & Dokumentenservice)

## 📦 Was ist enthalten?

### 1. **services.html** - Vollständige Services-Seite
Eine professionelle, vollständig funktionierende Seite für Behörden- und Dokumentenservices im Libanon und Deutschland.

**Features:**
- ✅ 8 detaillierte Service-Kategorien mit Listen
- ✅ Professionelles Hero-Banner
- ✅ Prozess-Darstellung in 4 Schritten
- ✅ Vorteile-Sektion mit 6 Features
- ✅ Call-to-Action Bereich
- ✅ **Identisches Anfrageformular** wie bei Pauschalreisen
- ✅ **Session Storage** für Token-Persistenz (Formulardaten bleiben beim Hin- und Herklicken erhalten)
- ✅ Modal mit Drag-Funktionalität
- ✅ WhatsApp & E-Mail Integration
- ✅ Google Sheets Integration für Lead-Tracking
- ✅ SEO-optimiert mit Schema.org Markup
- ✅ Responsive Design
- ✅ Mehrsprachige Navigation (DE/AR/EN)

### 2. **services.css** - Professionelles Design
Passt perfekt zum bestehenden Design der Website (package-tours.html).

**Design-Features:**
- Gleiche Farbpalette und Stil wie Pauschalreisen
- Moderne Karten-Layouts
- Hover-Effekte
- Responsive für alle Bildschirmgrößen
- Professionelle Schatten und Übergänge

### 3. **generate_service_images.html** - Bildgenerator
Eine HTML-Datei zum Generieren aller benötigten Service-Bilder.

**Generierte Bilder:**
1. `service-behoerden.jpg` - Dokumenten-Icon für Behördengänge
2. `service-uebersetzung.jpg` - Sprachsymbole (DE/AR/EN)
3. `service-apostille.jpg` - Stempel-Design für Beglaubigungen
4. `service-visum.jpg` - Visum/Pass-Design
5. `hero-services.jpg` - Großes Hero-Banner (1920x1080)

## 🚀 Installation

### Schritt 1: Dateien hochladen
```
/de/services.html          → Hauptseite
/assets/css/services.css   → Stylesheet
```

### Schritt 2: Bilder generieren
1. Öffnen Sie `generate_service_images.html` im Browser
2. Warten Sie 1-2 Sekunden, bis alle Bilder generiert sind
3. Klicken Sie auf die Download-Links
4. Laden Sie die Bilder hoch nach: `/assets/img/`

**Erforderliche Bilder:**
```
/assets/img/service-behoerden.jpg
/assets/img/service-uebersetzung.jpg
/assets/img/service-apostille.jpg
/assets/img/service-visum.jpg
/assets/img/hero-services.jpg
```

### Schritt 3: Navigation aktualisieren
Die Navigation ist bereits in `services.html` korrekt eingebunden. 
In `index.html` ist der Link bereits vorhanden:
```html
<a href="./services.html" class="amd-nav-link">Services</a>
```

## 🎯 Features im Detail

### 📋 8 Service-Kategorien

1. **Dokumentenbeschaffung im Libanon**
   - Geburtsurkunden, Heiratsurkunden, Sterbeurkunden
   - Führungszeugnisse
   - Schulzeugnisse & Diplome
   - Grundbuchauszüge
   - Handelsregisterauszüge

2. **Beglaubigte Übersetzungen**
   - Deutsch ↔ Arabisch ↔ Englisch
   - Für Behörden & Gerichte
   - Express-Service

3. **Apostille & Legalisierung**
   - Internationale Anerkennung
   - Botschaftsbeglaubigungen
   - Außenministerium

4. **Visum & Aufenthaltserlaubnis**
   - Visa-Antrag & Bearbeitung
   - Residence Permit
   - Arbeitserlaubnis

5. **Behördengänge in Deutschland**
   - Dokumentenbeschaffung bei deutschen Behörden
   - Vollmachtsservice
   - Postweiterleitung

6. **Vollmachten & Notarservice**
   - Generalvollmachten
   - Notarielle Beglaubigungen
   - Verträge

7. **Express-Service**
   - Beschleunigte Bearbeitung
   - 24-48h Eilübersetzungen
   - Kurier-Service

8. **Persönliche Beratung & Begleitung**
   - Individuelle Beratung
   - Begleitung zu Ämtern
   - Dolmetscher-Service

### 💾 Token-Persistenz (Session Storage)

**Problem gelöst:** Formulardaten gehen beim Navigieren verloren

**Lösung:** Automatische Speicherung im Session Storage

**Wie es funktioniert:**
```javascript
// Speichert automatisch bei jeder Eingabe
form.addEventListener('input', saveFormData);
form.addEventListener('change', saveFormData);

// Lädt Daten beim Öffnen des Modals
const observer = new MutationObserver(() => {
  if (modal.getAttribute('aria-hidden') === 'false') {
    loadFormData();
  }
});
```

**Vorteile:**
- ✅ Daten bleiben beim Hin- und Herklicken zwischen Seiten erhalten
- ✅ Daten bleiben beim Schließen und Wiederöffnen des Modals erhalten
- ✅ Daten werden beim Schließen des Browsers gelöscht (Session-basiert)
- ✅ Keine Cookies notwendig

### 📧 Formular-Integration

**Identisches Design wie Pauschalreisen:**
- Gleiche Feldstruktur
- Gleiche Button-Styles
- Gleiche Validierung
- Gleiche Modal-Animation

**Zusätzliche Felder für Services:**
- Gewünschter Service (Dropdown)
- Dringlichkeit (Normal/Dringend/Express)
- Bevorzugter Kontaktweg

**Integration:**
```javascript
// WhatsApp
const url = `https://wa.me/96181622668?text=${encodeURIComponent(buildText())}`;

// E-Mail
window.location.href = `mailto:info@amd-germancenter.com?subject=${subject}&body=${body}`;

// Google Sheets Lead-Tracking
fetch("https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec", {
  method: "POST",
  mode: "no-cors",
  body: JSON.stringify(payload)
});
```

## 🎨 Design-Philosophie

### Professionelle Werbung
**Wie werben wir uns?**

1. **Vertrauenswürdig:** 
   - Klare Strukturen
   - Transparente Prozesse
   - Kostenlose Beratung betont

2. **Kompetent:**
   - Detaillierte Service-Listen
   - Mehrsprachigkeit hervorgehoben
   - Lokale Expertise kommuniziert

3. **Kundenorientiert:**
   - 24/7 Service prominent
   - Einfache Kontaktmöglichkeiten
   - Persönliche Betreuung betont

4. **Modern & Digital:**
   - WhatsApp-Integration
   - Responsive Design
   - Schnelle Ladezeiten

### Farben & Stil
- **Primärfarbe:** `#c1272d` (AMD Rot)
- **Akzentfarbe:** `#1b6f5a` (AMD Grün)
- **Hintergrund:** Subtile Gradienten
- **Karten:** Weißer Hintergrund mit Schatten
- **Schriften:** Klare Sans-Serif

## 📱 Responsive Design

**Breakpoints:**
- Desktop: > 900px (3 Spalten Grid)
- Tablet: 640px - 900px (2 Spalten Grid)
- Mobile: < 640px (1 Spalte)

**Mobile Optimierungen:**
- Größere Touch-Targets
- Vereinfachte Navigation
- Angepasste Schriftgrößen
- Optimierte Bilder

## 🔧 Technische Details

### SEO-Optimierung
```html
<!-- Meta Tags -->
<title>Behörden- & Dokumentenservice Libanon | AMD German Center</title>
<meta name="description" content="..." />

<!-- Open Graph -->
<meta property="og:title" content="..." />
<meta property="og:image" content="..." />

<!-- Schema.org Markup -->
<script type="application/ld+json">
{
  "@type": "Service",
  "name": "Behörden- und Dokumentenservice",
  ...
}
</script>
```

### Accessibility
- Semantisches HTML
- ARIA-Labels
- Keyboard-Navigation
- Focus-States
- Alt-Texte für Bilder

### Performance
- Lazy Loading für Bilder
- Optimierte CSS (keine doppelten Regeln)
- Minimales JavaScript
- Preload für Hero-Image

## 📊 Analytics & Tracking

**Google Sheets Integration:**
Die Seite tracked automatisch alle Anfragen:
- Zeitstempel
- Service
- Kontaktdaten
- Nachricht
- Kanal (WhatsApp/Email)
- Aktion (Click)

**Script URL in services.html:**
```javascript
fetch("https://script.google.com/macros/s/AKfycbxpqRsXKs08KFQ0VRlsCBMWoRpXa6D_7hpuSqDMFo6xn3-ZyMq0Tv3-Yva-2_Wh3MuN/exec", ...)
```

## 🔄 Wartung & Updates

### Preise ändern
Keine Preise auf dieser Seite - alles basiert auf individuellen Angeboten.

### Services hinzufügen
1. Neuen `.srv-card` Block kopieren
2. Bild ändern
3. Titel & Liste anpassen
4. Service zum Dropdown hinzufügen

### Texte anpassen
Alle Texte sind direkt im HTML editierbar:
- Hero-Titel & Untertitel
- Service-Beschreibungen
- Prozess-Schritte
- Vorteile

## 📞 Kontakt-Informationen

**WhatsApp:** +961 81 622 668
**E-Mail:** info@amd-germancenter.com

(Diese sind bereits in der Seite integriert)

## ✅ Checkliste vor dem Go-Live

- [ ] Alle Bilder hochgeladen (`/assets/img/`)
- [ ] `services.html` nach `/de/` hochgeladen
- [ ] `services.css` nach `/assets/css/` hochgeladen
- [ ] Navigation in anderen Seiten aktualisiert
- [ ] Google Sheets Script-URL angepasst
- [ ] Alle Links getestet
- [ ] Formular getestet (WhatsApp & E-Mail)
- [ ] Responsive Design getestet
- [ ] Session Storage getestet (Hin- und Herklicken)
- [ ] SEO-Tags überprüft
- [ ] Ladegeschwindigkeit getestet

## 🎉 Fertig!

Die Services-Seite ist produktionsbereit und bietet:
- ✅ Professionelles Design
- ✅ Vollständige Funktionalität
- ✅ Token-Persistenz
- ✅ SEO-Optimierung
- ✅ Mobile-First Approach
- ✅ Lead-Tracking
- ✅ Mehrsprachigkeit

**Viel Erfolg mit Ihrer neuen Services-Seite! 🚀**
