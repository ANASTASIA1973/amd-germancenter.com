export async function handler(event) {
  try {
    const pid = (event.queryStringParameters?.pid || "").trim();
    const partnerId = pid.replace(/[^A-Za-z0-9_-]/g, ""); // basic hardening

    const GAS_EXEC_URL = process.env.GAS_EXEC_URL;       // https://script.google.com/macros/s/.../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;   // AMD_2026_WEBHOOK__...
    const DEFAULT_DEST = "/en/";                         // always start EN

    if (!partnerId) {
      return { statusCode: 302, headers: { Location: DEFAULT_DEST } };
    }

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      // env missing -> still forward partner (no token)
      return {
        statusCode: 302,
        headers: { Location: `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}&err=cfg` }
      };
    }

   // Token holen (GAS: mode=qr_check, partnerId=..., secret=...)
const url =
  `${GAS_EXEC_URL}?mode=qr_check` +
  `&partnerId=${encodeURIComponent(partnerId)}` +
  `&secret=${encodeURIComponent(WEBHOOK_SECRET)}`;


    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok || !data.token) {
      return {
        statusCode: 302,
        headers: { Location: `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}&err=tok` }
      };
    }

  const dest =
  `${DEFAULT_DEST}?partner=${encodeURIComponent(partnerId)}` +
  `&token=${encodeURIComponent(data.token)}` +
  `&t=${encodeURIComponent(data.token)}`;


    return {
      statusCode: 302,
      headers: {
        "Cache-Control": "no-store",
        Location: dest
      }
    };
  } catch (e) {
    const pid = (event.queryStringParameters?.pid || "").trim();
    const partnerId = pid.replace(/[^A-Za-z0-9_-]/g, "");
    return {
      statusCode: 302,
      headers: {
        "Cache-Control": "no-store",
        Location: partnerId ? `/en/?partner=${encodeURIComponent(partnerId)}&err=ex` : "/en/"
      }
    };
  }
}
