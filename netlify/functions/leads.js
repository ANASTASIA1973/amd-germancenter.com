// netlify/functions/leads.js
export async function handler(event) {
  // CORS (so your browser can POST without hacks like no-cors)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" })
    };
  }

  try {
    const GAS_EXEC_URL = process.env.GAS_EXEC_URL;      // https://script.google.com/macros/s/.../exec
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;  // stored only in Netlify

    if (!GAS_EXEC_URL || !WEBHOOK_SECRET) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing server configuration" })
      };
    }

    let incoming = {};
    try {
      incoming = JSON.parse(event.body || "{}") || {};
    } catch (_) {
      incoming = {};
    }

    // Canonical service key for Apps Script allow-list
    // IMPORTANT: keep this exact: "services"
    const payload = {
      ...incoming,
      service: "services",
      secret: WEBHOOK_SECRET
    };

    // Basic hardening / normalization (optional but helpful)
    payload.locale = String(payload.locale || "").trim().toLowerCase() || "en";
    payload.page = String(payload.page || "services").trim() || "services";

    // If partnerId missing but URL had ?partner=... in client, client should send it.
    // Still, sanitize partnerId server-side.
    if (payload.partnerId != null) {
      payload.partnerId = String(payload.partnerId).trim().replace(/[^A-Za-z0-9_-]/g, "");
    }

    const res = await fetch(GAS_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // GAS often returns JSON, but we’ll be defensive
    const text = await res.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Upstream error",
          status: res.status,
          upstream: data || text || null
        })
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, upstream: data || text || null })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e?.message || e || "Unknown error") })
    };
  }
}
