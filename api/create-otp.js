// Sends the signup OTP through CloudNest (https://cloudnest.pythonanywhere.com).
// CloudNest owns the whole OTP lifecycle (generation, storage, expiry) on
// its side — we just ask it to send one and, later, ask it to verify one.
// No Firebase involved here at all anymore.

const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const CLOUDNEST_BASE = process.env.CLOUDNEST_BASE_URL || "https://cloudnest.pythonanywhere.com";

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const apiKey = process.env.CLOUDNEST_API_KEY;
    if (!apiKey) throw new Error("CLOUDNEST_API_KEY env var is missing");

    const { email } = req.body || {};
    const clean = String(email || "").trim().toLowerCase();
    if (!GMAIL_RE.test(clean)) {
      return res.status(400).json({ error: "Registration requires a valid @gmail.com address." });
    }

    const r = await fetch(`${CLOUDNEST_BASE}/api/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, email: clean }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j.success === false) {
      return res.status(r.status || 500).json({ error: j.error || j.message || "Could not send verification code." });
    }

    return res.status(200).json({ ok: true, message: "Verification code sent." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Could not send verification code." });
  }
};
