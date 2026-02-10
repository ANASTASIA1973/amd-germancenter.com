// netlify/functions/leads.js
export async function handler(event) {
  // CORS (so your browser can POST without hacks like no-cors)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  // Only POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const GAS_EXEC_URL = process.env.GAS_EXEC_URL; // https://script.google.com/macros/s/.../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // stored only in Netlify

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Missing server configuration",
          missing: {
            GAS_EXEC_URL: !GAS_EXEC_URL,
            WEBHOOK_SECRET: !WEBHOOK_SECRET,
          },
        }),
      };
    }

    // Parse incoming JSON body
    let incoming = {};
    try {
      incoming = JSON.parse(event.body || "{}") || {};
    } catch (_) {
      incoming = {};
    }

     // Normalize/sanitize
    const ALLOWED = new Set(["tours", "transfer", "car_rental", "package_tours", "services"]);

    const incomingServiceRaw = String(incoming.service || "").trim();
    const incomingPageRaw = String(incoming.page || "").trim();

    // category must be one of the allowed services for Apps Script
    let service = "services";
    if (ALLOWED.has(incomingServiceRaw)) service = incomingServiceRaw;
    else if (ALLOWED.has(incomingPageRaw)) service = incomingPageRaw;

    const page = incomingPageRaw || service;
  const locale = String(incoming.locale || incoming.lang || "").trim().toLowerCase() || "en";
const lang = String(incoming.lang || incoming.language || locale || "").trim().toLowerCase() || locale;


    // if frontend sent a service detail like "Translations", keep it separately
    const serviceDetail =
      (!ALLOWED.has(incomingServiceRaw) && incomingServiceRaw) ? incomingServiceRaw : "";

    let partnerId = incoming.partnerId;
    if (partnerId != null) {
      partnerId = String(partnerId).trim().replace(/[^A-Za-z0-9_-]/g, "");
      if (!partnerId) partnerId = ""; // keep empty consistent
    } else {
      partnerId = "";
    }
    // Fallback: some pages send partner / pid instead of partnerId (QR links)
const partnerAltRaw = incoming.partner ?? incoming.pid ?? "";
let partnerAlt = String(partnerAltRaw || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
if (!partnerId && partnerAlt) partnerId = partnerAlt;

   // Build payload for Apps Script
const payload = {
  ...incoming,
  service,
  page,
  locale,
   lang: locale,

  // Partner: send in all common keys so the Apps Script can match reliably
  ...(partnerId ? { partnerId, partner: partnerId, pid: partnerId } : {}),

  // Avoid collision with Apps Script RPC routing ("action")
  ...(incoming.action ? { leadAction: String(incoming.action) } : {}),

  secret: WEBHOOK_SECRET, // server-side only
};

// Ensure Apps Script does not see "action" (it may treat it as RPC command)
delete payload.action;


    // Never forward client-provided secret if any
    delete payload.WEBHOOK_SECRET;
    delete payload.webhookSecret;
    delete payload.secretFromClient;
        // CRITICAL: never forward any "action" field from the browser.
    // If Apps Script sees p.action, it switches to portal routing => "Unknown action".
    delete payload.action;
    delete payload.leadAction;

    // and ensure the only secret is ours:
    payload.secret = WEBHOOK_SECRET;

    const res = await fetch(GAS_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Upstream error",
          status: res.status,
          upstream: data || text || null,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        upstream: data || text || null,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(e?.message || e || "Unknown error"),
      }),
    };
  }
}
