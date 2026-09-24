// Hosts, auf die "next" zeigen darf (zusaetzlich zum eigenen Host der Anfrage,
// damit Deploy-Previews funktionieren). Alles andere faellt auf DEFAULT_DEST.
const NEXT_HOSTS = new Set([
  "amd-germancenter.com",
  "www.amd-germancenter.com",
  "neuewebsite.netlify.app",
]);

/**
 * Macht aus "next" einen relativen Pfad auf dieser Seite – oder "" wenn
 * next fehlt, fremd ist oder wieder auf eine Function zeigt (kein Open
 * Redirect, keine Schleife). partner/token/t/err werden entfernt; die
 * setzt der Aufrufer neu.
 */
function safeNext_(next, host) {
  const raw = String(next || "").trim();
  if (!raw) return "";

  let u;
  try {
    u = new URL(raw, "https://amd-germancenter.com");
  } catch (_) {
    return "";
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  const hostOk = NEXT_HOSTS.has(u.hostname) || (host && u.host === host);
  if (!hostOk) return "";
  // "//evil.com" waere als Location wieder eine fremde Adresse
  const path = "/" + u.pathname.replace(/^[\/\\]+/, "");
  if (path.startsWith("/.netlify/") || path.startsWith("/r/")) return "";

  ["partner", "token", "t", "err"].forEach((k) => u.searchParams.delete(k));
  return path + u.search + u.hash;
}

// Haengt Parameter an einen relativen Pfad an, ohne den Hash zu verlieren.
function withParams_(path, params) {
  const u = new URL(path, "https://amd-germancenter.com");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.pathname + u.search + u.hash;
}

export async function handler(event) {
  const DEFAULT_DEST = "/en/";                         // Einstieg ohne next (QR-Code /r/PID)
  const qs = event.queryStringParameters || {};
  const pid = (qs.pid || "").trim();
  const partnerId = pid.replace(/[^A-Za-z0-9_-]/g, ""); // basic hardening
  const base = safeNext_(qs.next, event.headers?.host) || DEFAULT_DEST;

  const go = (params) => ({
    statusCode: 302,
    headers: { "Cache-Control": "no-store", Location: withParams_(base, params) }
  });

  try {
    const GAS_EXEC_URL = process.env.GAS_EXEC_URL;       // https://script.google.com/macros/s/.../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;   // AMD_2026_WEBHOOK__...

    if (!partnerId) {
      return go({});
    }

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      // env missing -> still forward partner (no token)
      return go({ partner: partnerId, err: "cfg" });
    }

    // Token holen (GAS: mode=qr_check, partnerId=..., secret=...)
    const url =
      `${GAS_EXEC_URL}?mode=qr_check` +
      `&partnerId=${encodeURIComponent(partnerId)}` +
      `&secret=${encodeURIComponent(WEBHOOK_SECRET)}`;

    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok || !data.token) {
      return go({ partner: partnerId, err: "tok" });
    }

    return go({ partner: partnerId, token: data.token, t: data.token });
  } catch (e) {
    return go(partnerId ? { partner: partnerId, err: "ex" } : {});
  }
}
