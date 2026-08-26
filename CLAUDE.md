# AMD German Center Website – Development Guide

## 🚀 Projekt-Übersicht

**Typ:** Statische Multi-Sprachen Website (HTML/CSS/JS)  
**Hosting:** Netlify (https://amd-germancenter.com)  
**Git:** GitHub – ANASTASIA1973/amd-germancenter.com  
**Sprachen:** Deutsch (de/), Englisch (en/), Arabisch (ar/)

---

## 🔐 KRITISCH: Multi-Account GitHub Setup

⚠️ **Diesen Rechner hat MEHRERE GitHub-Accounts:**
- `ANASTASIA1973` (ankokkinidou5@gmail.com) ← Dieses Projekt
- `arndtlucius` (arndtlucius@gmail.com) ← Andere Projekte

### Was könnte schiefgehen?
Windows Credential Manager speichert HTTPS-Tokens. Wenn ein generischer Token für den falschen Account dort liegt, schlägt `git push` mit:
```
remote: Permission denied to arndtlucius
fatal: 403
```

**Lösung:** Immer **repo-lokal** konfigurieren:
```bash
git config --local user.name "ANASTASIA1973"
git config --local user.email "ankokkinidou5@gmail.com"
git config --local credential.username ANASTASIA1973
```

Niemals `--global` verwenden! Das durcheinander die anderen Projekte.

---

## 🚫 SSH – NICHT VERWENDEN

❌ **`~/.ssh/` auf diesem Rechner anfassen ist tabu!**

Der `~/.ssh/` Ordner enthält Produktiv-SSH-Keys für fremde Server:
- `fidelior_testdeploy_ed25519` → 217.160.195.107
- `fidelior_testserver_ed25519` → 217.160.195.107  
- `id_ed25519_archivio_root` → 217.160.195.107

**Dieses Projekt braucht kein SSH.** Es läuft über HTTPS + GitHub.

---

## 📡 Deployment (Push → Live)

### Standard-Workflow
```bash
# 1. Änderungen committen
git add <files>
git commit -m "Beschreibung"

# 2. Pushen (Netlify horcht auf main)
git push origin main

# 3. Verify
# → Netlify baut automatisch
# → Live in ~1-2 Minuten auf amd-germancenter.com
```

### Wenn Push fehlschlägt
1. **Echte Fehlermeldung lesen** (PowerShell, nicht VS Code – der Dialog verschluckt sie)
2. Wenn `Permission denied to arndtlucius` → siehe GitHub-Setup oben
3. Credential Manager checken:
   ```powershell
   cmdkey /list | findstr github
   ```

---

## 🔑 Netlify-Umgebungsvariablen

Diese Seite hat keine `.env` im Projekt – alle Werte stehen ausschließlich in
Netlify (Site configuration → Environment variables).

| Variable | Wofür | Geheim? |
|---|---|---|
| `GAS_EXEC_URL` | Adresse der AMD System API (Apps Script) | ja |
| `WEBHOOK_SECRET` | Ausweis gegenüber dem Apps Script | ja |
| `MAIL_TRIGGER_SECRET` | Ausweis gegenüber dem zentralen Maildienst der Transfer-Seite. **Muss denselben Wert haben wie dort.** | ja |
| `MAIL_SERVICE_URL` | optional – nur nötig, wenn der Maildienst umzieht. Ohne diese Variable wird `https://transfer.amd-germancenter.com/.netlify/functions/send-mail-background` benutzt. | nein |

⚠️ **Fehlt `MAIL_TRIGGER_SECRET`, geht keine Bestätigungsmail raus.** Die
Anfrage landet trotzdem im Sheet und der Kunde sieht seine Referenznummer;
`leads.js` meldet dann `mailQueued:false` und die Seite verspricht bewusst
keine Mail. Im Netlify-Protokoll steht
`Mailversand uebersprungen: MAIL_TRIGGER_SECRET fehlt in Netlify`.

---

## 📁 Projekt-Struktur

```
/                    # Root → Netlify publish directory
├── index.html        # Startseite
├── netlify.toml      # Netlify-Konfiguration
├── /de               # Deutsche Seiten
├── /en               # Englische Seiten
├── /ar               # Arabische Seiten
├── /assets
│   ├── /css          # Globale Styles
│   ├── /js           # Globale Scripts
│   └── /img          # Bilder
└── /netlify/functions # Serverless Functions (Redirects)
```

### Netlify-Redirects (`netlify.toml`)
- `/r/*` → Redirect-Service (`/.netlify/functions/r?pid=:splat`)
- `/*/qr.html` → `/*/index.html` (301)

---

## ✏️ Häufige Änderungen

### Logo/Branding ändern
- Partner-Banner Logo: `index.html` (img src in nav)
- Global: `/assets/img/`

### Texte/Copy überarbeiten
- Direkt im HTML editierbar (z.B. `de/index.html`)
- Nach Commit: `git push` → Live in ~2 Min

### Neue Seite hinzufügen
```bash
# 1. HTML-Datei erstellen (z.B. /de/services.html)
# 2. Navigation aktualisieren (in allen Sprachversionen)
# 3. Stylesheet hinzufügen (/assets/css/services.css)
# 4. Commit & Push
```

---

## 🔍 Testing vor Deploy

**Lokal testen?** 
- Datei im Browser öffnen (file:// URLs funktionieren für statisches HTML)
- Oder einfach pushen → Netlify testet automatisch

**Responsiv?**
- Chrome DevTools (F12) → Device Toolbar

**Performance?**
- Netlify Analytics checken (nach dem Deploy)

---

## 📞 Kontakt & Accounts

**Website-Kontakt:**
- WhatsApp: +961 81 622 668
- E-Mail: info@amd-germancenter.com

**GitHub Issues & PRs:**
- Nur für Code-Changes verwenden
- Für Content-Changes: direkt HTML editieren + commit

---

## 🎯 Last-Minute-Checkliste vor Push

- [ ] Alle Änderungen lokal getestet
- [ ] `git status` zeigt nur gewollte Files
- [ ] Commit-Message ist aussagekräftig
- [ ] Git-Config ist repo-lokal richtig (see: GitHub Setup)
- [ ] `git push origin main` erfolgreich
- [ ] Netlify Deploy war erfolgreich (check: https://app.netlify.com)

---

*Zuletzt aktualisiert: 2026-08-10*
