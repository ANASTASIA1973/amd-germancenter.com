export async function handler(event) {
  try {
    const pid = (event.queryStringParameters?.pid || "").trim();
    const partnerId = pid.replace(/[^A-Za-z0-9_-]/g, ""); // basic hardening

    const GAS_EXEC_URL = process.env.GAS_EXEC_URL; // z.B. https://script.google.com/macros/s/...../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // AMD_2026_WEBHOOK__...
    const DEFAULT_DEST = "/en/"; // immer auf englisch starten

    if (!partnerId) {
      return {
        statusCode: 302,
        headers: { Location: DEFAULT_DEST }
      };
    }

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      // Wenn Env fehlt: lieber sauber auf EN mit Partner gehen (ohne Token)
      return {
        statusCode: 302,
        headers: { Location: `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}&err=cfg` }
      };
    }

    // Token holen (dein Script: mode=qr_check, partner=..., secret=...)
    const url =
      `${GAS_EXEC_URL}?mode=qr_check` +
      `&partner=${encodeURIComponent(partnerId)}` +
      `&secret=${encodeURIComponent(WEBHOOK_SECRET)}`;

    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok || !data.token) {
      return {
        statusCode: 302,
        headers: { Location: `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}&err=tok` }
      };
    }

    // Weiter auf deine Domain (EN Startseite) mit partner + token
    const dest =
      `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}` +
      `&token=${encodeURIComponent(data.token)}`;

    return {
      statusCode: 302,
      headers: {
        "Cache-Control": "no-store",
        Location: dest
      }
    };
  } catch (e) {
    // Fallback: nicht kaputt gehen, sondern wenigstens auf EN mit Partner
    const pid = (event.queryStringParameters?.pid || "").trim();
    const partnerId = pid.replace(/[^A-Za-z0-9_-]/g, "");
    return {
      statusCode: 302,
      headers: {
        Location: partnerId ? `/en/?partner=${encodeURIComponent(partnerId)}&err=ex` : "/en/"
      }
    };
  }
}
